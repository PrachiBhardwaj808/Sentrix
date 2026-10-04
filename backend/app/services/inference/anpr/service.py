"""Frame-level ANPR service suitable for a Django worker.

Model loading is lazy so Django web processes do not load GPU/CPU models until
an inference worker actually needs them. Model weights are runtime assets and
must be supplied through local, non-versioned paths.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable, List, Optional, Tuple

from ..contracts import BoundingBox, InferenceDetection
from .plate_format import is_indian_plate, normalize_indian_plate


class AnprService:
    """Detect vehicles and Indian registration plates in an OpenCV BGR frame."""

    VEHICLE_CLASS_IDS = {2, 3, 5, 7}  # car, motorcycle, bus, truck in COCO

    def __init__(
        self,
        vehicle_model_path: str,
        plate_model_path: str,
        vehicle_confidence: float = 0.45,
        plate_confidence: float = 0.15,
        image_size: int = 736,
        use_gpu_for_ocr: bool = False,
        device: str = "cuda",
    ) -> None:
        self.vehicle_model_path = vehicle_model_path
        self.plate_model_path = plate_model_path
        self.vehicle_confidence = vehicle_confidence
        self.plate_confidence = plate_confidence
        self.image_size = image_size
        self.use_gpu_for_ocr = use_gpu_for_ocr
        self.device = device
        self._vehicle_model: Any = None
        self._plate_model: Any = None
        self._ocr_reader: Any = None
        self._plate_model_checked = False
        self.model_name = Path(plate_model_path).name or "plate detector"
        self.status_message = ""

    def process_frame(self, frame: Any) -> List[InferenceDetection]:
        """Return recognized plates paired with their containing vehicle box."""

        self._ensure_loaded()
        vehicles = list(self._vehicle_boxes(frame))
        if not vehicles:
            return []
        detections: List[InferenceDetection] = []

        if self._plate_model is None:
            return self._fallback_vehicle_crop_ocr(frame, vehicles)

        plate_result = self._plate_model(
            frame,
            conf=self.plate_confidence,
            imgsz=self.image_size,
            device=self.device,
            verbose=False,
        )[0]
        for x1, y1, x2, y2, confidence, _class_id in plate_result.boxes.data.tolist():
            plate_box = BoundingBox(int(x1), int(y1), int(x2), int(y2))
            vehicle_box = self._containing_vehicle(plate_box, vehicles)
            if vehicle_box is None:
                continue

            plate_text, ocr_confidence = self._read_plate(frame, plate_box)
            if plate_text is None:
                continue

            detections.append(
                InferenceDetection(
                    label="license_plate",
                    confidence=min(float(confidence), ocr_confidence),
                    bounding_box=plate_box,
                    attributes={
                        "plate_number": plate_text,
                        "ocr_confidence": ocr_confidence,
                        "vehicle_bbox": vehicle_box.as_xyxy(),
                    },
                )
            )
        return detections

    def _ensure_loaded(self) -> None:
        if self._vehicle_model is not None and self._plate_model_checked:
            return

        import easyocr
        from ultralytics import YOLO

        if self._vehicle_model is None:
            self._vehicle_model = YOLO(self.vehicle_model_path)
        plate_path = Path(self.plate_model_path).expanduser()
        if not self._plate_model_checked:
            if plate_path.is_file():
                self._plate_model = YOLO(str(plate_path))
            else:
                self._plate_model = None
                self.model_name = "vehicle-crop-ocr"
                self.status_message = (
                    "Plate weight missing; OCR fallback is scanning detected vehicle crops."
                )
            self._plate_model_checked = True
        ocr_device = self.device if self.use_gpu_for_ocr or self.device != "cpu" else False
        self._ocr_reader = easyocr.Reader(["en"], gpu=ocr_device)

    def _fallback_vehicle_crop_ocr(
        self, frame: Any, vehicles: Iterable[BoundingBox]
    ) -> List[InferenceDetection]:
        """Read plates from vehicle crops when a custom plate detector is absent.

        This is intentionally a fallback: a dedicated plate detector remains
        more accurate, but the local demo should still produce useful ANPR
        results when only the general YOLO vehicle weight is available.
        """

        detections: List[InferenceDetection] = []
        seen_text: set[str] = set()
        for vehicle_box in vehicles:
            plate_text, confidence, plate_box = self._read_vehicle_crop(frame, vehicle_box)
            if plate_text is None or plate_text in seen_text:
                continue
            seen_text.add(plate_text)
            detections.append(
                InferenceDetection(
                    label="license_plate",
                    confidence=confidence,
                    bounding_box=plate_box or vehicle_box,
                    attributes={
                        "plate_number": plate_text,
                        "ocr_confidence": confidence,
                        "vehicle_bbox": vehicle_box.as_xyxy(),
                        "ocr_mode": "vehicle_crop_fallback",
                    },
                )
            )
        return detections

    def _read_vehicle_crop(
        self, frame: Any, vehicle_box: BoundingBox
    ) -> Tuple[Optional[str], float, Optional[BoundingBox]]:
        frame_height, frame_width = frame.shape[:2]
        left = max(0, min(frame_width, vehicle_box.left))
        top = max(0, min(frame_height, vehicle_box.top))
        right = max(left, min(frame_width, vehicle_box.right))
        bottom = max(top, min(frame_height, vehicle_box.bottom))
        crop = frame[top:bottom, left:right]
        if crop is None or crop.size == 0:
            return None, 0.0, None

        crop_height, crop_width = crop.shape[:2]
        candidate_ranges = [
            (0, crop_height),
            (int(crop_height * 0.30), crop_height),
            (int(crop_height * 0.50), crop_height),
        ]
        best_text: Optional[str] = None
        best_confidence = 0.0
        best_box: Optional[BoundingBox] = None
        for candidate_top, candidate_bottom in candidate_ranges:
            candidate = crop[candidate_top:candidate_bottom, :]
            if candidate is None or candidate.size == 0:
                continue
            resized, scale = self._upscale_for_ocr(candidate)
            for ocr_box, raw_text, confidence in self._ocr_results(resized):
                text = normalize_indian_plate(raw_text)
                score = float(confidence)
                if not is_indian_plate(text) or score <= best_confidence:
                    continue
                points = [(float(point[0]) / scale, float(point[1]) / scale) for point in ocr_box]
                ocr_left = int(min(point[0] for point in points))
                ocr_top = int(min(point[1] for point in points))
                ocr_right = int(max(point[0] for point in points))
                ocr_bottom = int(max(point[1] for point in points))
                best_text = text
                best_confidence = score
                best_box = BoundingBox(
                    left + ocr_left,
                    top + candidate_top + ocr_top,
                    left + ocr_right,
                    top + candidate_top + ocr_bottom,
                )
        return best_text, best_confidence, best_box

    @staticmethod
    def _upscale_for_ocr(crop: Any) -> Tuple[Any, float]:
        try:
            import cv2
        except ImportError:
            return crop, 1.0
        height, width = crop.shape[:2]
        scale = min(4.0, max(1.0, 640.0 / max(1, width)))
        if scale == 1.0:
            return crop, scale
        return cv2.resize(crop, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_CUBIC), scale

    def _ocr_results(self, crop: Any) -> Iterable[Tuple[Any, str, float]]:
        try:
            return self._ocr_reader.readtext(
                crop,
                detail=1,
                paragraph=False,
                allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
                text_threshold=0.35,
                low_text=0.20,
                link_threshold=0.20,
                mag_ratio=1.5,
            )
        except TypeError:
            # Keep compatibility with older EasyOCR versions that do not
            # expose every optional threshold argument.
            return self._ocr_reader.readtext(
                crop,
                detail=1,
                paragraph=False,
                allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
            )

    def _vehicle_boxes(self, frame: Any) -> Iterable[BoundingBox]:
        result = self._vehicle_model(
            frame,
            conf=self.vehicle_confidence,
            imgsz=self.image_size,
            device=self.device,
            verbose=False,
        )[0]
        for x1, y1, x2, y2, _confidence, class_id in result.boxes.data.tolist():
            if int(class_id) in self.VEHICLE_CLASS_IDS:
                yield BoundingBox(int(x1), int(y1), int(x2), int(y2))

    @staticmethod
    def _containing_vehicle(
        plate_box: BoundingBox, vehicles: Iterable[BoundingBox]
    ) -> Optional[BoundingBox]:
        """Require the detected plate to be fully inside a detected vehicle."""
        for vehicle in vehicles:
            if (
                vehicle.left <= plate_box.left
                and vehicle.top <= plate_box.top
                and vehicle.right >= plate_box.right
                and vehicle.bottom >= plate_box.bottom
            ):
                return vehicle
        return None

    def _read_plate(
        self, frame: Any, plate_box: BoundingBox
    ) -> Tuple[Optional[str], float]:
        crop = frame[plate_box.top : plate_box.bottom, plate_box.left : plate_box.right]
        if crop is None or crop.size == 0:
            return None, 0.0

        best_text: Optional[str] = None
        best_confidence = 0.0
        for _bbox, raw_text, confidence in self._ocr_results(crop):
            text = normalize_indian_plate(raw_text)
            if is_indian_plate(text) and float(confidence) > best_confidence:
                best_text = text
                best_confidence = float(confidence)
        return best_text, best_confidence
