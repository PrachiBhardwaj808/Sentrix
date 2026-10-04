"""Thread-safe local API state used for the hackathon deployment."""

from __future__ import annotations

import json
import os
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Iterable, Optional

from ..services.audit.chain import append_chain_entry, audit_chain_status, verify_audit_chain

STATE_SCHEMA_VERSION = 4


def empty_state() -> dict[str, Any]:
    """Return a clean outpost state with no fabricated operational records."""
    return {
        "schemaVersion": STATE_SCHEMA_VERSION,
        "currentUser": {
            "name": "Local operator",
            "rank": "Operator",
            "badgeId": "LOCAL-OPERATOR",
            "role": "Local command console",
        },
        "guards": [],
        "shifts": [],
        "activityLog": [],
        "alerts": [],
        "cameras": [],
        "sectors": [],
        "pois": [],
        "anprRecords": [],
        "watchlistEntries": [],
        "demoProfiles": [],
        "authUsers": [],
        "authChallenges": [],
        "dispatchChallenges": [],
        "authAuditLog": [],
        "firebaseOutbox": [],
        "fcmOutbox": [],
        "auditChain": [],
        "system": {"lockdownActive": False, "defconLevel": 2},
    }


class ApiRepository:
    def __init__(self, state_path: Optional[str] = None) -> None:
        configured_path = state_path or os.getenv("API_STATE_PATH")
        self.path = Path(configured_path) if configured_path else Path(__file__).resolve().parents[2] / ".localdata" / "api_state.json"
        self._lock = RLock()
        self._state = self._load()
        self._backfill_audit_chain()

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            state = deepcopy(self._state)
            # Password hashes are backend-only and must never be sent to the UI.
            state.pop("authUsers", None)
            state.pop("authChallenges", None)
            state.pop("dispatchChallenges", None)
            state.pop("firebaseOutbox", None)
            state.pop("auditChain", None)
            state["auditChainStatus"] = audit_chain_status(self._state)
            for camera in state.get("cameras", []):
                if "rtspPassword" in camera:
                    camera["rtspPasswordConfigured"] = bool(camera.get("rtspPassword"))
                    camera.pop("rtspPassword", None)
            return state

    def reset(self) -> dict[str, Any]:
        with self._lock:
            auth_users = deepcopy(self._state.get("authUsers", []))
            watchlist_entries = deepcopy(self._state.get("watchlistEntries", []))
            demo_profiles = deepcopy(self._state.get("demoProfiles", []))
            auth_audit_log = deepcopy(self._state.get("authAuditLog", []))
            firebase_outbox = deepcopy(self._state.get("firebaseOutbox", []))
            fcm_outbox = deepcopy(self._state.get("fcmOutbox", []))
            audit_chain = deepcopy(self._state.get("auditChain", []))
            self._state = empty_state()
            # Reset operational telemetry without deleting provisioned guard
            # credentials or watchlists. Administrators should not lose access
            # configuration by using the UI's cache reset action.
            self._state["authUsers"] = auth_users
            self._state["watchlistEntries"] = watchlist_entries
            self._state["demoProfiles"] = demo_profiles
            self._state["authAuditLog"] = auth_audit_log
            self._state["firebaseOutbox"] = firebase_outbox
            self._state["fcmOutbox"] = fcm_outbox
            self._state["auditChain"] = audit_chain
            self._persist()
            return deepcopy(self._state)

    def get(self, collection: str, item_id: str) -> Optional[dict[str, Any]]:
        with self._lock:
            for item in self._state.get(collection, []):
                if item.get("id") == item_id:
                    return deepcopy(item)
        return None

    def upsert(self, collection: str, item: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            items = self._state.setdefault(collection, [])
            operation = "insert"
            for index, existing in enumerate(items):
                if existing.get("id") == item.get("id"):
                    items[index] = deepcopy(item)
                    operation = "update"
                    break
            else:
                items.insert(0, deepcopy(item))
            append_chain_entry(self._state, collection=collection, operation=operation, record=item)
            self._persist()
            return deepcopy(item)

    def update(self, collection: str, item_id: str, changes: dict[str, Any]) -> Optional[dict[str, Any]]:
        with self._lock:
            for index, item in enumerate(self._state.get(collection, [])):
                if item.get("id") == item_id:
                    updated = {**item, **deepcopy(changes), "id": item_id}
                    self._state[collection][index] = updated
                    append_chain_entry(self._state, collection=collection, operation="update", record=updated)
                    self._persist()
                    return deepcopy(updated)
        return None

    def delete(self, collection: str, item_id: str) -> bool:
        with self._lock:
            items = self._state.get(collection, [])
            for index, item in enumerate(items):
                if item.get("id") == item_id:
                    append_chain_entry(self._state, collection=collection, operation="delete", record=item)
                    del items[index]
                    self._persist()
                    return True
        return False

    def add_activity(self, entry: dict[str, Any]) -> dict[str, Any]:
        activity = {
            **entry,
            "id": entry.get("id") or _new_id("LOG"),
            "timestamp": entry.get("timestamp") or _now(),
        }
        return self.upsert("activityLog", activity)

    def merge_sync(self, alerts: Iterable[dict[str, Any]], activities: Iterable[dict[str, Any]]) -> dict[str, int]:
        accepted_alerts = 0
        accepted_activities = 0
        with self._lock:
            for alert in alerts:
                if alert.get("id"):
                    self._upsert_locked("alerts", alert)
                    accepted_alerts += 1
            for activity in activities:
                if activity.get("id"):
                    self._upsert_locked("activityLog", activity)
                    accepted_activities += 1
            self._persist()
        return {"alerts": accepted_alerts, "activityLog": accepted_activities}

    def audit_chain_status(self) -> dict[str, Any]:
        with self._lock:
            return audit_chain_status(self._state)

    def verify_audit_chain(self) -> dict[str, Any]:
        with self._lock:
            return verify_audit_chain(self._state)

    def audit_chain_entries(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            entries = deepcopy(self._state.get("auditChain", []))
        return entries[-max(1, min(limit, 500)) :]

    def enqueue_firebase_alert(self, alert: dict[str, Any], error: str) -> dict[str, Any]:
        """Persist one idempotent Firebase retry item without storing secrets."""
        alert_id = str(alert.get("id") or "").strip()
        if not alert_id:
            raise ValueError("alert id is required for Firebase retry")
        now = _now()
        with self._lock:
            existing = next(
                (item for item in self._state.get("firebaseOutbox", []) if item.get("id") == alert_id),
                None,
            )
            attempts = int(existing.get("attempts", 0)) + 1 if existing else 1
            dead_letter = attempts >= 8
            delay = min(3600, 2 ** min(attempts, 10))
            item = {
                "id": alert_id,
                "alert": deepcopy(alert),
                "attempts": attempts,
                "firstQueuedAt": existing.get("firstQueuedAt", now) if existing else now,
                "lastAttemptAt": now,
                "nextAttemptAt": now if dead_letter else _future_iso(delay),
                "lastError": str(error)[:500],
                "deadLetter": dead_letter,
            }
            self._upsert_locked("firebaseOutbox", item)
            self._persist()
            return deepcopy(item)

    def remove_firebase_alert(self, alert_id: str) -> bool:
        return self.delete("firebaseOutbox", str(alert_id))

    def due_firebase_outbox(self, now: Optional[str] = None) -> list[dict[str, Any]]:
        current = now or _now()
        with self._lock:
            return [
                deepcopy(item)
                for item in self._state.get("firebaseOutbox", [])
                if not item.get("deadLetter") and str(item.get("nextAttemptAt", "")) <= current
            ]

    def firebase_outbox_status(self) -> dict[str, Any]:
        with self._lock:
            items = deepcopy(self._state.get("firebaseOutbox", []))
        return {
            "pending": sum(1 for item in items if not item.get("deadLetter")),
            "deadLetter": sum(1 for item in items if item.get("deadLetter")),
            "oldestQueuedAt": min((str(item.get("firstQueuedAt")) for item in items), default=None),
        }

    def enqueue_fcm_alert(self, alert: dict[str, Any], error: str) -> dict[str, Any]:
        alert_id = str(alert.get("id") or "").strip()
        if not alert_id:
            raise ValueError("alert id is required for FCM retry")
        now = _now()
        with self._lock:
            existing = next((item for item in self._state.get("fcmOutbox", []) if item.get("id") == alert_id), None)
            attempts = int(existing.get("attempts", 0)) + 1 if existing else 1
            dead_letter = attempts >= 8
            item = {
                "id": alert_id,
                "alert": deepcopy(alert),
                "attempts": attempts,
                "firstQueuedAt": existing.get("firstQueuedAt", now) if existing else now,
                "lastAttemptAt": now,
                "nextAttemptAt": now if dead_letter else _future_iso(min(3600, 2 ** min(attempts, 10))),
                "lastError": str(error)[:500],
                "deadLetter": dead_letter,
            }
            self._upsert_locked("fcmOutbox", item)
            self._persist()
            return deepcopy(item)

    def remove_fcm_alert(self, alert_id: str) -> bool:
        return self.delete("fcmOutbox", str(alert_id))

    def due_fcm_outbox(self, now: Optional[str] = None) -> list[dict[str, Any]]:
        current = now or _now()
        with self._lock:
            return [deepcopy(item) for item in self._state.get("fcmOutbox", []) if not item.get("deadLetter") and str(item.get("nextAttemptAt", "")) <= current]

    def fcm_outbox_status(self) -> dict[str, Any]:
        with self._lock:
            items = deepcopy(self._state.get("fcmOutbox", []))
        return {
            "notificationPending": sum(1 for item in items if not item.get("deadLetter")),
            "notificationDeadLetter": sum(1 for item in items if item.get("deadLetter")),
        }

    def _backfill_audit_chain(self) -> None:
        """Create a genesis chain for legacy local records exactly once."""

        with self._lock:
            if self._state.get("auditChain"):
                return
            records_exist = any(self._state.get(collection) for collection in ("alerts", "activityLog"))
            if not records_exist:
                return
            for collection in ("alerts", "activityLog"):
                for record in reversed(self._state.get(collection, [])):
                    append_chain_entry(
                        self._state,
                        collection=collection,
                        operation="legacy_import",
                        record=record,
                    )
            self._persist()

    def system_update(self, changes: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._state.setdefault("system", {}).update(deepcopy(changes))
            self._persist()
            return deepcopy(self._state["system"])

    def update_current_user(self, user: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._state["currentUser"] = deepcopy(user)
            self._persist()
            return deepcopy(self._state["currentUser"])

    def create_guard_with_credentials(
        self, guard: dict[str, Any], auth_user: dict[str, Any]
    ) -> dict[str, Any]:
        with self._lock:
            if any(item.get("id") == guard.get("id") for item in self._state.get("guards", [])):
                raise ValueError("guard id already exists")
            if any(
                str(item.get("operatorId", "")).casefold()
                == str(auth_user.get("operatorId", "")).casefold()
                for item in self._state.get("authUsers", [])
            ):
                raise ValueError("operator id already exists")
            self._upsert_locked("guards", guard)
            self._upsert_locked("authUsers", auth_user)
            self._persist()
            return deepcopy(guard)

    def ensure_demo_auth_users(self) -> None:
        """Create local demo credentials when an older state has no auth users."""
        from django.contrib.auth.hashers import make_password

        defaults = [
            {
                "id": "ADMIN-001",
                "operatorId": "ADMIN-001",
                "passwordHash": make_password("BL-ADMIN-2026"),
                "name": "BorderLens System Administrator",
                "rank": "Administrator",
                "role": "Full system access",
                "tier": "admin",
                "tokenVersion": 1,
                "disabled": False,
                "phone": os.getenv("AUTH_ADMIN_PHONE", "").strip(),
                "passkeyCredentials": [],
            },
            {
                "id": "SSB-2041",
                "operatorId": "SSB-2041",
                "passwordHash": make_password("BL-COMMAND-2041"),
                "name": "Inspector Arjun Mehta",
                "rank": "Inspector",
                "role": "Border Operations Lead",
                "tier": "command",
                "tokenVersion": 1,
                "disabled": False,
                "phone": os.getenv("AUTH_COMMAND_PHONE", "").strip(),
                "passkeyCredentials": [],
            },
            {
                "id": "SSB-2098",
                "operatorId": "SSB-2098",
                "passwordHash": make_password("BL-FIELD-2098"),
                "name": "Rifleman Neha Rawat",
                "rank": "Rifleman",
                "role": "Field Sentry",
                "tier": "field",
                "tokenVersion": 1,
                "disabled": False,
                "phone": os.getenv("AUTH_FIELD_PHONE", "").strip(),
                "passkeyCredentials": [],
            },
        ]
        with self._lock:
            users = self._state.setdefault("authUsers", [])
            existing_ids = {str(item.get("operatorId", "")).casefold() for item in users}
            changed = False
            for user in defaults:
                if user["operatorId"].casefold() not in existing_ids:
                    users.append(user)
                    changed = True
            configured_phones = {
                "ADMIN-001": os.getenv("AUTH_ADMIN_PHONE", "").strip(),
                "SSB-2041": os.getenv("AUTH_COMMAND_PHONE", "").strip(),
                "SSB-2098": os.getenv("AUTH_FIELD_PHONE", "").strip(),
            }
            for user in users:
                phone = configured_phones.get(str(user.get("operatorId", "")).upper(), "")
                if phone and not user.get("phone"):
                    user["phone"] = phone
                    changed = True
            if changed:
                self._persist()

    def ensure_demo_watchlist(self) -> None:
        """Backfill presentation-safe watchlist records for older local state."""
        defaults = [
            {
                "id": "WATCH-PLATE-001",
                "type": "plate",
                "value": "DL01AB1234",
                "label": "Blacklisted transport",
                "reason": "Vehicle linked to a prior perimeter breach.",
                "status": "Blacklisted",
                "createdAt": _now(),
            },
            {
                "id": "WATCH-PLATE-002",
                "type": "plate",
                "value": "WB06K7788",
                "label": "Authorized logistics",
                "reason": "Scheduled supply convoy.",
                "status": "Authorized",
                "createdAt": _now(),
            },
            {
                "id": "WATCH-FACE-001",
                "type": "face",
                "value": "demo-subject-07",
                "label": "Person of interest",
                "reason": "Demonstration face watchlist record.",
                "status": "Under Surveillance",
                "createdAt": _now(),
            },
        ]
        with self._lock:
            entries = self._state.setdefault("watchlistEntries", [])
            # A non-empty list is operator-owned data. Only backfill the demo
            # records for legacy/empty state so an administrator can delete a
            # rule without it silently reappearing on the next bootstrap.
            if entries:
                return
            existing_ids = {str(item.get("id")) for item in entries}
            missing = [item for item in defaults if item["id"] not in existing_ids]
            if missing:
                entries.extend(missing)
                self._persist()

    def ensure_demo_profiles(self) -> None:
        """Backfill six non-biometric profiles for the operator-review demo."""
        defaults = [
            {
                "id": f"DEMO-PERSON-{index:02d}",
                "displayName": f"Person-{index:02d}",
                "role": "Consented demo participant",
                "badgeId": f"DEMO-BADGE-{index:02d}",
                "qrCode": f"BORDERLENS-DEMO-{index:02d}",
                "profileImageUrl": "",
                "matchingEnabled": False,
                "createdAt": _now(),
            }
            for index in range(1, 7)
        ]
        with self._lock:
            profiles = self._state.setdefault("demoProfiles", [])
            existing_ids = {str(item.get("id")) for item in profiles}
            missing = [item for item in defaults if item["id"] not in existing_ids]
            if missing:
                profiles.extend(missing)
                self._persist()

    def authenticate_user(self, operator_id: str, passcode: str) -> Optional[dict[str, Any]]:
        from django.contrib.auth.hashers import check_password

        normalized_id = operator_id.strip().casefold()
        with self._lock:
            users = deepcopy(self._state.get("authUsers", []))
        for user in users:
            if str(user.get("operatorId", "")).casefold() != normalized_id:
                continue
            if check_password(passcode, str(user.get("passwordHash", ""))):
                return {
                    key: value
                    for key, value in user.items()
                    if key not in {"id", "passwordHash"}
                }
        return None

    def get_auth_user(self, operator_id: str) -> Optional[dict[str, Any]]:
        normalized_id = operator_id.strip().casefold()
        with self._lock:
            for user in self._state.get("authUsers", []):
                if str(user.get("operatorId", "")).casefold() == normalized_id:
                    return deepcopy(user)
        return None

    def update_auth_user(self, operator_id: str, changes: dict[str, Any]) -> Optional[dict[str, Any]]:
        normalized_id = operator_id.strip().casefold()
        with self._lock:
            for index, user in enumerate(self._state.get("authUsers", [])):
                if str(user.get("operatorId", "")).casefold() == normalized_id:
                    updated = {**user, **deepcopy(changes)}
                    self._state["authUsers"][index] = updated
                    self._persist()
                    return deepcopy(updated)
        return None

    def create_auth_challenge(self, challenge: dict[str, Any]) -> dict[str, Any]:
        return self.upsert("authChallenges", challenge)

    def get_auth_challenge(self, challenge_id: str) -> Optional[dict[str, Any]]:
        return self.get("authChallenges", challenge_id)

    def create_dispatch_challenge(self, challenge: dict[str, Any]) -> dict[str, Any]:
        return self.upsert("dispatchChallenges", challenge)

    def get_dispatch_challenge(self, challenge_id: str) -> Optional[dict[str, Any]]:
        return self.get("dispatchChallenges", challenge_id)

    def latest_dispatch_challenge(self, alert_id: str, guard_id: str) -> Optional[dict[str, Any]]:
        with self._lock:
            matches = [
                deepcopy(item)
                for item in self._state.get("dispatchChallenges", [])
                if str(item.get("alertId")) == str(alert_id)
                and str(item.get("guardId")) == str(guard_id)
            ]
        return max(matches, key=lambda item: str(item.get("createdAt", "")), default=None)

    def record_auth_event(self, event: dict[str, Any]) -> dict[str, Any]:
        return self.upsert("authAuditLog", {**event, "id": event.get("id") or _new_id("AUTH")})

    def auth_audit(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            events = deepcopy(self._state.get("authAuditLog", []))
        return sorted(events, key=lambda item: str(item.get("timestamp", "")), reverse=True)[:limit]

    def _upsert_locked(self, collection: str, item: dict[str, Any]) -> None:
        items = self._state.setdefault(collection, [])
        operation = "insert"
        for index, existing in enumerate(items):
            if existing.get("id") == item.get("id"):
                items[index] = {**existing, **deepcopy(item)}
                operation = "update"
                break
        else:
            items.insert(0, deepcopy(item))
        append_chain_entry(self._state, collection=collection, operation=operation, record=item)

    def _load(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(payload, dict) and payload.get("schemaVersion", 0) in {2, 3, STATE_SCHEMA_VERSION}:
                payload["schemaVersion"] = STATE_SCHEMA_VERSION
                payload.setdefault("watchlistEntries", [])
                payload.setdefault("demoProfiles", [])
                payload.setdefault("authUsers", [])
                payload.setdefault("authChallenges", [])
                payload.setdefault("dispatchChallenges", [])
                payload.setdefault("authAuditLog", [])
                payload.setdefault("firebaseOutbox", [])
                payload.setdefault("fcmOutbox", [])
                payload.setdefault("auditChain", [])
                return payload
        except (OSError, ValueError, TypeError):
            pass
        return empty_state()

    def _persist(self) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix(".tmp")
            temporary.write_text(json.dumps(self._state, indent=2), encoding="utf-8")
            temporary.replace(self.path)
        except OSError:
            # The in-memory state still serves the request if storage is
            # read-only or ephemeral.
            return


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _future_iso(seconds: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"


repository = ApiRepository()
