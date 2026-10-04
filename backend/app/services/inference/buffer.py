"""Bounded per-camera frame buffers for low-latency processing."""

from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from time import monotonic
from typing import Any


@dataclass(frozen=True)
class BufferMetrics:
    pushed: int
    processed: int
    dropped: int
    queue_delay_ms: float


class LatestFrameBuffer:
    """Keep only the newest frame so a slow model never builds a stale backlog."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._latest: tuple[Any, float] | None = None
        self._pushed = 0
        self._processed = 0
        self._dropped = 0

    def push(self, frame: Any) -> None:
        now = monotonic()
        with self._lock:
            self._pushed += 1
            if self._latest is not None:
                self._dropped += 1
            self._latest = (frame, now)

    def pop_latest(self) -> tuple[Any, float] | None:
        with self._lock:
            item = self._latest
            self._latest = None
            if item is not None:
                self._processed += 1
            return item

    def metrics(self) -> BufferMetrics:
        with self._lock:
            age_ms = 0.0 if self._latest is None else max(0.0, (monotonic() - self._latest[1]) * 1000)
            return BufferMetrics(self._pushed, self._processed, self._dropped, round(age_ms, 1))
