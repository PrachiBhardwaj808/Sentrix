"""Pluggable model adapter contracts.

Adapters are deliberately small: replacing a YOLO, SCRFD, OCR, or weapon
model does not require changing the alert lifecycle or frontend schema.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol, Sequence

from .schema import DetectionEvent


class ModelAdapter(Protocol):
    adapter_id: str
    model_name: str

    def warmup(self) -> None: ...

    def infer(self, frame: Any, *, camera_id: str) -> Sequence[DetectionEvent]: ...


@dataclass
class AdapterHealth:
    adapter_id: str
    model_name: str
    status: str = "cold"
    last_error: str = ""
    inference_ms: float | None = None


class DisabledAdapter:
    """Safe placeholder for optional modules with no configured model weight."""

    def __init__(self, adapter_id: str, model_name: str, reason: str = "Model not configured") -> None:
        self.adapter_id = adapter_id
        self.model_name = model_name
        self.reason = reason
        self.health = AdapterHealth(adapter_id, model_name, status="disabled", last_error=reason)

    def warmup(self) -> None:
        return None

    def infer(self, frame: Any, *, camera_id: str) -> Sequence[DetectionEvent]:
        return []
