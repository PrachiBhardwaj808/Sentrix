"""Serializable records for the local evidence synchronization outbox."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Mapping, Optional, Tuple


class EventStatus(str, Enum):
    PENDING_LOCAL = "pending_local"
    PINATA_PENDING = "pinata_pending"
    EVIDENCE_UPLOADED = "evidence_uploaded"
    BLOCKCHAIN_PENDING = "blockchain_pending"
    CONFIRMED = "confirmed"
    FAILED = "failed"


@dataclass
class OutboxEvent:
    """One incident and its progress through cloud and blockchain sync."""

    event_id: str
    incident_id: str
    evidence_path: str
    captured_at: datetime
    queued_at: datetime
    status: str = EventStatus.PENDING_LOCAL.value
    severity: str = "normal"
    mime_type: Optional[str] = None
    evidence_sha256: Optional[str] = None
    evidence_size: Optional[int] = None
    pinata_cid: Optional[str] = None
    pinata_file_id: Optional[str] = None
    uploaded_at: Optional[datetime] = None
    blockchain_tx_id: Optional[str] = None
    anchored_at: Optional[datetime] = None
    custody_tx_ids: Tuple[str, ...] = ()
    model_id: Optional[str] = None
    model_version: Optional[str] = None
    model_version_hash: Optional[str] = None
    model_artifact_hash: Optional[str] = None
    model_confidence: Optional[float] = None
    decision_threshold: Optional[float] = None
    retry_count: int = 0
    next_attempt_at: Optional[datetime] = None
    last_error: Optional[str] = None
    locked_until: Optional[datetime] = None

    def __post_init__(self) -> None:
        if not self.event_id.strip() or not self.incident_id.strip():
            raise ValueError("event_id and incident_id are required")
        if not self.evidence_path.strip():
            raise ValueError("evidence_path is required")
        if self.status not in {item.value for item in EventStatus}:
            raise ValueError(f"unsupported outbox status: {self.status}")
        if self.retry_count < 0:
            raise ValueError("retry_count cannot be negative")
        for field_name in (
            "captured_at",
            "queued_at",
            "uploaded_at",
            "anchored_at",
            "next_attempt_at",
            "locked_until",
        ):
            value = getattr(self, field_name)
            if value is not None and value.tzinfo is None:
                object.__setattr__(self, field_name, value.replace(tzinfo=timezone.utc))

    def to_row(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "incident_id": self.incident_id,
            "evidence_path": self.evidence_path,
            "captured_at": _timestamp(self.captured_at),
            "queued_at": _timestamp(self.queued_at),
            "status": self.status,
            "severity": self.severity,
            "mime_type": self.mime_type,
            "evidence_sha256": self.evidence_sha256,
            "evidence_size": self.evidence_size,
            "pinata_cid": self.pinata_cid,
            "pinata_file_id": self.pinata_file_id,
            "uploaded_at": _optional_timestamp(self.uploaded_at),
            "blockchain_tx_id": self.blockchain_tx_id,
            "anchored_at": _optional_timestamp(self.anchored_at),
            "custody_tx_ids_json": json.dumps(list(self.custody_tx_ids)),
            "model_id": self.model_id,
            "model_version": self.model_version,
            "model_version_hash": self.model_version_hash,
            "model_artifact_hash": self.model_artifact_hash,
            "model_confidence": self.model_confidence,
            "decision_threshold": self.decision_threshold,
            "retry_count": self.retry_count,
            "next_attempt_at": _optional_timestamp(self.next_attempt_at),
            "last_error": self.last_error,
            "locked_until": _optional_timestamp(self.locked_until),
        }

    @classmethod
    def from_row(cls, row: Mapping[str, Any]) -> "OutboxEvent":
        raw_custody_ids = _row_value(row, "custody_tx_ids_json") or "[]"
        try:
            custody_ids = tuple(str(value) for value in json.loads(raw_custody_ids))
        except (TypeError, ValueError, json.JSONDecodeError):
            custody_ids = ()
        return cls(
            event_id=str(row["event_id"]),
            incident_id=str(row["incident_id"]),
            evidence_path=str(row["evidence_path"]),
            captured_at=_parse_timestamp(str(row["captured_at"])),
            queued_at=_parse_timestamp(str(row["queued_at"])),
            status=str(row["status"]),
            severity=str(_row_value(row, "severity") or "normal"),
            mime_type=_row_value(row, "mime_type"),
            evidence_sha256=_row_value(row, "evidence_sha256"),
            evidence_size=_row_value(row, "evidence_size"),
            pinata_cid=_row_value(row, "pinata_cid"),
            pinata_file_id=_row_value(row, "pinata_file_id"),
            uploaded_at=_optional_parse(_row_value(row, "uploaded_at")),
            blockchain_tx_id=_row_value(row, "blockchain_tx_id"),
            anchored_at=_optional_parse(_row_value(row, "anchored_at")),
            custody_tx_ids=custody_ids,
            model_id=_row_value(row, "model_id"),
            model_version=_row_value(row, "model_version"),
            model_version_hash=_row_value(row, "model_version_hash"),
            model_artifact_hash=_row_value(row, "model_artifact_hash"),
            model_confidence=_row_value(row, "model_confidence"),
            decision_threshold=_row_value(row, "decision_threshold"),
            retry_count=int(_row_value(row, "retry_count") or 0),
            next_attempt_at=_optional_parse(_row_value(row, "next_attempt_at")),
            last_error=_row_value(row, "last_error"),
            locked_until=_optional_parse(_row_value(row, "locked_until")),
        )


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def _optional_timestamp(value: Optional[datetime]) -> Optional[str]:
    return _timestamp(value) if value is not None else None


def _parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def _optional_parse(value: Any) -> Optional[datetime]:
    return _parse_timestamp(str(value)) if value else None


def _row_value(row: Mapping[str, Any], key: str, default: Any = None) -> Any:
    try:
        return row[key]
    except (KeyError, IndexError):
        return default
