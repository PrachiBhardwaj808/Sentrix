"""JSON endpoints consumed by the Next.js command center."""

from __future__ import annotations

import json
import base64
import hashlib
import os
import secrets
from datetime import datetime, timezone
from typing import Any, Callable

from django.core import signing
from django.contrib.auth.hashers import make_password
from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from . import blockchain
from .repository import repository
from ..services.cameras.connection import test_camera_connection
from ..services.cameras.relay import CameraRelayError, register_camera_relay
from ..services.inference.live import InferenceConfigurationError, detect_frame
from ..services.evidence.alert_store import get_alert_store
from ..services.evidence.firebase import get_status as firebase_status
from ..services.notifications.exotel import (
    ExotelConfigurationError,
    ExotelDeliveryError,
    get_status as exotel_status,
    send_sms,
)
from ..services.notifications.otp import (
    OtpConfig,
    cooldown_remaining,
    dispatch_message,
    expires_at,
    generate_otp,
    hash_otp,
    verify_otp,
)
from ..services.cameras.connection import test_camera_url
from ..services.analytics import CameraRuleEngine
from ..services.triage.agent import IncidentTriageAgent
from ..services.monitoring.metrics import get_metrics_registry
from ..services.notifications.firebase_fcm import get_status as fcm_status, send_alert_notification


class DispatchOtpRateLimitError(RuntimeError):
    """Raised when a guard dispatch OTP is requested too soon."""


_CAMERA_RULE_ENGINES: dict[str, CameraRuleEngine] = {}
_TRIAGE_AGENT = IncidentTriageAgent()


@require_http_methods(["GET"])
def health(request: HttpRequest) -> JsonResponse:
    return JsonResponse({
        "status": "ok",
        "service": "border-surveillance-django",
        "storage": "local-state",
        "auditChain": repository.audit_chain_status(),
        "firebaseOutbox": repository.firebase_outbox_status(),
        "fcm": {**fcm_status(), **repository.fcm_outbox_status()},
    })


@require_http_methods(["GET"])
def monitoring_metrics(request: HttpRequest) -> JsonResponse:
    session = _session_from_request(request)
    if not session or session.get("tier") not in {"admin", "command"}:
        return _error("command or administrator access is required", 403)
    camera_id = str(request.GET.get("cameraId") or "").strip() or None
    return JsonResponse({"metrics": get_metrics_registry().snapshot(camera_id)})


@require_http_methods(["GET"])
def audit_chain_status_view(request: HttpRequest) -> JsonResponse:
    session = _session_from_request(request)
    if not session or session.get("tier") not in {"admin", "command"}:
        return _error("command or administrator access is required", 403)
    try:
        limit = min(max(int(request.GET.get("limit", "25")), 1), 100)
    except (TypeError, ValueError):
        return _error("limit must be an integer", 400)
    return JsonResponse({
        "verification": repository.verify_audit_chain(),
        "entries": repository.audit_chain_entries(limit),
    })


@csrf_exempt
@require_http_methods(["POST"])
def auth_login(request: HttpRequest) -> JsonResponse:
    payload = _body(request)
    operator_id = str(payload.get("operatorId") or "").strip()
    passcode = str(payload.get("passcode") or "")
    if not operator_id or not passcode:
        return _error("operatorId and passcode are required")

    if _allow_demo_auth_users(request):
        repository.ensure_demo_auth_users()
    session = repository.authenticate_user(operator_id, passcode)
    if not session:
        _record_auth_event(request, operator_id, "login_failed", "password", False, "Invalid credentials")
        return _error("invalid operator credentials", 401)

    user = repository.get_auth_user(operator_id) or session
    if not _auth_two_factor_enabled():
        return _complete_authentication(request, user, "password")

    try:
        challenge = _issue_otp_challenge(request, user)
    except (ExotelConfigurationError, ExotelDeliveryError) as exc:
        _record_auth_event(request, operator_id, "login_failed", "password", False, str(exc))
        return _error(str(exc), 503)
    return JsonResponse({"requiresTwoFactor": True, **challenge})


@csrf_exempt
@require_http_methods(["POST"])
def auth_verify_otp(request: HttpRequest) -> JsonResponse:
    payload = _body(request)
    challenge_id = str(payload.get("challengeId") or "").strip()
    otp = str(payload.get("otp") or "").strip()
    challenge = repository.get_auth_challenge(challenge_id)
    if not challenge or challenge.get("used") or challenge.get("purpose") != "login":
        return _error("OTP challenge is invalid or has already been used", 401)
    if _is_expired(challenge.get("expiresAt")):
        repository.update("authChallenges", challenge_id, {"used": True, "status": "expired"})
        return _error("OTP has expired. Start login again.", 401)
    if int(challenge.get("attempts", 0)) >= 5:
        repository.update("authChallenges", challenge_id, {"used": True, "status": "locked"})
        return _error("Too many incorrect OTP attempts", 429)

    if not _check_hash(otp, str(challenge.get("codeHash") or "")):
        attempts = int(challenge.get("attempts", 0)) + 1
        repository.update("authChallenges", challenge_id, {"attempts": attempts})
        _record_auth_event(request, str(challenge.get("operatorId") or ""), "otp_failed", "otp", False, "Invalid OTP")
        return _error("invalid OTP", 401)

    repository.update("authChallenges", challenge_id, {"used": True, "status": "verified", "verifiedAt": _now()})
    user = repository.get_auth_user(str(challenge.get("operatorId") or ""))
    if not user:
        return _error("operator account no longer exists", 401)
    return _complete_authentication(request, user, str(challenge.get("delivery") or "sms_otp"))


@require_http_methods(["GET"])
def auth_audit(request: HttpRequest) -> JsonResponse:
    session = _session_from_request(request)
    if not session or session.get("tier") != "admin":
        return _error("administrator access is required", 403)
    limit = min(max(int(request.GET.get("limit", "100")), 1), 250)
    return JsonResponse({"events": repository.auth_audit(limit)})


@csrf_exempt
@require_http_methods(["POST"])
def auth_revoke(request: HttpRequest) -> JsonResponse:
    """Invalidate an operator's existing bearer sessions."""
    session = _session_from_request(request)
    if not session or session.get("tier") != "admin":
        return _error("administrator access is required", 403)
    payload = _body(request)
    operator_id = str(payload.get("operatorId") or "").strip()
    user = repository.get_auth_user(operator_id)
    if not user:
        return _error("operator account not found", 404)
    version = int(user.get("tokenVersion", 1)) + 1
    disabled = bool(payload.get("disabled", False))
    repository.update_auth_user(operator_id, {"tokenVersion": version, "disabled": disabled})
    _record_auth_event(request, operator_id, "session_revoked", "admin", True, "Bearer sessions invalidated")
    return JsonResponse({"revoked": True, "operatorId": operator_id, "disabled": disabled})


@require_http_methods(["GET"])
def exotel_status_view(request: HttpRequest) -> JsonResponse:
    return JsonResponse(exotel_status())


@csrf_exempt
@require_http_methods(["POST"])
def auth_passkey_options(request: HttpRequest) -> JsonResponse:
    payload = _body(request)
    operator_id = str(payload.get("operatorId") or "").strip()
    user = repository.get_auth_user(operator_id)
    if not user:
        return _error("operator account not found", 404)
    try:
        from webauthn import generate_authentication_options, options_to_json
        from webauthn.helpers.structs import PublicKeyCredentialDescriptor, UserVerificationRequirement
    except ImportError:
        return _error("passkey support is not installed on the backend", 503)

    credentials = user.get("passkeyCredentials") or []
    if not credentials:
        return _error("no Face ID/passkey is enrolled for this operator", 404)
    challenge = secrets.token_bytes(32)
    options = generate_authentication_options(
        rp_id=_webauthn_rp_id(),
        challenge=challenge,
        user_verification=UserVerificationRequirement.REQUIRED,
        allow_credentials=[
            PublicKeyCredentialDescriptor(id=_b64decode(str(item["id"])))
            for item in credentials
        ],
    )
    challenge_id = secrets.token_urlsafe(24)
    repository.create_auth_challenge({
        "id": challenge_id,
        "purpose": "passkey_login",
        "operatorId": operator_id,
        "challenge": _b64encode(challenge),
        "expiresAt": _future_iso(120),
        "createdAt": _now(),
        "used": False,
        "ipAddress": _client_ip(request),
    })
    return JsonResponse({"challengeId": challenge_id, "options": json.loads(options_to_json(options))})


