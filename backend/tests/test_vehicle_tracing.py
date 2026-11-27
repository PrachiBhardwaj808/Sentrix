"""Unit tests for cross-camera vehicle tracing, wildcard search, and plausibility filtering."""

from __future__ import annotations

import unittest

from backend.app.services.inference.anpr.tracing import (
    matches_plate_pattern,
    plate_similarity,
    trace_vehicle_trail,
)


class VehicleTracingTests(unittest.TestCase):
    def test_ocr_confusion_similarity_scores_close_plates_high(self) -> None:
        self.assertEqual(plate_similarity("MH12AB1234", "MH 12 AB 1234"), 1.0)
        sim = plate_similarity("MH12AB1234", "MH12A81234")
        self.assertGreaterEqual(sim, 0.90)
        self.assertLess(plate_similarity("MH12AB1234", "DL09ZZ9999"), 0.5)

    def test_wildcard_plate_search_matches_partial_patterns(self) -> None:
        self.assertTrue(matches_plate_pattern("DL1CER4821", "DL1?ER48??"))
        self.assertTrue(matches_plate_pattern("MH12AB1234", "MH12*34"))
        self.assertFalse(matches_plate_pattern("DL1CER9999", "DL1?ER48??"))

    def test_trace_orders_sightings_and_filters_implausible_speed(self) -> None:
        sightings = [
            {
                "id": "S2",
                "cameraId": "CAM-2",
                "plateNumber": "MH12A81234",
                "confidence": 0.88,
                "timestamp": "2026-11-27T10:15:00Z",
                "coordinates": {"lat": 28.6304, "lng": 77.2177},
            },
            {
                "id": "S1",
                "cameraId": "CAM-1",
                "plateNumber": "MH12AB1234",
                "confidence": 0.94,
                "timestamp": "2026-11-27T10:00:00Z",
                "coordinates": {"lat": 28.6139, "lng": 77.2090},
            },
            {
                "id": "S3",
                "cameraId": "CAM-3",
                "plateNumber": "MH12AB1234",
                "confidence": 0.91,
                "timestamp": "2026-11-27T10:16:00Z",
                "coordinates": {"lat": 28.9500, "lng": 77.5000},  # ~45 km in 1 min -> implausible
            },
        ]

        trail = trace_vehicle_trail(sightings, query_plate="MH12AB1234", max_speed_kmh=140.0)

        self.assertTrue(trail["requiresOperatorReview"])
        self.assertEqual([s["id"] for s in trail["sightings"]], ["S1", "S2", "S3"])
        self.assertEqual(len(trail["links"]), 1)
        self.assertEqual(trail["links"][0]["fromCameraId"], "CAM-1")
        self.assertEqual(trail["links"][0]["toCameraId"], "CAM-2")
        self.assertGreater(trail["links"][0]["confidence"], 0.7)
        self.assertEqual(len(trail["rejectedLinks"]), 1)
        self.assertEqual(trail["rejectedLinks"][0]["reason"], "implausible_travel_speed")


if __name__ == "__main__":
    unittest.main()
