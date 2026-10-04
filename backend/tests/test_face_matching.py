"""Tests for consent-gated face comparison without using real biometric data."""

from __future__ import annotations

import unittest

from backend.app.services.inference.face.matching import ConsentGatedFaceMatcher, cosine_similarity
from backend.app.services.inference.face.insightface_adapter import InsightFaceAdapter


class FaceMatchingTests(unittest.TestCase):
    def test_cosine_similarity(self) -> None:
        self.assertAlmostEqual(cosine_similarity([1, 0], [1, 0]), 1.0)

    def test_disabled_by_default(self) -> None:
        result = ConsentGatedFaceMatcher().compare([1, 0], [{"profileId": "demo", "embedding": [1, 0]}])
        self.assertEqual(result.status, "disabled")

    def test_unknown_below_threshold_and_potential_match_above(self) -> None:
        matcher = ConsentGatedFaceMatcher(threshold=0.9, enabled=True)
        unknown = matcher.compare([0, 1], [{"profileId": "demo", "embedding": [1, 0]}])
        match = matcher.compare([1, 0], [{"profileId": "demo", "embedding": [1, 0]}])
        self.assertEqual(unknown.status, "unknown")
        self.assertEqual(match.status, "potential_match")
        self.assertIn("human verification", match.message.lower())

    def test_insightface_adapter_is_safe_when_disabled(self) -> None:
        adapter = InsightFaceAdapter(enabled=False)
        self.assertEqual(adapter.status, "disabled")
        self.assertEqual(adapter.process_frame(object()), [])


if __name__ == "__main__":
    unittest.main()