@csrf_exempt
@require_http_methods(["POST"])
def auth_passkey_verify(request: HttpRequest) -> JsonResponse:
    payload = _body(request)
    challenge_id = str(payload.get("challengeId") or "").strip()
    credential = payload.get("credential")
    challenge = repository.get_auth_challenge(challenge_id)
    if not challenge or challenge.get("used") or challenge.get("purpose") != "passkey_login":
        return _error("passkey challenge is invalid or expired", 401)
    if _is_expired(challenge.get("expiresAt")):
        return _error("passkey challenge has expired", 401)
    user = repository.get_auth_user(str(challenge.get("operatorId") or ""))
    if not user or not isinstance(credential, dict):
        return _error("passkey credential is invalid", 401)
    stored = next(
        (item for item in user.get("passkeyCredentials", []) if str(item.get("id")) == str(credential.get("rawId") or credential.get("id"))),
        None,
    )
    if not stored:
        return _error("passkey is not registered for this operator", 401)
    try:
        from webauthn import verify_authentication_response
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=_b64decode(str(challenge["challenge"])),
            expected_rp_id=_webauthn_rp_id(),
            expected_origin=_webauthn_origin(),
            credential_public_key=_b64decode(str(stored["publicKey"])),
            credential_current_sign_count=int(stored.get("signCount", 0)),
            require_user_verification=True,
        )
    except Exception:
        return _error("passkey verification failed", 401)
    repository.update_auth_user(str(challenge["operatorId"]), {
        "passkeyCredentials": [
            {**item, "signCount": verification.new_sign_count if item is stored else item.get("signCount", 0)}
            for item in user.get("passkeyCredentials", [])
        ]
    })
    repository.update("authChallenges", challenge_id, {"used": True, "status": "verified", "verifiedAt": _now()})
    return _complete_authentication(request, user, "passkey")


@csrf_exempt
@require_http_methods(["POST"])
def auth_passkey_register_options(request: HttpRequest) -> JsonResponse:
    session = _session_from_request(request)
    if not session:
        return _error("authenticated session required", 401)
    user = repository.get_auth_user(str(session.get("operatorId") or ""))
    if not user:
        return _error("operator account not found", 404)
    try:
        from webauthn import generate_registration_options, options_to_json
        from webauthn.helpers.structs import AuthenticatorSelectionCriteria, PublicKeyCredentialDescriptor, UserVerificationRequirement
    except ImportError:
        return _error("passkey support is not installed on the backend", 503)
    challenge = secrets.token_bytes(32)
    options = generate_registration_options(
        rp_id=_webauthn_rp_id(),
        rp_name="Sentrix Command Center",
        user_name=str(user.get("operatorId")),
        user_display_name=str(user.get("name") or user.get("operatorId")),
        user_id=hashlib.sha256(str(user.get("operatorId")).encode("utf-8")).digest(),
        challenge=challenge,
        authenticator_selection=AuthenticatorSelectionCriteria(user_verification=UserVerificationRequirement.REQUIRED),
        exclude_credentials=[PublicKeyCredentialDescriptor(id=_b64decode(str(item["id"]))) for item in user.get("passkeyCredentials", [])],
    )
    challenge_id = secrets.token_urlsafe(24)
    repository.create_auth_challenge({
        "id": challenge_id,
        "purpose": "passkey_register",
        "operatorId": str(user.get("operatorId")),
        "challenge": _b64encode(challenge),
        "expiresAt": _future_iso(120),
        "createdAt": _now(),
        "used": False,
        "ipAddress": _client_ip(request),
    })
    return JsonResponse({"challengeId": challenge_id, "options": json.loads(options_to_json(options))})


@csrf_exempt
@require_http_methods(["POST"])
def auth_passkey_register_verify(request: HttpRequest) -> JsonResponse:
    session = _session_from_request(request)
    if not session:
        return _error("authenticated session required", 401)
    payload = _body(request)
    challenge_id = str(payload.get("challengeId") or "").strip()
    credential = payload.get("credential")
    challenge = repository.get_auth_challenge(challenge_id)
    if not challenge or challenge.get("used") or challenge.get("purpose") != "passkey_register":
        return _error("passkey registration challenge is invalid or expired", 401)
    if not isinstance(credential, dict):
        return _error("passkey credential is invalid", 400)
    try:
        from webauthn import verify_registration_response
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=_b64decode(str(challenge["challenge"])),
            expected_rp_id=_webauthn_rp_id(),
            expected_origin=_webauthn_origin(),
            require_user_verification=True,
        )
    except Exception:
        return _error("passkey registration failed", 400)
    user = repository.get_auth_user(str(session.get("operatorId") or ""))
    if not user:
        return _error("operator account not found", 404)
    credentials = list(user.get("passkeyCredentials") or [])
    credentials.append({
        "id": _b64encode(verification.credential_id),
        "publicKey": _b64encode(verification.credential_public_key),
        "signCount": verification.sign_count,
        "createdAt": _now(),
        "deviceType": str(verification.credential_device_type),
    })
    repository.update_auth_user(str(session.get("operatorId")), {"passkeyCredentials": credentials})
    repository.update("authChallenges", challenge_id, {"used": True, "status": "verified", "verifiedAt": _now()})
    return JsonResponse({"registered": True, "passkeyCount": len(credentials)})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def watchlist(request: HttpRequest) -> JsonResponse:
    session = _session_from_request(request)
    if not session:
        return _error("authenticated operator access is required", 401)
    if request.method == "GET":
        repository.ensure_demo_watchlist()
        return JsonResponse({"watchlistEntries": repository.snapshot().get("watchlistEntries", [])})

    if not session or session.get("tier") != "admin":
        return _error("administrator access is required", 403)

    payload = _body(request)
    entry_type = str(payload.get("type") or "").strip().lower()
    if entry_type not in {"plate", "face"}:
        return _error("watchlist type must be plate or face")
    value = str(payload.get("value") or "").strip()
    label = str(payload.get("label") or "").strip()
    reason = str(payload.get("reason") or "").strip()
    status = str(payload.get("status") or "Blacklisted").strip()
    allowed_statuses = {
        "Blacklisted",
        "Authorized",
        "Suspicious",
        "Missing Person",
        "Under Surveillance",
    }
    if not value or not label:
        return _error("value and label are required")
    if status not in allowed_statuses:
        return _error("unsupported watchlist status")

    normalized_value = "".join(value.upper().split()) if entry_type == "plate" else value.casefold()
    if any(
        str(item.get("type")) == entry_type
        and str(item.get("value", "")).casefold() == normalized_value.casefold()
        for item in repository.snapshot().get("watchlistEntries", [])
    ):
        return _error("watchlist value already exists", 409)

    entry = {
        "id": str(payload.get("id") or f"WATCH-{int(datetime.now(timezone.utc).timestamp() * 1000)}").upper(),
        "type": entry_type,
        "value": normalized_value,
        "label": label,
        "reason": reason,
        "status": status,
        "createdAt": _now(),
    }
    return JsonResponse({"entry": repository.upsert("watchlistEntries", entry)}, status=201)


@csrf_exempt
@require_http_methods(["DELETE"])
def watchlist_detail(request: HttpRequest, entry_id: str) -> JsonResponse:
    session = _session_from_request(request)
    if not session or session.get("tier") != "admin":
        return _error("administrator access is required", 403)
    if not repository.delete("watchlistEntries", entry_id):
        return _error("watchlist entry not found", 404)
    return JsonResponse({"deleted": entry_id})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def demo_profiles(request: HttpRequest) -> JsonResponse:
    """Manage non-biometric demo profiles used for manual operator review."""

    session = _session_from_request(request)
    if not session:
        return _error("authenticated operator access is required", 401)
    repository.ensure_demo_profiles()
    if request.method == "GET":
        return JsonResponse({"profiles": repository.snapshot().get("demoProfiles", [])})
    if session.get("tier") != "admin":
        return _error("administrator access is required", 403)

    payload = _body(request)
    display_name = str(payload.get("displayName") or "").strip()
    role = str(payload.get("role") or "Demo participant").strip()
    badge_id = str(payload.get("badgeId") or "").strip().upper()
    qr_code = str(payload.get("qrCode") or "").strip().upper()
    if not display_name or not badge_id or not qr_code:
        return _error("displayName, badgeId, and qrCode are required")
    profiles = repository.snapshot().get("demoProfiles", [])
    if any(str(item.get("badgeId", "")).casefold() == badge_id.casefold() for item in profiles):
        return _error("demo badge ID already exists", 409)
    if any(str(item.get("qrCode", "")).casefold() == qr_code.casefold() for item in profiles):
        return _error("demo QR code already exists", 409)
    profile = {
        "id": str(payload.get("id") or f"DEMO-PERSON-{secrets.token_hex(4).upper()}"),
        "displayName": display_name,
        "role": role,
        "badgeId": badge_id,
        "qrCode": qr_code,
        "profileImageUrl": "",
        "matchingEnabled": False,
        "createdAt": _now(),
    }
    return JsonResponse({"profile": repository.upsert("demoProfiles", profile)}, status=201)


