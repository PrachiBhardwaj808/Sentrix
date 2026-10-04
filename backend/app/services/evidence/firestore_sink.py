"""Firestore adapter for synchronized operational incident records."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol

from .custody import CustodyEvent
from ..offline_queue.models import OutboxEvent


class FirestoreClient(Protocol):
    def collection(self, name: str) -> Any:
        ...


class FirestoreEventSink:
    """Write the latest event state without storing local filesystem paths."""

    def __init__(self, client: FirestoreClient, collection: str = "alerts") -> None:
        if not collection.strip():
            raise ValueError("Firestore collection is required")
        self.client = client
        self.collection = collection

    def upsert_event(self, event: OutboxEvent) -> None:
        payload = {
            "event_id": event.event_id,
            "incident_id": event.incident_id,
            "status": event.status,
            "severity": event.severity,
            "captured_at": _timestamp(event.captured_at),
            "queued_at": _timestamp(event.queued_at),
            "mime_type": event.mime_type,
            "evidence_sha256": event.evidence_sha256,
            "evidence_size": event.evidence_size,
            "pinata_cid": event.pinata_cid,
            "pinata_file_id": event.pinata_file_id,
            "uploaded_at": _optional_timestamp(event.uploaded_at),
            "blockchain_tx_id": event.blockchain_tx_id,
            "anchored_at": _optional_timestamp(event.anchored_at),
            "custody_tx_ids": list(event.custody_tx_ids),
            "model_id": event.model_id,
            "model_version": event.model_version,
            "model_version_hash": event.model_version_hash,
            "model_artifact_hash": event.model_artifact_hash,
            "model_confidence": event.model_confidence,
            "decision_threshold": event.decision_threshold,
            "retry_count": event.retry_count,
            "last_error": event.last_error,
        }
        self.client.collection(self.collection).document(event.incident_id).set(
            payload, merge=True
        )

    def record_custody_event(
        self, event: CustodyEvent, transaction_hash: str, receipt: Any
    ) -> None:
        payload = {
            "event_id": event.event_id,
            "incident_id": event.incident_id,
            "evidence_sha256": event.evidence_sha256,
            "action": event.action,
            "actor_role": event.actor_role,
            "actor_reference_hash": event.actor_reference_hash,
            "occurred_at": _timestamp(event.occurred_at),
            "blockchain_tx_id": transaction_hash,
            "block_number": getattr(receipt, "block_number", None),
            "anchored_at": _optional_timestamp(getattr(receipt, "confirmed_at", None)),
        }
        self.client.collection(self.collection).document(event.incident_id).collection(
            "custody"
        ).document(event.event_id).set(payload, merge=True)


def _timestamp(value: datetime) -> str:
    return value.isoformat()


def _optional_timestamp(value: Any) -> Any:
    return value.isoformat() if value is not None else None
