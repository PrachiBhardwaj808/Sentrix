"""Bounded p50/p95 inference metrics tests."""

from __future__ import annotations

import unittest

from backend.app.services.monitoring.metrics import MetricsRegistry


class MetricsRegistryTests(unittest.TestCase):
    def test_snapshot_reports_latency_percentiles_per_camera_module(self) -> None:
        registry = MetricsRegistry(max_samples=20)
        for value in (10, 20, 30, 40, 50):
            registry.record("CAM-1", "face_detection", value)

        module = registry.snapshot("CAM-1")["modules"][0]

        self.assertEqual(module["p50Ms"], 30.0)
        self.assertEqual(module["p95Ms"], 48.0)
        self.assertEqual(module["samples"], 5)


if __name__ == "__main__":
    unittest.main()