@require_http_methods(["GET"])
def bootstrap(request: HttpRequest) -> JsonResponse:
    if not _session_from_request(request):
        return _error("authenticated operator access is required", 401)
    repository.ensure_demo_watchlist()
    repository.ensure_demo_profiles()
    data, firebase = _snapshot_with_firebase_alerts()
    return JsonResponse({
        "data": data,
        "meta": {"source": "django", "generatedAt": _now()},
        "blockchain": blockchain.get_status(),
        "firebase": firebase,
    })


@require_http_methods(["GET"])
def blockchain_status(request: HttpRequest) -> JsonResponse:
    return JsonResponse(blockchain.get_status())


@require_http_methods(["GET"])
def firebase_status_view(request: HttpRequest) -> JsonResponse:
    return JsonResponse({**_firebase_status_with_outbox(), "fcm": {**fcm_status(), **repository.fcm_outbox_status()}})


@csrf_exempt
@require_http_methods(["POST"])
def inference_frame(request: HttpRequest) -> JsonResponse:
    """Run the configured local AI model on one browser-captured JPEG frame."""
    if not _session_from_request(request):
        return _error("authenticated operator access is required", 401)
    if not request.body:
        return _error("frame body is empty")
    if len(request.body) > 4 * 1024 * 1024:
        return _error("frame is larger than the 4 MB inference limit", 413)
    if request.body[:3] != b"\xff\xd8\xff":
        return _error("inference frames must be JPEG images")
    requested_modules = [
        value.strip()
        for value in request.GET.get("modules", "").split(",")
        if value.strip()
    ]
    try:
        return JsonResponse(detect_frame(
            request.body,
            requested_modules or None,
            camera_id=str(request.GET.get("cameraId") or "local-preview"),
        ))
    except ValueError as exc:
        return _error(str(exc))
    except InferenceConfigurationError as exc:
        return _error(str(exc), 503)
    except Exception:
        return _error("AI inference failed for this frame", 503)


@csrf_exempt
@require_http_methods(["POST"])
def evaluate_camera_analytics(request: HttpRequest) -> JsonResponse:
    """Evaluate normalized detections and persist explainable AI alerts."""

    session = _session_from_request(request)
    if not session:
        return _error("authenticated operator access is required", 401)
    payload = _body(request)
    camera_id = str(payload.get("cameraId") or "").strip()
    detections = payload.get("detections") or []
    if not camera_id or not isinstance(detections, list):
        return _error("cameraId and detections are required")
    camera = repository.get("cameras", camera_id)
    if not camera:
        return _error("camera not found", 404)
    engine = _CAMERA_RULE_ENGINES.setdefault(camera_id, CameraRuleEngine())
    events = engine.evaluate(camera, detections, brightness=payload.get("brightness"))
    triage = _TRIAGE_AGENT.triage(camera_id, detections, location=camera.get("coordinates"))
    created: list[dict[str, Any]] = []
    firebase_results: list[dict[str, Any]] = []
    coordinates = camera.get("coordinates") or {"lat": 0, "lng": 0}
    for event in events:
        alert = {
            "id": f"ALT-AI-{secrets.token_hex(8).upper()}",
            "level": event["severity"],
            "timestamp": event["timestamp"],
            "sourceCameraId": camera_id,
            "sourceCameraName": camera.get("name") or camera_id,
            "eventType": event["eventType"],
            "confidence": round(float(event.get("confidence") or 0) * 100, 2),
            "coordinates": coordinates,
            "objectClass": event["objectClass"],
            "evidenceUrl": str(payload.get("evidenceUrl") or ""),
            "status": "open",
            "acknowledgedBy": None,
            "sector": event["sector"],
            "notes": f"Rule: {event['rule']}. {event['reason']}. Direction: {event['direction']}.",
            "evidenceSource": "ai_frame",
            "aiRule": event["rule"],
            "trackId": event.get("trackId"),
            "plateNumber": event.get("plateNumber"),
            "dispatchStatus": "unassigned",
        }
        if triage:
            alert.update({
                "incidentId": triage["incident_id"],
                "incidentStatus": triage["status"],
                "triageSeverity": triage["severity"],
                "triageExplanation": triage["explanation"],
                "operatorNotice": triage["operatorMessage"],
                "requiresOperatorReview": True,
            })
        if event.get("identityStatus") == "unidentified":
            alert.update({
                "identityStatus": "unidentified",
                "reviewStatus": "operator_review",
                "requiresOperatorReview": True,
            })
        saved = repository.upsert("alerts", alert)
        created.append(saved)
        firebase_results.append(_save_alert_to_firebase(saved))
    return JsonResponse({"events": events, "alerts": created, "firebase": firebase_results[-1] if firebase_results else firebase_status()})


@csrf_exempt
@require_http_methods(["POST"])
def triage_incident(request: HttpRequest) -> JsonResponse:
    """Fuse a batch of model observations into one reviewable incident."""

    session = _session_from_request(request)
    if not session:
        return _error("authenticated operator access is required", 401)
    payload = _body(request)
    camera_id = str(payload.get("cameraId") or "").strip()
    events = payload.get("events") or payload.get("detections") or []
    if not camera_id or not isinstance(events, list):
        return _error("cameraId and events are required")
    camera = repository.get("cameras", camera_id)
    if not camera:
        return _error("camera not found", 404)
    incident = _TRIAGE_AGENT.triage(camera_id, events, location=camera.get("coordinates"))
    return JsonResponse({"incident": incident, "humanReviewRequired": True})


@csrf_exempt
@require_http_methods(["POST"])
def create_guard(request: HttpRequest) -> JsonResponse:
    session = _session_from_request(request)
    if not session or session.get("tier") != "admin":
        return _error("administrator access is required", 403)

    payload = _body(request)
    name = str(payload.get("name") or "").strip()
    rank = str(payload.get("rank") or "").strip()
    badge_id = str(payload.get("badgeId") or "").strip().upper()
    operator_id = str(payload.get("operatorId") or badge_id).strip().upper()
    passcode = str(payload.get("passcode") or "")
    if not name or not rank or not badge_id or not operator_id:
        return _error("name, rank, badgeId, and operatorId are required")
    if len(passcode) < 6:
        return _error("passcode must be at least 6 characters")
    if str(payload.get("status") or "off_duty") not in {
        "on_post",
        "patrolling",
        "break",
        "unreachable",
        "off_duty",
    }:
        return _error("status must be on_post, patrolling, break, unreachable, or off_duty")

    guard_id = str(payload.get("id") or f"G-{badge_id}").strip().upper()
    if not guard_id:
        return _error("guard id is required")
    access_tier = _access_tier_for_rank(rank)
    guard = {
        "id": guard_id,
        "name": name,
        "rank": rank,
        "badgeId": badge_id,
        "photoUrl": str(payload.get("photoUrl") or ""),
        "phone": str(payload.get("phone") or ""),
        "emergencyContact": {
            "name": str(payload.get("emergencyContactName") or ""),
            "phone": str(payload.get("emergencyContactPhone") or ""),
            "relation": str(payload.get("emergencyContactRelation") or ""),
        },
        "callSign": str(payload.get("callSign") or guard_id),
        "certifications": [
            item.strip()
            for item in str(payload.get("certifications") or "").split(",")
            if item.strip()
        ],
        "bloodGroup": str(payload.get("bloodGroup") or ""),
        "status": str(payload.get("status") or "off_duty"),
        "currentPostId": str(payload.get("postId") or "") or None,
        "currentSector": str(payload.get("sector") or "") or None,
        "shiftStart": str(payload.get("shiftStart") or ""),
        "shiftEnd": str(payload.get("shiftEnd") or ""),
        "attendanceHistory": [],
    }
    auth_user = {
        "id": operator_id,
        "operatorId": operator_id,
        "passwordHash": make_password(passcode),
        "name": name,
        "rank": rank,
        "role": "Guard access",
        "tier": access_tier,
        "tokenVersion": 1,
        "disabled": False,
        "phone": str(payload.get("phone") or ""),
        "passkeyCredentials": [],
    }
    try:
        created = repository.create_guard_with_credentials(guard, auth_user)
    except ValueError as exc:
        return _error(str(exc), 409)
    return JsonResponse({"guard": created, "accessTier": access_tier}, status=201)


