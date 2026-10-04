"""Frame-level face detection for authorized surveillance workflows."""

from __future__ import annotations

from pathlib import Path
from typing import Any, List

from ..contracts import BoundingBox, InferenceDetection
from .insightface_adapter import InsightFaceAdapter


class FaceDetectionService:
    """Detect faces without persisting or matching identities in this service."""

    def __init__(
        self,
        model_path: str,
        confidence: float = 0.50,
        device: str = "cuda",
        provider: str = "opencv_yolo",
        insightface_model_name: str = "buffalo_l",
        insightface_root: str = "",
        insightface_enabled: bool = False,
    ) -> None:
        self.model_path = model_path
        self.confidence = confidence
        self.device = device
        self.provider = provider
        self._model: Any = None
        self._cascade: Any = None
        self._insightface = InsightFaceAdapter(
            model_name=insightface_model_name,
            root=insightface_root,
            device=device,
            enabled=insightface_enabled and provider == "insightface",
        )
        self.model_name = Path(model_path).name or "face detector"
        self.status_message = ""

    def process_frame(self, frame: Any) -> List[InferenceDetection]:
        """Return detected face locations for a single BGR frame."""

        if self.provider == "insightface":
            detections = self._insightface.process_frame(frame)
            self.model_name = f"InsightFace/{self._insightface.model_name}"
            self.status_message = self._insightface.status_message
            return detections

        self._ensure_loaded()
        if self._cascade is not None:
            import cv2

            gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            boxes = self._cascade.detectMultiScale(
                gray_frame,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(20, 20),
            )
            return [
                InferenceDetection(
                    label="face",
                    confidence=0.75,
                    bounding_box=BoundingBox(int(x), int(y), int(x + width), int(y + height)),
                )
                for x, y, width, height in boxes
            ]

        result = self._model(frame, conf=self.confidence, device=self.device, verbose=False)[0]
        detections: List[InferenceDetection] = []
        for x1, y1, x2, y2, score, _class_id in result.boxes.data.tolist():
            detections.append(
                InferenceDetection(
                    label="face",
                    confidence=float(score),
                    bounding_box=BoundingBox(int(x1), int(y1), int(x2), int(y2)),
                )
            )
        return detections

    def _ensure_loaded(self) -> None:
        if self._model is not None or self._cascade is not None:
            return

        configured_path = Path(self.model_path).expanduser()
        if configured_path.is_file():
            from ultralytics import YOLO

            self._model = YOLO(str(configured_path))
            self.model_name = configured_path.name
            return

        # A dedicated YOLO face weight is preferred, but the browser preview
        # must still provide real face boxes in a fresh local checkout. OpenCV
        # ships this cascade with the AI requirements, so it is a deterministic
        # fallback rather than a network download or fabricated result.
        import cv2

        cascade_path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
        cascade = cv2.CascadeClassifier(str(cascade_path))
        if cascade.empty():
            raise RuntimeError(
                f"Face model not found at {configured_path} and OpenCV face fallback could not load."
            )
        self._cascade = cascade
        self.model_name = "opencv-haarcascade-frontalface"
        self.status_message = "Using OpenCV fallback; set FACE_MODEL_PATH for YOLO face weights."
