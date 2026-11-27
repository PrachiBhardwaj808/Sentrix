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
        self.assertEqual(normalize_indian_plate("MH01A123"), "MH01A123")
        self.assertTrue(is_indian_plate("KA05M1234"))

    def test_plate_normalization_supports_bharat_series_and_temporary_formats(self) -> None:
        self.assertEqual(normalize_indian_plate("22 BH 1234 AA"), "22BH1234AA")
        self.assertTrue(is_indian_plate("22BH1234AA"))
        self.assertTrue(is_indian_plate("24BH0001A"))
        self.assertEqual(normalize_indian_plate("228H1234AA"), "22BH1234AA")
        self.assertTrue(is_indian_plate("MH12TR1234"))
        self.assertTrue(is_indian_plate("TS09T1234AA"))

    def test_plate_normalization_repairs_ocr_confusions(self) -> None:
        self.assertEqual(normalize_indian_plate("MHI2AB1234"), "MH12AB1234")
        self.assertEqual(normalize_indian_plate("DL01C123O"), "DL01C1230")

    def test_plate_validation_rejects_invalid_inputs(self) -> None:
        for invalid in ("", "ABC", "12345678", "MH12AB", "TOOLONGPLATE123", "12AB1234CD"):
            self.assertFalse(is_indian_plate(invalid), f"Expected rejection for {invalid!r}")

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