@csrf_exempt
@require_http_methods(["POST"])
def dispatch_alert(request: HttpRequest, alert_id: str) -> JsonResponse:
    session = _session_from_request(request)
    if not session or session.get("tier") not in {"admin", "command"}:
        return _error("command or administrator access is required", 403)
    payload = _body(request)
    guard_id = str(payload.get("guardId") or "").strip()
    guard = repository.get("guards", guard_id)
    alert = repository.get("alerts", alert_id)
    if not guard:
        return _error("guard not found", 404)
    if not alert:
        return _error("alert not found", 404)

    current = repository.snapshot().get("currentUser", {})
    try:
        otp_delivery = _issue_dispatch_otp(request, alert, guard)
    except DispatchOtpRateLimitError as exc:
        return _error(str(exc), 429)
    updated = repository.update("alerts", alert_id, {
        "assignedGuardId": guard_id,
        "assignedGuardName": guard.get("name"),
        "dispatchStatus": "dispatched",
        "dispatchedAt": _now(),
        **otp_delivery["alertFields"],
    })
    log = _activity(
        actor_id=str(current.get("badgeId") or "SYSTEM"),
        actor_name=str(payload.get("actorName") or session.get("name") or current.get("name") or "SYSTEM"),
        action_type="guard_dispatched",
        target_type="alert",
        target_id=alert_id,
        sector=str(alert.get("sector") or "All Sectors"),
        details=f"Dispatched {guard.get('name')} to {alert.get('eventType', 'incident')} at {alert.get('sector', 'All Sectors')}. Guard verification: {otp_delivery['alertFields'].get('dispatchOtpStatus', 'unknown').upper()}.",
    )
    firebase = _save_alert_to_firebase(updated or alert)
    response = {"alert": updated, "activity": log, "firebase": firebase, "dispatchOtp": otp_delivery["client"]}
    if firebase.get("alertsSynced") is False:
        response["error"] = "Alert dispatch was saved locally but could not be updated in Firebase."
    return JsonResponse(response, status=503 if firebase.get("alertsSynced") is False else 200)


@csrf_exempt
@require_http_methods(["POST"])
def resend_dispatch_sms(request: HttpRequest, alert_id: str) -> JsonResponse:
    session = _session_from_request(request)
    if not session or session.get("tier") not in {"admin", "command"}:
        return _error("command or administrator access is required", 403)
    alert = repository.get("alerts", alert_id)
    if not alert:
        return _error("alert not found", 404)
    guard_id = str(alert.get("assignedGuardId") or "")
    guard = repository.get("guards", guard_id)
    if not guard:
        return _error("a guard must be assigned before resending SMS", 400)
    try:
        otp_delivery = _issue_dispatch_otp(request, alert, guard)
    except DispatchOtpRateLimitError as exc:
        return _error(str(exc), 429)
    updated = repository.update("alerts", alert_id, otp_delivery["alertFields"])
    firebase = _save_alert_to_firebase(updated or alert)
    return JsonResponse({"alert": updated, "firebase": firebase, "dispatchOtp": otp_delivery["client"]})


@csrf_exempt
@require_http_methods(["POST"])
def verify_dispatch_otp(request: HttpRequest, alert_id: str) -> JsonResponse:
    """Verify the one-time code held by the guard receiving a dispatch."""

    payload = _body(request)
    challenge_id = str(payload.get("challengeId") or "").strip()
    guard_id = str(payload.get("guardId") or "").strip()
    otp = str(payload.get("otp") or "").strip()
    challenge = repository.get_dispatch_challenge(challenge_id)
    if not challenge or challenge.get("purpose") != "guard_dispatch":
        return _error("dispatch OTP challenge is invalid", 401)
    if str(challenge.get("alertId")) != str(alert_id) or str(challenge.get("guardId")) != guard_id:
        return _error("dispatch OTP challenge does not match this incident", 401)
    if challenge.get("used"):
        return _error("dispatch OTP has already been used", 401)

    config = OtpConfig.from_env()
    if _is_expired(challenge.get("expiresAt")):
        repository.update("dispatchChallenges", challenge_id, {"used": True, "status": "expired"})
        repository.update("alerts", alert_id, {"dispatchOtpStatus": "expired"})
        return _error("dispatch OTP has expired", 401)
    attempts = int(challenge.get("attempts", 0))
    if attempts >= config.max_attempts:
        repository.update("dispatchChallenges", challenge_id, {"used": True, "status": "locked"})
        return _error("too many incorrect dispatch OTP attempts", 429)
    if not verify_otp(otp, str(challenge.get("codeHash") or "")):
        attempts += 1
        changes: dict[str, Any] = {"attempts": attempts}
        if attempts >= config.max_attempts:
            changes.update({"used": True, "status": "locked"})
        repository.update("dispatchChallenges", challenge_id, changes)
        return _error("invalid dispatch OTP", 401)

    verified_at = _now()
    repository.update("dispatchChallenges", challenge_id, {"used": True, "status": "verified", "verifiedAt": verified_at})
    updated = repository.update("alerts", alert_id, {
        "dispatchStatus": "verified",
        "dispatchOtpStatus": "verified",
        "dispatchVerifiedAt": verified_at,
    })
    guard = repository.get("guards", guard_id) or {}
    alert = updated or repository.get("alerts", alert_id) or {}
    log = _activity(
        actor_id=guard_id,
        actor_name=str(guard.get("name") or "Assigned guard"),
        action_type="guard_dispatch_verified",
        target_type="alert",
        target_id=alert_id,
        sector=str(alert.get("sector") or "All Sectors"),
        details=f"Guard verification completed for dispatch {alert_id}.",
    )
    firebase = _save_alert_to_firebase(alert)
    return JsonResponse({"verified": True, "alert": alert, "activity": log, "firebase": firebase})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def alerts(request: HttpRequest) -> JsonResponse:
    session = _session_from_request(request)
    if not session:
        return _error("authenticated operator access is required", 401)
    if request.method == "GET":
        data, firebase = _snapshot_with_firebase_alerts()
        return JsonResponse({"alerts": data["alerts"], "firebase": firebase})
    payload = _body(request)
    alert_id = str(payload.get("id") or f"ALT-{int(datetime.now(timezone.utc).timestamp() * 1000)}")
    alert = {
        **payload,
        "id": alert_id,
        "timestamp": payload.get("timestamp") or _now(),
        "status": payload.get("status") or "open",
        "acknowledgedBy": payload.get("acknowledgedBy"),
    }
    saved = repository.upsert("alerts", alert)
    firebase = _save_alert_to_firebase(saved)
    response_status = 503 if firebase.get("alertsSynced") is False else 201
    response = {"alert": saved, "firebase": firebase}
    if response_status == 503:
        response["error"] = "Alert was saved locally but could not be written to Firebase."
    return JsonResponse(response, status=response_status)


