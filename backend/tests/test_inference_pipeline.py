"""Contract, bounded-buffer, and triage tests for the low-latency path."""

from __future__ import annotations

import unittest

from backend.app.services.inference.buffer import LatestFrameBuffer
from backend.app.services.inference.schema import DetectionEvent
from backend.app.services.triage.agent import IncidentTriageAgent


class InferencePipelineTests(unittest.TestCase):
    def test_detection_contract_normalizes_frontend_box(self) -> None:
        event = DetectionEvent.from_mapping({
            "label": "license_plate",
            "box": {"x": 10, "y": 20, "width": 30, "height": 15},
            "confidence": 0.84,
            "cameraId": "CAM-01",
        })
        self.assertEqual(event.type, "plate")
        self.assertEqual(event.bbox, (10.0, 20.0, 40.0, 35.0))
        self.assertEqual(event.as_dict()["camera_id"], "CAM-01")

    def test_latest_frame_buffer_drops_stale_frames(self) -> None:
        buffer = LatestFrameBuffer()
        buffer.push("old")
        buffer.push("new")
        self.assertEqual(buffer.pop_latest()[0], "new")
        metrics = buffer.metrics()
        self.assertEqual(metrics.dropped, 1)

    def test_triage_is_reviewable_and_deduplicates_same_track(self) -> None:
        agent = IncidentTriageAgent(window_seconds=30)
        observation = {
            "type": "intrusion",
            "bbox": [0, 0, 10, 10],
            "confidence": 0.91,
            "camera_id": "CAM-01",
            "track_id": "track-1",
        }
        incident = agent.triage("CAM-01", [observation])
        duplicate = agent.triage("CAM-01", [observation])
        self.assertEqual(incident["severity"], "high")
        self.assertTrue(incident["humanReviewRequired"])
        self.assertIn("Human Verification Required", incident["operatorMessage"])
        self.assertIsNone(duplicate)


if __name__ == "__main__":
    unittest.main()
