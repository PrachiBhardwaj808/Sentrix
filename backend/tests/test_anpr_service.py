"""Focused tests for ANPR fallback OCR and Indian plate normalization."""

from __future__ import annotations

import unittest

import numpy as np

from backend.app.services.inference.anpr.plate_format import is_indian_plate, normalize_indian_plate
from backend.app.services.inference.anpr.service import AnprService


class FakeBoxes:
    data = np.array([[10, 10, 190, 90, 0.90, 2]])


class FakeResult:
    boxes = FakeBoxes()


class FakeVehicleModel:
    def __call__(self, *args, **kwargs):
        return [FakeResult()]


class FakeReader:
    def readtext(self, image, **kwargs):
        return [([[20, 20], [180, 20], [180, 50], [20, 50]], "MH 12 AB 1234", 0.94)]


class AnprServiceTests(unittest.TestCase):
    def test_plate_normalization_supports_common_variable_formats(self) -> None:
        self.assertEqual(normalize_indian_plate("MH 12 AB 1234"), "MH12AB1234")
        self.assertEqual(normalize_indian_plate("DL1C1234"), "DL1C1234")
        self.assertTrue(is_indian_plate("KA05M1234"))

    def test_missing_plate_model_uses_vehicle_crop_ocr(self) -> None:
        service = AnprService("vehicle.pt", "missing-plate.pt", device="cpu")
        service._vehicle_model = FakeVehicleModel()
        service._plate_model = None
        service._plate_model_checked = True
        service._ocr_reader = FakeReader()

        result = service.process_frame(np.zeros((100, 200, 3), dtype=np.uint8))

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].label, "license_plate")
        self.assertEqual(result[0].attributes["plate_number"], "MH12AB1234")
        self.assertEqual(result[0].attributes["ocr_mode"], "vehicle_crop_fallback")


if __name__ == "__main__":
    unittest.main()
