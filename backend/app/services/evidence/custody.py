"""Privacy-preserving evidence custody records.

This module creates normalized records. Django persists them in Firestore and
the blockchain client appends the same fields to the evidence registry.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Protocol

from .hashing import is_sha256


SUPPORTED_ACTIONS = frozenset({"created", "viewed", "downloaded", "assigned", "resolved"})


@dataclass(frozen=True)
class CustodyEvent:
    """An append-only evidence action without a full user identity."""

    event_id: str
    incident_id: str
    evidence_sha256: str
    action: str
    actor_role: str
    occurred_at: datetime
    actor_reference_hash: Optional[str] = None

    def __post_init__(self) -> None:
        if not self.event_id.strip() or not self.incident_id.strip():
            raise ValueError("event_id and incident_id are required")
        if not is_sha256(self.evidence_sha256):
            raise ValueError("evidence_sha256 must be a SHA-256 digest")
        if self.action not in SUPPORTED_ACTIONS:
            raise ValueError(f"unsupported custody action: {self.action}")
        if not self.actor_role.strip():
            raise ValueError("actor_role is required")

    def as_dict(self) -> Dict[str, Any]:
        result = asdict(self)
        result["occurred_at"] = self.occurred_at.astimezone(timezone.utc).isoformat()
        return result


class CustodyBlockchain(Protocol):
    def append_custody_event(self, event: CustodyEvent) -> str:
        ...

    def wait_for_confirmation(self, transaction_hash: str) -> Any:
        ...


class CustodySink(Protocol):
    def record_custody_event(self, event: CustodyEvent, transaction_hash: str, receipt: Any) -> None:
        ...


class CustodyRecorder:
    """Anchor a user action and persist its transaction reference operationally."""

    def __init__(self, blockchain: CustodyBlockchain, sink: Optional[CustodySink] = None) -> None:
        self.blockchain = blockchain
        self.sink = sink

    def record(self, event: CustodyEvent) -> str:
        transaction_hash = self.blockchain.append_custody_event(event)
        receipt = self.blockchain.wait_for_confirmation(transaction_hash)
        if self.sink is not None:
            self.sink.record_custody_event(event, transaction_hash, receipt)
        return transaction_hash