@csrf_exempt
@require_http_methods(["POST"])
def alert_action(request: HttpRequest, alert_id: str) -> JsonResponse:
    session = _session_from_request(request)
    if not session:
        return _error("authenticated operator access is required", 401)
    payload = _body(request)
    action = str(payload.get("action") or "").lower()
    if action not in {"acknowledge", "escalate", "resolve"}:
        return _error("action must be acknowledge, escalate, or resolve")
    alert = repository.get("alerts", alert_id)
    if not alert:
        _snapshot_with_firebase_alerts()
        alert = repository.get("alerts", alert_id)
    if not alert:
        return _error("alert not found", 404)
    actor = str(session.get("name") or repository.snapshot()["currentUser"]["name"])
    status = {
        "acknowledge": "acknowledged",
        "escalate": "escalated",
        "resolve": "resolved",
    }[action]
    updated = repository.update("alerts", alert_id, {"status": status, "acknowledgedBy": actor})
    firebase = _save_alert_to_firebase(updated or alert)
    log = _activity(
        actor_id=repository.snapshot()["currentUser"]["badgeId"],
        actor_name=actor,
        action_type=f"alert_{status}",
        target_type="alert",
        target_id=alert_id,
        sector=str(alert.get("sector") or "All Sectors"),
        details=f"{status.title()} alert {alert_id}: {alert.get('eventType', 'incident') }.",
    )
    response_status = 503 if firebase.get("alertsSynced") is False else 200
    response = {"alert": updated, "activity": log, "firebase": firebase}
    if response_status == 503:
        response["error"] = "Alert status was saved locally but could not be updated in Firebase."
    return JsonResponse(response, status=response_status)


@csrf_exempt
@require_http_methods(["POST"])
def mark_potential_match(request: HttpRequest, alert_id: str) -> JsonResponse:
    """Record an operator-confirmed demo review without biometric matching."""

    session = _session_from_request(request)
    if not session or session.get("tier") not in {"admin", "command"}:
        return _error("command or administrator access is required", 403)
    alert = repository.get("alerts", alert_id)
    if not alert:
        return _error("alert not found", 404)
    if alert.get("identityStatus") != "unidentified":
        return _error("only unidentified-face review alerts can be marked as potential matches", 400)
    payload = _body(request)
    repository.ensure_demo_profiles()
    profile_id = str(payload.get("profileId") or "").strip()
    profile = repository.get("demoProfiles", profile_id)
    if not profile:
        return _error("demo profile not found", 404)
    reviewed_at = _now()
    actor = str(session.get("name") or session.get("operatorId") or "Operator")
    updated = repository.update("alerts", alert_id, {
        "reviewStatus": "potential_match",
        "reviewedBy": actor,
        "reviewedAt": reviewed_at,
        "reviewProfileId": profile_id,
        "reviewProfileLabel": profile.get("displayName"),
        "notes": f"Operator review: potential match selected for {profile.get('displayName')}. {payload.get('note') or ''}".strip(),
    })
    log = _activity(
        actor_id=str(session.get("operatorId") or "SYSTEM"),
        actor_name=actor,
        action_type="manual_review",
        target_type="alert",
        target_id=alert_id,
        sector=str(alert.get("sector") or "All Sectors"),
        details=f"Manually marked unidentified face alert as a potential match for {profile.get('displayName')}.",
    )
    firebase = _save_alert_to_firebase(updated or alert)
    return JsonResponse({"alert": updated, "activity": log, "firebase": firebase})


@csrf_exempt
@require_http_methods(["POST"])
def anchor_alert(request: HttpRequest, alert_id: str) -> JsonResponse:
    session = _session_from_request(request)
    if not session or session.get("tier") not in {"admin", "command"}:
        return _error("command or administrator access is required", 403)
    alert = repository.get("alerts", alert_id)
    if not alert:
        _snapshot_with_firebase_alerts()
        alert = repository.get("alerts", alert_id)
    if not alert:
        return _error("alert not found", 404)
    try:
        result = blockchain.anchor(alert)
    except Exception as exc:
        return _error(str(exc), 503)
    updated = repository.update("alerts", alert_id, {
        "blockchainStatus": result["status"],
        "blockchainTxId": result["transactionHash"],
        "blockchainBlockNumber": result["blockNumber"],
        "blockchainConfirmedAt": result["confirmedAt"],
        "blockchainIncidentHash": result["incidentReferenceHash"],
        "evidenceSha256": result["evidenceSha256"],
    })
    firebase = _save_alert_to_firebase(updated or alert)
    log = _activity(
        actor_id="SYSTEM",
        actor_name="BLOCKCHAIN ANCHOR WORKER",
        action_type="blockchain_anchored",
        target_type="alert",
        target_id=alert_id,
        sector=str(alert.get("sector") or "All Sectors"),
        details=f"Evidence hash anchored in EvidenceRegistry. Transaction: {result['transactionHash']}.",
    )
    response_status = 503 if firebase.get("alertsSynced") is False else 200
    response = {"alert": updated, "blockchain": result, "activity": log, "firebase": firebase}
    if response_status == 503:
        response["error"] = "Alert was anchored locally but its Firebase record could not be updated."
    return JsonResponse(response, status=response_status)


@require_http_methods(["GET"])
def verify_alert(request: HttpRequest, alert_id: str) -> JsonResponse:
    session = _session_from_request(request)
    if not session or session.get("tier") not in {"admin", "command"}:
        return _error("command or administrator access is required", 403)
    alert = repository.get("alerts", alert_id)
    if not alert:
        return _error("alert not found", 404)
    return JsonResponse({"verification": blockchain.verify(alert)})


@csrf_exempt
@require_http_methods(["POST"])
def activity(request: HttpRequest) -> JsonResponse:
    session = _session_from_request(request)
    if not session:
        return _error("authenticated operator access is required", 401)
    payload = _body(request)
    entry = _activity(
        actor_id=str(session.get("operatorId") or "SYSTEM"),
        actor_name=str(session.get("name") or "SYSTEM"),
        action_type=str(payload.get("actionType") or "patrol_checkin"),
        target_type=str(payload.get("targetType") or "system"),
        target_id=str(payload.get("targetId") or "SYSTEM"),
        sector=str(payload.get("sector") or "All Sectors"),
        details=str(payload.get("details") or ""),
        entry_id=payload.get("id"),
        timestamp=payload.get("timestamp"),
    )
    return JsonResponse({"activity": entry}, status=201)


@csrf_exempt
@require_http_methods(["PATCH"])
def guard_detail(request: HttpRequest, guard_id: str) -> JsonResponse:
    if not _session_from_request(request):
        return _error("authenticated operator access is required", 401)
    payload = _body(request)
    guard = repository.get("guards", guard_id)
    if not guard:
        return _error("guard not found", 404)
    allowed = {"status", "currentPostId", "currentSector", "shiftStart", "shiftEnd"}
    changes = {key: value for key, value in payload.items() if key in allowed}
    if "status" in changes and changes["status"] not in {"on_post", "patrolling", "break", "unreachable", "off_duty"}:
        return _error("unsupported guard status")
    updated = repository.update("guards", guard_id, changes)
    return JsonResponse({"guard": updated})


@csrf_exempt
@require_http_methods(["PATCH"])
def shift_detail(request: HttpRequest, shift_id: str) -> JsonResponse:
    session = _session_from_request(request)
    if not session or session.get("tier") not in {"admin", "command"}:
        return _error("command or administrator access is required", 403)
    payload = _body(request)
    shift = repository.get("shifts", shift_id)
    if not shift:
        return _error("shift not found", 404)
    changes = {
        key: value
        for key, value in payload.items()
        if key in {"guardId", "guardName", "sector", "postId", "start", "end", "day", "shiftName"}
    }
    updated = repository.update("shifts", shift_id, changes)
    return JsonResponse({"shift": updated})


@csrf_exempt
@require_http_methods(["POST"])
def handover(request: HttpRequest) -> JsonResponse:
    session = _session_from_request(request)
    if not session or session.get("tier") not in {"admin", "command"}:
        return _error("command or administrator access is required", 403)
    payload = _body(request)
    outgoing_id = str(payload.get("outgoingGuardId") or "")
    incoming_id = str(payload.get("incomingGuardId") or "")
    outgoing = repository.get("guards", outgoing_id)
    incoming = repository.get("guards", incoming_id)
    if not outgoing or not incoming:
        return _error("outgoingGuardId and incomingGuardId must reference guards")
    post_id = outgoing.get("currentPostId") or "POST-A1-MAIN"
    sector = outgoing.get("currentSector") or "All Sectors"
    now = _now()
    repository.update("guards", outgoing_id, {"status": "off_duty", "currentPostId": None, "currentSector": None})
    repository.update("guards", incoming_id, {"status": "on_post", "currentPostId": post_id, "currentSector": sector, "shiftStart": now})
    log = _activity(
        actor_id=incoming_id,
        actor_name=str(incoming["name"]),
        action_type="handover_completed",
        target_type="post",
        target_id=str(post_id),
        sector=str(sector),
        details=f"Shift turnover: {outgoing['name']} handed over to {incoming['name']}. {payload.get('notes') or 'Turnover complete.'}",
    )
    return JsonResponse({"guards": repository.snapshot()["guards"], "activity": log})


