"""Firestore persistence for the command-center alert history."""

from __future__ import annotations

import os
import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Mapping, Protocol

from .firebase import get_firestore_client


class FirestoreAlertCollection(Protocol):
    def document(self, document_id: str) -> Any:
        ...

    def stream(self) -> Any:
        ...


class FirestoreAlertClient(Protocol):
    def collection(self, name: str) -> FirestoreAlertCollection:
        ...


class FirestoreAlertStore:
    """Store alert documents using the alert id as the Firestore document id."""

    def __init__(self, client: FirestoreAlertClient, collection: str = "alerts") -> None:
        if not collection.strip():
            raise ValueError("Firestore alert collection is required")
        self.client = client
        self.collection = collection

    def upsert_alert(self, alert: Mapping[str, Any]) -> None:
        alert_id = str(alert.get("id") or "").strip()
        if not alert_id:
            raise ValueError("Firestore alerts require an id")

        payload = _json_safe(dict(alert))
        payload["id"] = alert_id
        payload["updatedAt"] = _server_timestamp()
        self.client.collection(self.collection).document(alert_id).set(payload, merge=True)

    def append_alert_event(self, alert: Mapping[str, Any], event_type: str = "projection_updated") -> None:
        """Append an immutable alert event alongside the current projection.

        The alert document remains a query-friendly projection. The event
        document is write-once by deterministic id, so retries are idempotent
        while the operational history remains append-only.
        """
        alert_id = str(alert.get("id") or "").strip()
        if not alert_id:
            raise ValueError("alert events require an id")
        payload = _json_safe(dict(alert))
        fingerprint = hashlib.sha256(
            json.dumps({"alert": payload, "eventType": event_type}, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        event_id = f"{alert_id}:{fingerprint[:24]}"
        event_payload = {
            "eventId": event_id,
            "alertId": alert_id,
            "eventType": event_type,
            "alert": payload,
            "recordedAt": _server_timestamp(),
        }
        self.client.collection(f"{self.collection}_events").document(event_id).set(event_payload, merge=False)

    def upsert_alerts(self, alerts: list[Mapping[str, Any]]) -> None:
        for alert in alerts:
            self.upsert_alert(alert)

    def list_alerts(self) -> list[dict[str, Any]]:
        documents = self.client.collection(self.collection).stream()
        alerts: list[dict[str, Any]] = []
        for document in documents:
            payload = document.to_dict() or {}
            if not isinstance(payload, dict):
                continue
            alert_id = str(payload.get("id") or getattr(document, "id", "")).strip()
            if not alert_id:
                continue
            payload["id"] = alert_id
            alerts.append(_json_safe(payload))
        return sorted(alerts, key=lambda alert: _sort_key(alert.get("timestamp")), reverse=True)


def get_alert_store() -> FirestoreAlertStore:
    collection = os.getenv("FIREBASE_ALERTS_COLLECTION", "alerts").strip() or "alerts"
    return FirestoreAlertStore(get_firestore_client(), collection=collection)


def _json_safe(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value


def _server_timestamp() -> Any:
    try:
        from firebase_admin import firestore

        return firestore.SERVER_TIMESTAMP
    except ImportError:
        return datetime.now(timezone.utc).isoformat()


def _sort_key(value: Any) -> datetime:
    if isinstance(value, datetime):
        timestamp = value
    else:
        try:
            timestamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return datetime.min.replace(tzinfo=timezone.utc)
    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc)
