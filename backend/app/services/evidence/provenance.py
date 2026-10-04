"""AI model provenance records for high-severity alerts."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from .hashing import is_sha256, sha256_file


@dataclass(frozen=True)
class ModelProvenance:
    """The model identity and artifact digest used for one alert."""

    model_id: str
    model_version: str
    model_artifact_sha256: str
    confidence: float
    decision_threshold: float
    recorded_at: datetime

    def __post_init__(self) -> None:
        if not self.model_id.strip() or not self.model_version.strip():
            raise ValueError("model_id and model_version are required")
        if not is_sha256(self.model_artifact_sha256):
            raise ValueError("model_artifact_sha256 must be a SHA-256 digest")
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("confidence must be between 0 and 1")
        if not 0.0 <= self.decision_threshold <= 1.0:
            raise ValueError("decision_threshold must be between 0 and 1")

    @classmethod
    def from_artifact(
        cls,
        model_id: str,
        model_version: str,
        artifact_path: Path,
        confidence: float,
        decision_threshold: float,
        recorded_at: Optional[datetime] = None,
    ) -> "ModelProvenance":
        return cls(
            model_id=model_id,
            model_version=model_version,
            model_artifact_sha256=sha256_file(artifact_path),
            confidence=confidence,
            decision_threshold=decision_threshold,
            recorded_at=recorded_at or datetime.now(timezone.utc),
        )

    def as_dict(self) -> Dict[str, Any]:
        result = asdict(self)
        result["recorded_at"] = self.recorded_at.astimezone(timezone.utc).isoformat()
        return result
