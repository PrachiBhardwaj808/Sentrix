"""Shared, framework-independent value objects returned by inference services."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass(frozen=True)
class BoundingBox:
    """Pixel coordinates in left, top, right, bottom order."""

    left: int
    top: int
    right: int
    bottom: int

    def as_xyxy(self) -> tuple[int, int, int, int]:
        return self.left, self.top, self.right, self.bottom


@dataclass(frozen=True)
class InferenceDetection:
    """Normalized result that a Django worker can convert into an event."""

    label: str
    confidence: float
    bounding_box: BoundingBox
    track_id: Optional[str] = None
    attributes: Dict[str, Any] = field(default_factory=dict)
