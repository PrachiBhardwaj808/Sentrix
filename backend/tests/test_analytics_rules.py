"""Tests for explainable camera-scoped fence and movement rules."""

from __future__ import annotations

import unittest
from datetime import datetime, timezone

from backend.app.services.analytics.rules import CameraRuleEngine, point_in_polygon


CAMERA = {
    "id": "CAM-01",
    "sector": "NORTH",
    "zonePolygon": [{"x": 10, "y": 10}, {"x": 90, "y": 10}, {"x": 90, "y": 90}, {"x": 10, "y": 90}],
    "dwellTimeSeconds": 10,
    "nightBrightnessThreshold": 65,
}


def detection(track_id: str, x: float = 40, y: float = 40, label: str = "person") -> dict:
    return {
        "label": label,
        "trackId": track_id,
        "confidence": 0.91,
        "box": {"x": x, "y": y, "width": 10, "height": 10},
    }


class AnalyticsRuleTests(unittest.TestCase):
    def test_point_in_polygon(self) -> None:
        self.assertTrue(point_in_polygon((50, 50), CAMERA["zonePolygon"]))
        self.assertFalse(point_in_polygon((95, 50), CAMERA["zonePolygon"]))

    def test_fence_entry_is_explainable_and_deduplicated(self) -> None:
        engine = CameraRuleEngine(cooldown_seconds=30)
        first = engine.evaluate(CAMERA, [detection("track-1", x=0)], now=datetime(2026, 1, 1, tzinfo=timezone.utc))
        second = engine.evaluate(CAMERA, [detection("track-1")], now=datetime(2026, 1, 1, 0, 0, 1, tzinfo=timezone.utc))
        repeated = engine.evaluate(CAMERA, [detection("track-1")], now=datetime(2026, 1, 1, 0, 0, 2, tzinfo=timezone.utc))

        self.assertEqual(first, [])
        self.assertEqual(second[0]["rule"], "virtual_fence_intrusion")
        self.assertEqual(second[0]["direction"], "entry")
        self.assertEqual(repeated, [])

    def test_night_movement_contains_source_reason(self) -> None:
        engine = CameraRuleEngine()
        events = engine.evaluate(CAMERA, [detection("track-2")], brightness=20)

        night_events = [event for event in events if event["rule"] == "night_movement"]
        self.assertEqual(len(night_events), 1)
        self.assertEqual(night_events[0]["nightModeSource"], "brightness")

    def test_face_detection_requires_operator_review_without_identity_match(self) -> None:
        engine = CameraRuleEngine()
        events = engine.evaluate(CAMERA, [detection("face-1", label="face")])

        review_events = [event for event in events if event["rule"] == "unidentified_face_review"]
        self.assertEqual(len(review_events), 1)
        self.assertEqual(review_events[0]["identityStatus"], "unidentified")
        self.assertTrue(review_events[0]["requiresOperatorReview"])
        self.assertEqual(review_events[0]["reason"], "Unidentified face detected — operator review required")


if __name__ == "__main__":
    unittest.main()