def _sanitize_camera(camera: dict[str, Any]) -> dict[str, Any]:
    from copy import deepcopy

    c = deepcopy(camera)
    has_pw = bool(c.get("rtspPassword"))
    c.pop("rtspPassword", None)
    c["rtspPasswordConfigured"] = has_pw
    return c


@csrf_exempt
@require_http_methods(["GET", "PATCH", "POST"])
def camera_detail(request: HttpRequest, camera_id: str) -> JsonResponse:
    if not _session_from_request(request):
        return _error("authenticated operator access is required", 401)
    camera = repository.get("cameras", camera_id)
    if not camera:
        return _error("camera not found", 404)
    if request.method == "GET":
        return JsonResponse({"camera": _sanitize_camera(camera)})

    payload = _body(request)
    allowed = {
        "name", "sector", "type", "ipAddress", "hostname", "rtspPort",
        "rtspUsername", "rtspPassword", "rtspChannel", "streamProfile",
        "rtspUrl", "aiActive", "personDetection", "vehicleDetection",
        "weaponDetection", "confidenceThreshold", "minObjectSizePx",
        "zonePolygon", "triggerAction", "dwellTimeSeconds", "status",
        "pan", "tilt", "zoom", "fps", "resolution", "fovAngle", "coordinates",
        "enabled", "nightBrightnessThreshold", "nightSchedule", "fenceExitAlerts",
        "repeatedPlateThreshold", "crowdThreshold",
    }
    changes = {key: value for key, value in payload.items() if key in allowed}
    if "rtspPassword" in changes and not changes["rtspPassword"]:
        changes.pop("rtspPassword")
    updated = repository.update("cameras", camera_id, changes)
    if updated and any(k in changes for k in ("ipAddress", "hostname", "rtspPort", "rtspUsername", "rtspPassword", "rtspChannel", "streamProfile", "rtspUrl")):
        try:
            register_camera_relay(updated)
        except Exception:
            pass
    return JsonResponse({"camera": _sanitize_camera(updated or camera)})


@require_http_methods(["GET"])
def camera_stream(request: HttpRequest, camera_id: str) -> JsonResponse:
    session = _session_from_request(request)
    if not session:
        return _error("authentication required", 401)
    camera = repository.get("cameras", camera_id)
    if not camera:
        return _error("camera not found", 404)

    try:
        stream_info = register_camera_relay(camera)
        return JsonResponse(stream_info)
    except CameraRelayError as exc:
        return _error(str(exc), 400)
    except Exception as exc:
        return _error(f"Failed to register stream relay: {exc}", 503)


@csrf_exempt
@require_http_methods(["POST"])
def camera_connection_test(request: HttpRequest) -> JsonResponse:
    session = _session_from_request(request)
    if not session or session.get("tier") not in {"admin", "command"}:
        return _error("command or administrator access is required", 403)
    payload = _body(request)
    result = test_camera_url(payload.get("url"), payload.get("timeoutSeconds", 3))
    return JsonResponse({"connection": result.as_dict()}, status=200 if result.reachable else 422)


@csrf_exempt
@require_http_methods(["POST"])
def camera_test(request: HttpRequest) -> JsonResponse:
    session = _session_from_request(request)
    if not session or session.get("tier") not in {"admin", "command"}:
        return _error("command or administrator access is required", 403)
    payload = _body(request)
    if payload.get("url"):
        result = test_camera_url(payload.get("url"), payload.get("timeoutSeconds", 3))
        return JsonResponse({"connection": result.as_dict()}, status=200 if result.reachable else 422)
    host = str(payload.get("host") or payload.get("ipAddress") or payload.get("hostname") or "").strip()
    port = int(payload.get("port") or payload.get("rtspPort") or 554)
    result = test_camera_connection(host, port)
    status_code = 200 if result["reachable"] else (403 if result["code"] == "PUBLIC_IP_FORBIDDEN" else 400)
    return JsonResponse(result, status=status_code)


@csrf_exempt
@require_http_methods(["POST"])
def system_action(request: HttpRequest) -> JsonResponse:
    session = _session_from_request(request)
    if not session or session.get("tier") not in {"admin", "command"}:
        return _error("command or administrator access is required", 403)
    payload = _body(request)
    action = str(payload.get("action") or "")
    current = repository.snapshot()
    if action == "lockdown":
        changes = {"lockdownActive": True, "defconLevel": 1}
    elif action == "abort_lockdown":
        changes = {"lockdownActive": False, "defconLevel": 2}
    elif action == "defcon":
        try:
            level = int(payload.get("level"))
        except (TypeError, ValueError):
            return _error("level must be an integer from 1 to 5")
        if level not in {1, 2, 3, 4, 5}:
            return _error("level must be an integer from 1 to 5")
        changes = {"defconLevel": level, "lockdownActive": level == 1}
    else:
        return _error("unsupported system action")
    system = repository.system_update(changes)
    log = _activity(
        actor_id=str(current["currentUser"]["badgeId"]),
        actor_name=str(session.get("name") or current["currentUser"]["name"]),
        action_type="lockdown_initiated",
        target_type="system",
        target_id=action.upper(),
        sector="All Sectors",
        details=f"System action {action} applied. DEFCON {system['defconLevel']}.",
    )
    return JsonResponse({"system": system, "activity": log})


@csrf_exempt
@require_http_methods(["POST"])
def sync(request: HttpRequest) -> JsonResponse:
    if not _session_from_request(request):
        return _error("authenticated operator access is required", 401)
    payload = _body(request)
    result = repository.merge_sync(payload.get("alerts") or [], payload.get("activityLog") or [])
    data, firebase = _snapshot_with_firebase_alerts()
    return JsonResponse({
        "accepted": result,
        "data": data,
        "blockchain": blockchain.get_status(),
        "firebase": firebase,
    })


@csrf_exempt
@require_http_methods(["POST"])
def reset(request: HttpRequest) -> JsonResponse:
    session = _session_from_request(request)
    if not session or session.get("tier") != "admin":
        return _error("administrator access is required", 403)
    repository.reset()
    return JsonResponse({
        "data": repository.snapshot(),
        "blockchain": blockchain.get_status(),
        "firebase": firebase_status(),
    })


