"""Stable, JSON-safe contracts shared by model adapters and incident triage."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping


ALLOWED_EVENT_TYPES = {
    "person",
    "vehicle",
    "weapon_object",
    "face",
    "plate",
    "intrusion",
    "movement",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class DetectionEvent:
    """Normalized model output; it describes observations, not intent."""

    type: str
    bbox: tuple[float, float, float, float]
    confidence: float
    camera_id: str
    timestamp: str = field(default_factory=utc_now)
    track_id: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.type not in ALLOWED_EVENT_TYPES:
            raise ValueError(f"unsupported detection type: {self.type}")
        if len(self.bbox) != 4:
            raise ValueError("bbox must contain x1, y1, x2, y2")
        if not 0 <= float(self.confidence) <= 1:
            raise ValueError("confidence must be between 0 and 1")
        if not self.camera_id.strip():
            raise ValueError("camera_id is required")

    def as_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "bbox": list(self.bbox),
            "confidence": round(float(self.confidence), 4),
            "track_id": self.track_id,
            "timestamp": self.timestamp,
            "camera_id": self.camera_id,
            "extra": dict(self.extra),
        }

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "DetectionEvent":
        bbox = value.get("bbox") or value.get("box") or [0, 0, 0, 0]
        if isinstance(bbox, Mapping):
            bbox = [
                bbox.get("x", 0),
                bbox.get("y", 0),
                float(bbox.get("x", 0)) + float(bbox.get("width", 0)),
                float(bbox.get("y", 0)) + float(bbox.get("height", 0)),
            ]
        raw_type = str(value.get("type") or value.get("label") or "movement").lower()
        type_aliases = {
            "license_plate": "plate",
            "anpr": "plate",
            "car": "vehicle",
            "truck": "vehicle",
            "motorcycle": "vehicle",
            "weapon": "weapon_object",
            "object": "weapon_object",
            "face_detection": "face",
        }
        normalized_type = type_aliases.get(raw_type, raw_type if raw_type in ALLOWED_EVENT_TYPES else "movement")
        return cls(
            type=normalized_type,
            bbox=tuple(float(item) for item in bbox),
            confidence=float(value.get("confidence") or 0),
            camera_id=str(value.get("camera_id") or value.get("cameraId") or "unknown-camera"),
            timestamp=str(value.get("timestamp") or utc_now()),
            track_id=value.get("track_id") or value.get("trackId"),
            extra=dict(value.get("extra") or value.get("attributes") or {}),
        )


@dataclass(frozen=True)
class IncidentEnvelope:
    """Triage output shown to operators with an explicit human-review state."""

    incident_id: str
    camera_id: str
    timestamp: str
    severity: str
    status: str
    events: tuple[dict[str, Any], ...]
    explanation: str
    human_review_required: bool = True

    def as_dict(self) -> dict[str, Any]:
        return {
            "incident_id": self.incident_id,
            "camera_id": self.camera_id,
            "timestamp": self.timestamp,
            "severity": self.severity,
            "status": self.status,
            "events": list(self.events),
            "explanation": self.explanation,
            "humanReviewRequired": self.human_review_required,
            "operatorMessage": "Potential Incident — Human Verification Required.",
        }
