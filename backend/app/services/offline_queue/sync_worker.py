"""Reconnect worker that uploads evidence and anchors it exactly once."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Protocol

from ..blockchain.contract_client import BlockchainReceipt
from ..evidence.custody import CustodyEvent
from ..evidence.hashing import sha256_file, sha256_text
from ..evidence.pinata_client import PinataClient, PinataUpload
from .models import EventStatus, OutboxEvent
from .repository import OutboxRepository


class BlockchainAnchor(Protocol):
    def register_incident(
        self, incident_reference_hash: str, evidence_sha256: str, captured_at: datetime
    ) -> str:
        ...

    def register_high_severity_incident(
        self,
        incident_reference_hash: str,
        evidence_sha256: str,
        model_version_hash: str,
        model_artifact_hash: str,
        confidence: float,
        decision_threshold: float,
        captured_at: datetime,
    ) -> str:
        ...

    def append_custody_event(self, event: CustodyEvent) -> str:
        ...

    def wait_for_confirmation(self, transaction_hash: str) -> BlockchainReceipt:
        ...


class OperationalEventSink(Protocol):
    """Adapter implemented by the Firestore repository in the Django app."""

    def upsert_event(self, event: OutboxEvent) -> None:
        ...


@dataclass(frozen=True)
class SyncResult:
    event_id: str
    status: str
    error: Optional[str] = None


class EvidenceSyncWorker:
    """Process local outbox records after connectivity returns."""

    def __init__(
        self,
        repository: OutboxRepository,
        pinata: PinataClient,
        blockchain: BlockchainAnchor,
        operational_sink: Optional[OperationalEventSink] = None,
        max_attempts: int = 8,
    ) -> None:
        self.repository = repository
        self.pinata = pinata
        self.blockchain = blockchain
        self.operational_sink = operational_sink
        self.max_attempts = max_attempts

    def run_once(self, batch_size: int = 20) -> List[SyncResult]:
        results = []
        for event in self.repository.claim_ready(limit=batch_size):
            results.append(self.process_event(event.event_id))
        return results

    def process_event(self, event_id: str) -> SyncResult:
        try:
            event = self.repository.get(event_id)
            if event is None:
                return SyncResult(event_id=event_id, status="missing")

            event = self._ensure_hash(event)
            event = self._ensure_pinata_upload(event)
            if self.operational_sink is not None:
                self.operational_sink.upsert_event(event)

            event = self._ensure_incident_anchor(event)
            event = self._ensure_created_custody_event(event)
            receipt = self._wait_for_receipt(event)
            event = self.repository.update(
                event.event_id,
                status=EventStatus.CONFIRMED.value,
                anchored_at=receipt.confirmed_at,
                locked_until=None,
                last_error=None,
            )
            if event is None:
                raise RuntimeError("outbox event disappeared while synchronizing")
            if self.operational_sink is not None:
                self.operational_sink.upsert_event(event)
            return SyncResult(event_id=event.event_id, status=event.status)
        except Exception as exc:
            failed = self.repository.record_failure(
                event_id, str(exc), max_attempts=self.max_attempts
            )
            return SyncResult(
                event_id=event_id,
                status=failed.status if failed is not None else EventStatus.FAILED.value,
                error=str(exc),
            )

    def _ensure_hash(self, event: OutboxEvent) -> OutboxEvent:
        if event.evidence_sha256:
            return event
        path = Path(event.evidence_path)
        evidence_size = path.stat().st_size
        return self.repository.update(
            event.event_id,
            evidence_sha256=sha256_file(path),
            evidence_size=evidence_size,
            status=EventStatus.PINATA_PENDING.value,
            locked_until=event.locked_until,
        )  # type: ignore[return-value]

    def _ensure_pinata_upload(self, event: OutboxEvent) -> OutboxEvent:
        if event.pinata_cid:
            if event.status == EventStatus.PENDING_LOCAL.value:
                return self.repository.update(
                    event.event_id, status=EventStatus.EVIDENCE_UPLOADED.value
                )  # type: ignore[return-value]
            return event

        existing = self.pinata.find_existing(event.event_id, event.evidence_sha256 or "")
        upload: PinataUpload = existing or self.pinata.upload_path(
            event.evidence_path,
            event_id=event.event_id,
            evidence_sha256=event.evidence_sha256,
            mime_type=event.mime_type,
        )
        return self.repository.update(
            event.event_id,
            status=EventStatus.EVIDENCE_UPLOADED.value,
            evidence_sha256=event.evidence_sha256,
            evidence_size=upload.size or event.evidence_size,
            pinata_cid=upload.cid,
            pinata_file_id=upload.file_id,
            uploaded_at=datetime.now(timezone.utc),
            locked_until=event.locked_until,
        )  # type: ignore[return-value]

    def _ensure_incident_anchor(self, event: OutboxEvent) -> OutboxEvent:
        if event.blockchain_tx_id:
            return event
        if not event.evidence_sha256:
            raise RuntimeError("cannot anchor an event without an evidence hash")

        incident_reference_hash = sha256_text(event.incident_id)
        if event.severity.lower() == "high":
            required = (
                event.model_version_hash,
                event.model_artifact_hash,
                event.model_confidence,
                event.decision_threshold,
            )
            if any(value is None for value in required):
                raise RuntimeError(
                    "high-severity events require model version, artifact hash, "
                    "confidence, and decision threshold"
                )
            transaction_hash = self.blockchain.register_high_severity_incident(
                incident_reference_hash,
                event.evidence_sha256,
                event.model_version_hash or "",
                event.model_artifact_hash or "",
                event.model_confidence or 0.0,
                event.decision_threshold or 0.0,
                event.captured_at,
            )
        else:
            transaction_hash = self.blockchain.register_incident(
                incident_reference_hash, event.evidence_sha256, event.captured_at
            )

        return self.repository.update(
            event.event_id,
            status=EventStatus.BLOCKCHAIN_PENDING.value,
            blockchain_tx_id=transaction_hash,
            locked_until=event.locked_until,
        )  # type: ignore[return-value]

    def _ensure_created_custody_event(self, event: OutboxEvent) -> OutboxEvent:
        if event.custody_tx_ids:
            return event
        custody = CustodyEvent(
            event_id=f"{event.event_id}:created",
            incident_id=event.incident_id,
            evidence_sha256=event.evidence_sha256 or "",
            action="created",
            actor_role="system",
            occurred_at=event.captured_at,
        )
        transaction_hash = self.blockchain.append_custody_event(custody)
        receipt = self.blockchain.wait_for_confirmation(transaction_hash)
        return self.repository.update(
            event.event_id,
            custody_tx_ids=(transaction_hash,),
            anchored_at=receipt.confirmed_at,
            locked_until=event.locked_until,
        )  # type: ignore[return-value]

    def _wait_for_receipt(self, event: OutboxEvent) -> BlockchainReceipt:
        if not event.blockchain_tx_id:
            raise RuntimeError("event has no blockchain transaction")
        return self.blockchain.wait_for_confirmation(event.blockchain_tx_id)
