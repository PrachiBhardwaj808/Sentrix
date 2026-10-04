"""Small bounded in-process metrics registry for camera workers.

It deliberately keeps only recent samples. Long-term retention belongs in a
metrics system such as Prometheus; this endpoint is intended for the command
console and local readiness checks.
"""

from __future__ import annotations

from collections import defaultdict, deque
from statistics import quantiles
from threading import RLock
from time import time
from typing import Any


class MetricsRegistry:
    def __init__(self, max_samples: int = 200) -> None:
        self.max_samples = max(20, max_samples)
        self._lock = RLock()
        self._latencies: dict[tuple[str, str], deque[float]] = defaultdict(
            lambda: deque(maxlen=self.max_samples)
        )
        self._latest: dict[tuple[str, str], dict[str, Any]] = {}

    def record(
        self,
        camera_id: str,
        module_id: str,
        inference_ms: float,
        *,
        frame_dropped: int = 0,
        buffer_depth: int = 0,
    ) -> None:
        key = (camera_id or "unknown-camera", module_id or "unknown-module")
        value = max(0.0, float(inference_ms))
        with self._lock:
            self._latencies[key].append(value)
            self._latest[key] = {
                "cameraId": key[0],
                "module": key[1],
                "lastInferenceMs": round(value, 2),
                "lastSeenAt": time(),
                "frameDropped": int(frame_dropped),
                "bufferDepth": int(buffer_depth),
            }

    def snapshot(self, camera_id: str | None = None) -> dict[str, Any]:
        with self._lock:
            keys = [key for key in self._latencies if camera_id is None or key[0] == camera_id]
            modules: list[dict[str, Any]] = []
            for key in sorted(keys):
                samples = list(self._latencies[key])
                if not samples:
                    continue
                modules.append({
                    **self._latest.get(key, {"cameraId": key[0], "module": key[1]}),
                    "samples": len(samples),
                    "p50Ms": _percentile(samples, 0.50),
                    "p95Ms": _percentile(samples, 0.95),
                })
        return {
            "sampleWindow": self.max_samples,
            "modules": modules,
            "generatedAt": time(),
        }


def _percentile(samples: list[float], percentile: float) -> float:
    if len(samples) == 1:
        return round(samples[0], 2)
    try:
        values = quantiles(samples, n=100, method="inclusive")
        return round(values[max(0, min(98, int(percentile * 100) - 1))], 2)
    except (IndexError, StatisticsError):
        return round(max(samples), 2)


try:
    from statistics import StatisticsError
except ImportError:  # pragma: no cover
    StatisticsError = ValueError


_REGISTRY = MetricsRegistry()


def get_metrics_registry() -> MetricsRegistry:
    return _REGISTRY