def _body(request: HttpRequest) -> dict[str, Any]:
    try:
        value = json.loads(request.body.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("request body must be valid JSON") from exc
    if not isinstance(value, dict):
        raise ValueError("request body must be a JSON object")
    return value


def _activity(*, actor_id: str, actor_name: str, action_type: str, target_type: str, target_id: str, sector: str, details: str, entry_id: str | None = None, timestamp: str | None = None) -> dict[str, Any]:
    return repository.add_activity({
        "id": entry_id,
        "timestamp": timestamp or _now(),
        "actorId": actor_id,
        "actorName": actor_name,
        "actionType": action_type,
        "targetType": target_type,
        "targetId": target_id,
        "sector": sector,
        "details": details,
    })


def _snapshot_with_firebase_alerts() -> tuple[dict[str, Any], dict[str, Any]]:
    """Merge Firestore history into the local cache before returning API data."""
    data = repository.snapshot()
    firebase = _firebase_status_with_outbox()
    if not firebase.get("initialized"):
        _flush_fcm_outbox()
        return _compact_bootstrap_data(data), firebase

    try:
        store = get_alert_store()
        _flush_firebase_outbox(store)
        _flush_fcm_outbox()
        firebase = _firebase_status_with_outbox()
        remote_alerts = store.list_alerts()
        remote_ids = {str(alert.get("id")) for alert in remote_alerts}
        local_alerts = data.get("alerts", [])
        missing_remote = [alert for alert in local_alerts if str(alert.get("id")) not in remote_ids]
        if missing_remote:
            for alert in missing_remote:
                store.upsert_alert(alert)
                store.append_alert_event(alert, event_type="legacy_projection_import")
            remote_alerts.extend(missing_remote)
        for alert in remote_alerts:
            if repository.get("alerts", str(alert.get("id"))) != alert:
                repository.upsert("alerts", alert)
        data["alerts"] = sorted(remote_alerts, key=lambda alert: _alert_sort_key(alert.get("timestamp")), reverse=True)
        return _compact_bootstrap_data(data), {
            **firebase,
            "alertsSynced": True,
            "alertsCount": len(data["alerts"]),
        }
    except Exception as exc:
        return _compact_bootstrap_data(data), {
            **firebase,
            "alertsSynced": False,
            "alertsCount": len(data.get("alerts", [])),
            "message": f"Firebase alert sync failed: {exc}",
        }


def _compact_bootstrap_data(data: dict[str, Any]) -> dict[str, Any]:
    """Keep browser bootstrap responses small without deleting stored evidence.

    Camera-frame evidence can be a base64 data URL several megabytes long.
    The full value remains in local storage/Firebase for evidence workflows,
    but the console bootstrap only needs a preview-sized reference.
    """
    compacted = dict(data)
    compacted["alerts"] = [
        {
            **alert,
            "evidenceUrl": (
                "" if len(str(alert.get("evidenceUrl") or "")) > 200_000
                else alert.get("evidenceUrl", "")
            ),
        }
        for alert in data.get("alerts", [])
    ]
    return compacted


def _save_alert_to_firebase(alert: dict[str, Any]) -> dict[str, Any]:
    firebase = _firebase_status_with_outbox()
    if not firebase.get("initialized"):
        result = {
            **firebase,
            # Firebase remains optional for local-only installations. A
            # configured-but-unavailable Firebase instance is handled as a
            # failed write below by returning alertsSynced=False.
            "alertsSynced": False if firebase.get("configured") else None,
            "alertsCount": None,
        }
        if firebase.get("configured"):
            queued = repository.enqueue_firebase_alert(alert, str(firebase.get("message") or "Firebase is unavailable"))
            result.update({"retryQueued": not queued.get("deadLetter"), "deadLetter": queued.get("deadLetter"), "attempts": queued.get("attempts")})
        result.update(_send_fcm_alert(alert))
        return result
    try:
        store = get_alert_store()
        store.upsert_alert(alert)
        store.append_alert_event(alert)
        repository.remove_firebase_alert(str(alert.get("id")))
        return {**firebase, "alertsSynced": True, **repository.firebase_outbox_status(), **_send_fcm_alert(alert)}
    except Exception as exc:
        queued = repository.enqueue_firebase_alert(alert, str(exc))
        return {
            **firebase,
            "alertsSynced": False,
            "message": f"Firebase alert write failed: {exc}",
            "retryQueued": not queued.get("deadLetter"),
            "deadLetter": queued.get("deadLetter"),
            "attempts": queued.get("attempts"),
        }


def _firebase_status_with_outbox() -> dict[str, Any]:
    return {
        **firebase_status(),
        **repository.firebase_outbox_status(),
        "fcm": {**fcm_status(), **repository.fcm_outbox_status()},
    }


def _send_fcm_alert(alert: dict[str, Any]) -> dict[str, Any]:
    status = fcm_status()
    if not status.get("configured"):
        return {"notificationStatus": "disabled", **repository.fcm_outbox_status()}
    try:
        result = send_alert_notification(alert)
        repository.remove_fcm_alert(str(alert.get("id")))
        return {"notificationStatus": result.get("status", "sent"), "notificationMessageId": result.get("messageId"), **repository.fcm_outbox_status()}
    except Exception as exc:
        queued = repository.enqueue_fcm_alert(alert, str(exc))
        return {"notificationStatus": "queued", "notificationRetryQueued": not queued.get("deadLetter"), "notificationDeadLetter": queued.get("deadLetter"), **repository.fcm_outbox_status()}


def _flush_fcm_outbox() -> None:
    for item in repository.due_fcm_outbox():
        alert = item.get("alert")
        if not isinstance(alert, dict):
            repository.remove_fcm_alert(str(item.get("id") or ""))
            continue
        try:
            send_alert_notification(alert)
            repository.remove_fcm_alert(str(item.get("id") or alert.get("id") or ""))
        except Exception as exc:
            repository.enqueue_fcm_alert(alert, str(exc))


def _flush_firebase_outbox(store: Any) -> None:
    for item in repository.due_firebase_outbox():
        alert = item.get("alert")
        if not isinstance(alert, dict):
            repository.remove_firebase_alert(str(item.get("id") or ""))
            continue
        try:
            store.upsert_alert(alert)
            store.append_alert_event(alert, event_type="retry_projection_updated")
            repository.remove_firebase_alert(str(item.get("id") or alert.get("id") or ""))
        except Exception as exc:
            repository.enqueue_firebase_alert(alert, str(exc))


def _alert_sort_key(value: Any) -> datetime:
    try:
        timestamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return datetime.min.replace(tzinfo=timezone.utc)
    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _future_iso(seconds: int) -> str:
    from datetime import timedelta

    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()


def _is_expired(value: Any) -> bool:
    try:
        timestamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return True
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return timestamp <= datetime.now(timezone.utc)


def _check_hash(value: str, stored_hash: str) -> bool:
    from django.contrib.auth.hashers import check_password

    return bool(value and stored_hash and check_password(value, stored_hash))


def _auth_two_factor_enabled() -> bool:
    return os.getenv("AUTH_REQUIRE_2FA", "true").strip().lower() in {"1", "true", "yes", "on"}


def _allow_demo_auth_users(request: HttpRequest) -> bool:
    enabled = os.getenv("AUTH_ALLOW_DEMO_USERS", "false").strip().lower() in {"1", "true", "yes", "on"}
    return enabled and _is_loopback_request(request)


def _allow_demo_otp(request: HttpRequest) -> bool:
    enabled = os.getenv("AUTH_ALLOW_DEMO_OTP", "false").strip().lower() in {"1", "true", "yes", "on"}
    return enabled and _is_loopback_request(request)


def _is_loopback_request(request: HttpRequest) -> bool:
    return _client_ip(request) in {"127.0.0.1", "::1", "localhost"}


def _issue_otp_challenge(request: HttpRequest, user: dict[str, Any]) -> dict[str, Any]:
    operator_id = str(user.get("operatorId") or "")
    phone = str(user.get("phone") or "").strip()
    otp = f"{secrets.randbelow(1_000_000):06d}"
    challenge_id = secrets.token_urlsafe(24)
    config = exotel_status()
    delivery = "demo"
    delivery_status: dict[str, Any] = {"status": "demo"}
    if config.get("configured"):
        if not phone:
            raise ExotelDeliveryError("This operator has no phone number for Exotel two-step verification.")
        delivery = "exotel_sms"
        message = f"Sentrix login verification code: {otp}. It expires in 5 minutes. Do not share this code."
        delivery_status = send_sms(phone, message, custom_data=f"login:{operator_id}")
    elif not _allow_demo_otp(request):
        raise ExotelConfigurationError("Two-step verification is enabled but Exotel is not configured.")

    challenge = {
        "id": challenge_id,
        "purpose": "login",
        "operatorId": operator_id,
        "codeHash": _hash_secret(otp),
        "expiresAt": _future_iso(300),
        "createdAt": _now(),
        "attempts": 0,
        "used": False,
        "status": "sent" if delivery == "exotel_sms" else "demo_ready",
        "delivery": delivery,
        "deliveryStatus": delivery_status,
        "ipAddress": _client_ip(request),
    }
    repository.create_auth_challenge(challenge)
    response: dict[str, Any] = {
        "challengeId": challenge_id,
        "delivery": delivery,
        "maskedPhone": _mask_phone(phone) if phone else None,
        "expiresInSeconds": 300,
        "message": "Enter the OTP sent through Exotel." if delivery == "exotel_sms" else "Demo OTP generated locally.",
    }
    if delivery == "demo":
        response["demoOtp"] = otp
    return response


def _issue_dispatch_otp(
    request: HttpRequest, alert: dict[str, Any], guard: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    """Create and deliver a guard dispatch OTP without storing plaintext."""

    alert_id = str(alert.get("id") or "")
    guard_id = str(guard.get("id") or "")
    config = OtpConfig.from_env()
    latest = repository.latest_dispatch_challenge(alert_id, guard_id)
    if latest and not latest.get("used") and not _is_expired(latest.get("expiresAt")):
        remaining = cooldown_remaining(str(latest.get("createdAt") or ""), config)
        if remaining > 0:
            raise DispatchOtpRateLimitError(f"Wait {remaining} seconds before requesting another guard OTP.")

    phone = str(guard.get("phone") or "").strip()
    otp = generate_otp()
    challenge_id = secrets.token_urlsafe(24)
    created_at = _now()
    expiry = expires_at(config)
    provider_status = "not_configured"
    delivery = "not_configured"
    provider_message_id: str | None = None
    sms_error: str | None = None
    demo_otp: str | None = None

    if exotel_status().get("configured"):
        if not phone:
            provider_status = "failed"
            delivery = "failed"
            sms_error = "The assigned guard has no configured mobile number."
        else:
            message = dispatch_message(
                otp=otp,
                alert_id=alert_id,
                sector=str(alert.get("sector") or "assigned sector"),
                priority=str(alert.get("level") or "normal"),
                dispatched_at=created_at,
            )
            try:
                result = send_sms(phone, message, custom_data=f"dispatch-otp:{alert_id}")
                provider_status = "sent"
                delivery = "exotel_sms"
                provider_message_id = result.get("providerMessageId")
            except (ExotelConfigurationError, ExotelDeliveryError) as exc:
                provider_status = "failed"
                delivery = "failed"
                sms_error = str(exc)
    elif _allow_demo_otp(request):
        provider_status = "demo_ready"
        delivery = "demo"
        demo_otp = otp
    else:
        sms_error = "Exotel credentials are not configured and demo OTPs are disabled."

    challenge = {
        "id": challenge_id,
        "purpose": "guard_dispatch",
        "alertId": alert_id,
        "guardId": guard_id,
        "codeHash": hash_otp(otp),
        "expiresAt": expiry,
        "createdAt": created_at,
        "attempts": 0,
        "used": False,
        "status": provider_status,
        "delivery": delivery,
        "deliveryStatus": provider_status,
        "maskedPhone": _mask_phone(phone) if phone else None,
        "ipAddress": _client_ip(request),
        "providerMessageId": provider_message_id,
        "error": sms_error,
    }
    repository.create_dispatch_challenge(challenge)
    return {
        "alertFields": {
            "dispatchOtpStatus": provider_status,
            "dispatchOtpExpiresAt": expiry,
            "dispatchOtpChallengeId": challenge_id,
            "dispatchOtpMaskedPhone": _mask_phone(phone) if phone else None,
            "dispatchVerifiedAt": None,
            "smsStatus": provider_status,
            "smsProvider": "exotel" if delivery == "exotel_sms" else delivery,
            "smsSentAt": created_at if provider_status == "sent" else None,
            "smsProviderMessageId": provider_message_id,
            "smsError": sms_error,
        },
        "client": {
            "challengeId": challenge_id,
            "status": provider_status,
            "delivery": delivery,
            "maskedPhone": _mask_phone(phone) if phone else None,
            "expiresInSeconds": config.ttl_seconds,
            "message": (
                "OTP sent to the guard's configured mobile number."
                if provider_status == "sent"
                else "Development OTP generated locally; configure Exotel for live SMS."
                if provider_status == "demo_ready"
                else sms_error or "Guard OTP delivery failed."
            ),
            **({"demoOtp": demo_otp} if demo_otp else {}),
        },
    }


def _send_dispatch_sms(alert: dict[str, Any], guard: dict[str, Any]) -> dict[str, Any]:
    """Backward-compatible wrapper for callers that only need dispatch SMS."""
    phone = str(guard.get("phone") or "").strip()
    if not exotel_status().get("configured"):
        return {
            "smsStatus": "not_configured",
            "smsProvider": "exotel",
            "smsSentAt": None,
            "smsProviderMessageId": None,
            "smsError": "Exotel credentials are not configured.",
        }
    if not phone:
        return {
            "smsStatus": "failed",
            "smsProvider": "exotel",
            "smsSentAt": None,
            "smsProviderMessageId": None,
            "smsError": "The assigned guard has no phone number.",
        }
    coordinates = alert.get("coordinates") or {}
    body = (
        f"Sentrix {str(alert.get('level', 'normal')).upper()} alert {alert.get('id')}: "
        f"{alert.get('eventType', 'incident')} at {alert.get('sector', 'assigned sector')}. "
        f"Location {coordinates.get('lat', 'n/a')},{coordinates.get('lng', 'n/a')}. "
        f"Report to post. Do not share this message."
    )
    try:
        result = send_sms(phone, body, custom_data=f"dispatch:{alert.get('id')}")
        return {
            "smsStatus": "sent",
            "smsProvider": result.get("provider", "exotel"),
            "smsSentAt": _now(),
            "smsProviderMessageId": result.get("providerMessageId"),
            "smsError": None,
        }
    except (ExotelConfigurationError, ExotelDeliveryError) as exc:
        return {
            "smsStatus": "failed",
            "smsProvider": "exotel",
            "smsSentAt": None,
            "smsProviderMessageId": None,
            "smsError": str(exc),
        }


def _complete_authentication(request: HttpRequest, user: dict[str, Any], method: str) -> JsonResponse:
    session = _session_for_user(user, request, method)
    token = signing.dumps(session, salt="borderlens.console.auth")
    _record_auth_event(request, str(session.get("operatorId") or ""), "login_success", method, True, "Authenticated")
    return JsonResponse({"session": session, "token": token})


def _session_for_user(user: dict[str, Any], request: HttpRequest, method: str) -> dict[str, Any]:
    safe_keys = {"operatorId", "name", "rank", "role", "tier", "tokenVersion"}
    session = {key: user.get(key) for key in safe_keys if user.get(key) is not None}
    session.update({"loginIp": _client_ip(request), "loginAt": _now(), "authMethod": method})
    return session


def _record_auth_event(request: HttpRequest, operator_id: str, event_type: str, method: str, success: bool, details: str) -> None:
    repository.record_auth_event({
        "operatorId": operator_id,
        "eventType": event_type,
        "method": method,
        "success": success,
        "ipAddress": _client_ip(request),
        "userAgent": request.headers.get("User-Agent", "")[:240],
        "timestamp": _now(),
        "details": details[:240],
    })


def _client_ip(request: HttpRequest) -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()[:64]
    return str(request.META.get("REMOTE_ADDR") or "unknown")[:64]


def _mask_phone(phone: str) -> str | None:
    digits = "".join(character for character in phone if character.isdigit())
    return f"••••••{digits[-4:]}" if len(digits) >= 4 else None


def _hash_secret(value: str) -> str:
    from django.contrib.auth.hashers import make_password

    return make_password(value)


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _webauthn_rp_id() -> str:
    return os.getenv("WEBAUTHN_RP_ID", "localhost").strip() or "localhost"


def _webauthn_origin() -> str | list[str]:
    origins = [item.strip() for item in os.getenv("WEBAUTHN_ORIGIN", "http://localhost:3000").split(",") if item.strip()]
    return origins if len(origins) > 1 else origins[0]


def _error(message: str, status: int = 400) -> JsonResponse:
    return JsonResponse({"error": message}, status=status)


def _session_from_request(request: HttpRequest) -> dict[str, Any] | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    try:
        value = signing.loads(header[7:], salt="borderlens.console.auth", max_age=60 * 60 * 12)
    except signing.BadSignature:
        return None
    if not isinstance(value, dict):
        return None
    operator_id = str(value.get("operatorId") or "")
    user = repository.get_auth_user(operator_id)
    if not user or user.get("disabled"):
        return None
    try:
        token_version = int(value.get("tokenVersion", 1))
        current_version = int(user.get("tokenVersion", 1))
    except (TypeError, ValueError):
        return None
    if token_version != current_version:
        return None
    return value


def _access_tier_for_rank(rank: str) -> str:
    normalized = rank.strip().casefold()
    if normalized in {"administrator", "admin", "system administrator"}:
        return "admin"
    if normalized in {"inspector", "sub-inspector", "assistant commandant", "commandant"}:
        return "command"
    return "field"
