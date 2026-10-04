"""Backend-safe person detection and DeepSORT tracking.

This replaces the source module's hard-coded input/output files and GUI loop
with a frame-level service that can run from a Django worker.
"""

from __future__ import annotations

from typing import Any, List

from ..contracts import BoundingBox, InferenceDetection


class PersonTrackingService:
    """Track people across sequential frames supplied by one camera worker."""

    PERSON_CLASS_ID = 0

    def __init__(
        self,
        model_path: str,
        confidence: float = 0.50,
        max_age: int = 200,
        n_init: int = 2,
        device: str = "cuda",
    ) -> None:
        self.model_path = model_path
        self.confidence = confidence
        self.max_age = max_age
        self.n_init = n_init
        self.device = device
        self._model: Any = None
        self._tracker: Any = None

    def process_frame(self, frame: Any) -> List[InferenceDetection]:
        """Return confirmed person tracks for the next frame of one camera."""

        self._ensure_loaded()
        result = self._model(frame, conf=self.confidence, device=self.device, verbose=False)[0]
        tracker_input = []
        current_detections: list[InferenceDetection] = []
        for x1, y1, x2, y2, score, class_id in result.boxes.data.tolist():
            if int(class_id) != self.PERSON_CLASS_ID:
                continue
            box = BoundingBox(int(x1), int(y1), int(x2), int(y2))
            current_detections.append(
                InferenceDetection(
                    label="person",
                    confidence=float(score),
                    bounding_box=box,
                )
            )
            tracker_input.append(
                (
                    [box.left, box.top, box.right - box.left, box.bottom - box.top],
                    float(score),
                    "person",
                )
            )

        tracks = self._tracker.update_tracks(tracker_input, frame=frame)
        track_ids = self._track_ids_for_current_detections(tracks, current_detections)
        return [
            InferenceDetection(
                label=detection.label,
                confidence=detection.confidence,
                bounding_box=detection.bounding_box,
                track_id=track_ids.get(index),
            )
            for index, detection in enumerate(current_detections)
        ]

    @staticmethod
    def _track_ids_for_current_detections(
        tracks: Any, detections: List[InferenceDetection]
    ) -> dict[int, str]:
        """Attach a stable ID when DeepSORT has confirmed the current box.

        Raw YOLO person boxes are deliberately returned immediately. Waiting for
        DeepSORT confirmation makes a live overlay appear seconds late when
        frames are sent over HTTP.
        """

        track_ids: dict[int, str] = {}
        for track in tracks:
            if not track.is_confirmed():
                continue
            track_confidence = (
                track.get_det_conf()
                if hasattr(track, "get_det_conf")
                else getattr(track, "det_conf", None)
            )
            if track_confidence is None or getattr(track, "time_since_update", 0) > 0:
                continue
            values = track.to_ltrb(orig=True, orig_strict=True)
            if values is None:
                continue
            track_box = BoundingBox(*(int(value) for value in values))
            best_index = -1
            best_overlap = 0.0
            for index, detection in enumerate(detections):
                overlap = PersonTrackingService._intersection_over_union(
                    track_box, detection.bounding_box
                )
                if overlap > best_overlap:
                    best_overlap = overlap
                    best_index = index
            if best_index >= 0 and best_overlap >= 0.5:
                track_ids[best_index] = str(track.track_id)
        return track_ids

    @staticmethod
    def _intersection_over_union(first: BoundingBox, second: BoundingBox) -> float:
        left = max(first.left, second.left)
        top = max(first.top, second.top)
        right = min(first.right, second.right)
        bottom = min(first.bottom, second.bottom)
        intersection = max(0, right - left) * max(0, bottom - top)
        if intersection == 0:
            return 0.0
        first_area = max(1, (first.right - first.left) * (first.bottom - first.top))
        second_area = max(1, (second.right - second.left) * (second.bottom - second.top))
        return intersection / (first_area + second_area - intersection)

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return

        from deep_sort_realtime.deepsort_tracker import DeepSort
        from ultralytics import YOLO

        self._model = YOLO(self.model_path)
        # deep-sort-realtime's embedder only supports CUDA; YOLO still receives
        # the resolved CUDA/MPS/CPU device explicitly on every frame call.
        self._tracker = DeepSort(
            max_age=self.max_age,
            n_init=self.n_init,
            embedder_gpu=self.device == "cuda",
        )
