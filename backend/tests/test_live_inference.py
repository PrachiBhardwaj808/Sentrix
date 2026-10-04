"""No-network tests for the combined local camera inference pipeline."""

from __future__ import annotations

import unittest
from pathlib import Path
from typing import Any

import numpy as np

from backend.app.services.inference.contracts import BoundingBox, InferenceDetection
from backend.app.services.inference.live import LiveInferenceConfig, LiveInferencePipeline


class FakeService:
    def __init__(self, detections: list[InferenceDetection]) -> None:
        self.detections = detections

    def process_frame(self, frame: Any) -> list[InferenceDetection]:
        return self.detections


class CountingService(FakeService):
    def __init__(self, detections: list[InferenceDetection]) -> None:
        super().__init__(detections)
        self.calls = 0
        self.frame_shapes: list[tuple[int, ...]] = []

    def process_frame(self, frame: Any) -> list[InferenceDetection]:
        self.calls += 1
        self.frame_shapes.append(tuple(frame.shape))
        return super().process_frame(frame)


class LiveInferenceTests(unittest.TestCase):
    def config(self) -> LiveInferenceConfig:
        model = Path("person.pt")
        return LiveInferenceConfig(
            person_model_path=model,
            face_model_path=Path("face.pt"),
            anpr_vehicle_model_path=model,
            anpr_plate_model_path=Path("plate.pt"),
            person_enabled=True,
            face_enabled=True,
            anpr_enabled=True,
            person_confidence=0.35,
            face_confidence=0.50,
            anpr_vehicle_confidence=0.70,
            anpr_plate_confidence=0.25,
            anpr_image_size=640,
        )

    def test_combines_person_face_and_anpr_results(self) -> None:
        def person_factory(*args: Any, **kwargs: Any) -> FakeService:
            return FakeService([
                InferenceDetection("person", 0.91, BoundingBox(10, 20, 110, 220), track_id="7")
            ])

        def face_factory(*args: Any, **kwargs: Any) -> FakeService:
            return FakeService([
                InferenceDetection("face", 0.88, BoundingBox(20, 30, 70, 90))
            ])

        def anpr_factory(*args: Any, **kwargs: Any) -> FakeService:
            return FakeService([
                InferenceDetection(
                    "license_plate",
                    0.83,
                    BoundingBox(50, 180, 100, 200),
                    attributes={"plate_number": "MH12AB1234"},
                )
            ])

        pipeline = LiveInferencePipeline(
            self.config(), person_factory=person_factory, face_factory=face_factory, anpr_factory=anpr_factory
        )
        result = pipeline.process_frame(np.zeros((240, 320, 3), dtype=np.uint8))

        self.assertEqual(result["status"], "ok")
        self.assertEqual([item["source"] for item in result["detections"]], [
            "person_tracking", "face_detection", "anpr"
        ])
        self.assertEqual(result["detections"][0]["trackId"], "7")
        self.assertEqual(result["detections"][2]["attributes"]["plate_number"], "MH12AB1234")
        self.assertEqual([module["status"] for module in result["modules"]], ["active"] * 3)

    def test_one_unavailable_module_does_not_hide_other_results(self) -> None:
        def failing_face_factory(*args: Any, **kwargs: Any) -> FakeService:
            raise RuntimeError("face model unavailable")

        pipeline = LiveInferencePipeline(
            self.config(),
            person_factory=lambda *args, **kwargs: FakeService([
                InferenceDetection("person", 0.91, BoundingBox(10, 20, 110, 90))
            ]),
            face_factory=failing_face_factory,
            anpr_factory=lambda *args, **kwargs: FakeService([]),
        )
        result = pipeline.process_frame(np.zeros((100, 200, 3), dtype=np.uint8))

        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["modules"][1]["status"], "unavailable")
        self.assertEqual(result["modules"][1]["message"], "face model unavailable")

    def test_face_is_skipped_when_current_frame_has_no_people(self) -> None:
        face_calls = 0

        def face_factory(*args: Any, **kwargs: Any) -> FakeService:
            nonlocal face_calls
            face_calls += 1
            return FakeService([
                InferenceDetection("face", 0.88, BoundingBox(20, 30, 70, 90))
            ])

        pipeline = LiveInferencePipeline(
            self.config(),
            person_factory=lambda *args, **kwargs: FakeService([]),
            face_factory=face_factory,
            anpr_factory=lambda *args, **kwargs: FakeService([]),
        )
        result = pipeline.process_frame(np.zeros((240, 320, 3), dtype=np.uint8))

        self.assertEqual(face_calls, 0)
        self.assertEqual(result["modules"][1]["status"], "skipped")
        self.assertEqual(result["modules"][1]["detectionCount"], 0)
        self.assertEqual(result["detections"], [])

    def test_face_and_anpr_use_cached_results_on_skipped_frames(self) -> None:
        person = CountingService([
            InferenceDetection("person", 0.91, BoundingBox(10, 20, 110, 220))
        ])
        face = CountingService([
            InferenceDetection("face", 0.88, BoundingBox(20, 30, 70, 90))
        ])
        anpr = CountingService([
            InferenceDetection(
                "license_plate",
                0.83,
                BoundingBox(50, 180, 100, 200),
                attributes={"plate_number": "MH12AB1234"},
            )
        ])
        config = self.config()
        config = LiveInferenceConfig(
            **{**config.__dict__, "face_frame_interval": 2, "anpr_frame_interval": 3}
        )
        pipeline = LiveInferencePipeline(
            config,
            person_factory=lambda *args, **kwargs: person,
            face_factory=lambda *args, **kwargs: face,
            anpr_factory=lambda *args, **kwargs: anpr,
        )

        first = pipeline.process_frame(np.zeros((240, 320, 3), dtype=np.uint8))
        second = pipeline.process_frame(np.zeros((240, 320, 3), dtype=np.uint8))

        self.assertEqual(person.calls, 2)
        self.assertEqual(face.calls, 1)
        self.assertEqual(anpr.calls, 1)
        self.assertEqual(second["modules"][1]["message"], "Using the last scheduled inference result.")
        self.assertEqual(second["modules"][2]["message"], "Using the last scheduled inference result.")
        self.assertEqual(second["detections"], first["detections"])

    def test_resized_inference_scales_boxes_back_to_source_coordinates(self) -> None:
        config = LiveInferenceConfig(
            **{**self.config().__dict__, "face_enabled": False, "anpr_enabled": False, "inference_max_dim": 500}
        )
        person = CountingService([
            InferenceDetection("person", 0.91, BoundingBox(25, 20, 125, 70))
        ])
        pipeline = LiveInferencePipeline(
            config,
            person_factory=lambda *args, **kwargs: person,
        )

        result = pipeline.process_frame(np.zeros((1000, 2000, 3), dtype=np.uint8), ["person_tracking"])

        self.assertEqual(person.frame_shapes, [(250, 500, 3)])
        self.assertEqual(result["frameWidth"], 2000)
        self.assertEqual(result["frameHeight"], 1000)
        self.assertEqual(result["detections"][0]["box"], {"x": 5.0, "y": 8.0, "width": 20.0, "height": 20.0})


if __name__ == "__main__":
    unittest.main()
