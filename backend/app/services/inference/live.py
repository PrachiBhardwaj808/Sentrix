"""Live multi-module inference for the local camera preview.

The local preview uses the supplied person-tracking, face-detection, and ANPR
modules through their backend-safe frame services. It performs detection only:
no face identity matching, watchlist lookup, frame persistence, or automatic
incident creation happens here.
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping

from .anpr import AnprService
from .contracts import BoundingBox, InferenceDetection
from .device import resolve_device
from .face import FaceDetectionService
from .person import PersonTrackingService
from ..monitoring.metrics import get_metrics_registry


class InferenceConfigurationError(RuntimeError):
    """Raised when the JPEG frame or inference dependencies are unavailable."""


_PIPELINE_LOCK = threading.Lock()
_PIPELINE: "LiveInferencePipeline | None" = None
_MODULE_IDS = frozenset({"person_tracking", "face_detection", "anpr", "weapon_detection"})
_DEFAULT_MODULE_IDS = frozenset({"person_tracking", "face_detection", "anpr"})


def _backend_dir() -> Path:
    return Path(__file__).resolve().parents[3]


def _env_flag(values: Mapping[str, str], name: str, default: bool) -> bool:
    value = values.get(name, "").strip().lower()
    if not value:
        return default
    return value in {"1", "true", "yes", "on"}


def _env_float(values: Mapping[str, str], name: str, default: float) -> float:
    try:
        return max(0.05, min(float(values.get(name, str(default))), 0.99))
    except (TypeError, ValueError):
        return default


def _env_int(values: Mapping[str, str], name: str, default: int) -> int:
    try:
        return max(320, min(int(values.get(name, str(default))), 1280))
    except (TypeError, ValueError):
        return default


def _env_interval(values: Mapping[str, str], name: str, default: int) -> int:
    try:
        return max(1, min(int(values.get(name, str(default))), 120))
    except (TypeError, ValueError):
        return default


def _env_max_dim(values: Mapping[str, str], name: str, default: int) -> int:
    try:
        return max(1, min(int(values.get(name, str(default))), 4096))
    except (TypeError, ValueError):
        return default


def _model_path(values: Mapping[str, str], name: str, fallback: Path) -> Path:
    configured = values.get(name, "").strip()
    return Path(configured).expanduser() if configured else fallback


@dataclass(frozen=True)
class LiveInferenceConfig:
    """Runtime configuration for the three supplied frame-level modules."""

    person_model_path: Path
    face_model_path: Path
    anpr_vehicle_model_path: Path
    anpr_plate_model_path: Path
    person_enabled: bool
    face_enabled: bool
    anpr_enabled: bool
    person_confidence: float
    face_confidence: float
    anpr_vehicle_confidence: float
    anpr_plate_confidence: float
    anpr_image_size: int
    face_frame_interval: int = 3
    anpr_frame_interval: int = 5
    inference_max_dim: int = 960
    device: str = "cuda"
    weapon_model_path: Path = Path("weapon.pt")
    face_provider: str = "opencv_yolo"
    insightface_model_name: str = "buffalo_l"
    insightface_root: str = ""

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "LiveInferenceConfig":
        values = environ if environ is not None else os.environ
        model_dir = _backend_dir() / ".localdata" / "models"
        person_model_path = _model_path(values, "PERSON_MODEL_PATH", model_dir / "yolov8n.pt")
        return cls(
            person_model_path=person_model_path,
            face_model_path=_model_path(values, "FACE_MODEL_PATH", model_dir / "yolov8n-face-keypoints.pt"),
            anpr_vehicle_model_path=_model_path(values, "ANPR_VEHICLE_MODEL_PATH", person_model_path),
            anpr_plate_model_path=_model_path(values, "ANPR_PLATE_MODEL_PATH", model_dir / "INPD_more_accuracy_n.pt"),
            weapon_model_path=_model_path(values, "WEAPON_MODEL_PATH", model_dir / "weapon.pt"),
            person_enabled=_env_flag(values, "AI_ENABLE_PERSON_TRACKING", True),
            face_enabled=_env_flag(values, "AI_ENABLE_FACE_DETECTION", True),
            anpr_enabled=_env_flag(values, "AI_ENABLE_ANPR", True),
            person_confidence=_env_float(values, "AI_FRAME_CONFIDENCE", 0.50),
            face_confidence=_env_float(values, "AI_FACE_CONFIDENCE", 0.50),
            anpr_vehicle_confidence=_env_float(values, "AI_ANPR_VEHICLE_CONFIDENCE", 0.45),
            anpr_plate_confidence=_env_float(values, "AI_ANPR_PLATE_CONFIDENCE", 0.15),
            anpr_image_size=_env_int(values, "AI_ANPR_IMAGE_SIZE", 736),
            face_frame_interval=_env_interval(values, "AI_FACE_FRAME_INTERVAL", 3),
            anpr_frame_interval=_env_interval(values, "AI_ANPR_FRAME_INTERVAL", 5),
            inference_max_dim=_env_max_dim(values, "AI_INFERENCE_MAX_DIM", 960),
            device=resolve_device(values.get("AI_DEVICE", "cuda")),
            face_provider=values.get("FACE_PROVIDER", "opencv_yolo").strip().lower() or "opencv_yolo",
            insightface_model_name=values.get("INSIGHTFACE_MODEL_NAME", "buffalo_l").strip() or "buffalo_l",
            insightface_root=values.get("INSIGHTFACE_ROOT", "").strip(),
        )


class LiveInferencePipeline:
    """Cache model services and merge their normalized frame results.

    A pipeline instance represents one local preview stream. Production camera
    workers should construct one instance per physical camera so DeepSORT IDs
    cannot cross between feeds.
    """

    def __init__(
        self,
        config: LiveInferenceConfig,
        person_factory: Callable[..., Any] = PersonTrackingService,
        face_factory: Callable[..., Any] = FaceDetectionService,
        anpr_factory: Callable[..., Any] = AnprService,
    ) -> None:
        self.config = config
        self._person_factory = person_factory
        self._face_factory = face_factory
        self._anpr_factory = anpr_factory
        self._person_service: Any = None
        self._face_service: Any = None
        self._anpr_service: Any = None
        self._frame_index = 0
        self._cached_module_detections: dict[str, list[dict[str, Any]]] = {}
        self._cached_module_results: dict[str, dict[str, Any]] = {}
        self._last_frame_at: float | None = None
        self._inference_fps = 0.0
        self._dropped_frames = 0

    def process_frame(
        self,
        frame: Any,
        requested_modules: Iterable[str] | None = None,
        camera_id: str = "local-preview",
    ) -> dict[str, Any]:
        height, width = frame.shape[:2]
        started = time.perf_counter()
        if self._last_frame_at is not None:
            elapsed = started - self._last_frame_at
            if elapsed > 0:
                self._inference_fps = round(1 / elapsed, 1)
        self._last_frame_at = started
        detections: list[dict[str, Any]] = []
        selected = _select_modules(requested_modules)
        frame_index = self._frame_index
        self._frame_index += 1
        inference_frame, scale_x, scale_y = self._prepare_frame(frame, width, height)
        modules = []
        person_detections: list[InferenceDetection] = []
        person_module: dict[str, Any] | None = None
        person_serialized: list[dict[str, Any]] = []
        if "person_tracking" in selected or "face_detection" in selected:
            person_module, person_detections, person_serialized = self._run_person(
                inference_frame,
                width,
                height,
                scale_x,
                scale_y,
            )
        if "person_tracking" in selected and person_module is not None:
            modules.append(person_module)
            detections.extend(person_serialized)
        if "face_detection" in selected:
            if not self.config.face_enabled:
                modules.append(_module_result("face_detection", "Face detection", self.config.face_model_path, "disabled"))
            elif not person_detections:
                self._cached_module_detections.pop("face_detection", None)
                self._cached_module_results.pop("face_detection", None)
                modules.append(
                    _module_result(
                        "face_detection",
                        "Face detection",
                        self.config.face_model_path,
                        "skipped",
                        message="Skipped because no person was detected in this frame.",
                    )
                )
            elif frame_index % self.config.face_frame_interval:
                modules.append(self._append_cached_module("face_detection", detections))
            else:
                modules.append(
                    self._run_face(
                        inference_frame,
                        width,
                        height,
                        scale_x,
                        scale_y,
                        detections,
                    )
                )
        if "anpr" in selected:
            if not self.config.anpr_enabled:
                modules.append(_module_result("anpr", "Indian ANPR", self.config.anpr_plate_model_path, "disabled"))
            elif frame_index % self.config.anpr_frame_interval:
                modules.append(self._append_cached_module("anpr", detections))
            else:
                modules.append(
                    self._run_anpr(
                        inference_frame,
                        width,
                        height,
                        scale_x,
                        scale_y,
                        detections,
                    )
                )
        if "weapon_detection" in selected:
            modules.append(
                _module_result(
                    "weapon_detection",
                    "Potential weapon/object",
                    self.config.weapon_model_path,
                    "disabled",
                    message="Optional adapter not configured; no weapon claim is made.",
                )
            )
        unavailable = any(module["status"] == "unavailable" for module in modules)
        metrics_registry = get_metrics_registry()
        for module in modules:
            if isinstance(module.get("inferenceMs"), (int, float)):
                metrics_registry.record(
                    camera_id,
                    str(module.get("id") or "unknown"),
                    float(module["inferenceMs"]),
                    frame_dropped=self._dropped_frames,
                )
        monitoring = metrics_registry.snapshot(camera_id)
        return {
            "status": "partial" if unavailable else "ok",
            "model": " + ".join(module["label"] for module in modules),
            "device": self.config.device,
            "confidenceThreshold": self.config.person_confidence,
            "inferenceMs": round((time.perf_counter() - started) * 1000, 1),
            "metrics": {
                "captureFps": None,
                "displayFps": None,
                "inferenceFps": self._inference_fps,
                "queueDelayMs": 0.0,
                "droppedFrames": self._dropped_frames,
                "modelHealth": {
                    module["id"]: module["status"] for module in modules
                },
                "modelP50Ms": max((item["p50Ms"] for item in monitoring["modules"]), default=None),
                "modelP95Ms": max((item["p95Ms"] for item in monitoring["modules"]), default=None),
            },
            "frameWidth": width,
            "frameHeight": height,
            "detections": detections,
            "modules": modules,
            "monitoring": monitoring,
        }

    def _prepare_frame(
        self, frame: Any, width: int, height: int
    ) -> tuple[Any, float, float]:
        """Resize only the model input and return x/y factors back to source pixels."""

        max_dim = self.config.inference_max_dim
        largest_dim = max(width, height)
        if largest_dim <= max_dim:
            return frame, 1.0, 1.0

        try:
            import cv2
        except ImportError as exc:
            raise InferenceConfigurationError(
                "OpenCV is required to resize frames before inference."
            ) from exc

        scale = max_dim / largest_dim
        resized_width = max(1, round(width * scale))
        resized_height = max(1, round(height * scale))
        resized = cv2.resize(
            frame,
            (resized_width, resized_height),
            interpolation=cv2.INTER_AREA,
        )
        return resized, width / resized_width, height / resized_height

    def _run_person(
        self,
        frame: Any,
        width: int,
        height: int,
        scale_x: float,
        scale_y: float,
    ) -> tuple[dict[str, Any], list[InferenceDetection], list[dict[str, Any]]]:
        started = time.perf_counter()
        if not self.config.person_enabled:
            return (
                _with_module_timing(_module_result("person_tracking", "Person tracking", self.config.person_model_path, "disabled"), started),
                [],
                [],
            )
        try:
            if self._person_service is None:
                self._person_service = self._person_factory(
                    str(self.config.person_model_path),
                    confidence=self.config.person_confidence,
                    device=self.config.device,
                )
            detections = self._person_service.process_frame(frame)
            serialized = [
                _serialize_detection(item, "person_tracking", width, height, scale_x, scale_y)
                for item in detections
            ]
            return (
                _with_module_timing(_module_result(
                    "person_tracking", "Person tracking", self.config.person_model_path, "active", len(detections)
                ), started),
                list(detections),
                serialized,
            )
        except Exception as exc:
            return (
                _with_module_timing(_module_result(
                    "person_tracking", "Person tracking", self.config.person_model_path, "unavailable", message=_module_error(exc)
                ), started),
                [],
                [],
            )

    def _run_face(
        self,
        frame: Any,
        width: int,
        height: int,
        scale_x: float,
        scale_y: float,
        output: list[dict[str, Any]],
    ) -> dict[str, Any]:
        started = time.perf_counter()
        try:
            if self._face_service is None:
                self._face_service = self._face_factory(
                    str(self.config.face_model_path),
                    confidence=self.config.face_confidence,
                    device=self.config.device,
                    provider=self.config.face_provider,
                    insightface_model_name=self.config.insightface_model_name,
                    insightface_root=self.config.insightface_root,
                    insightface_enabled=self.config.face_provider == "insightface",
                )
            detections = self._face_service.process_frame(frame)
            model_name = getattr(self._face_service, "model_name", self.config.face_model_path.name)
            status_message = getattr(self._face_service, "status_message", "")
            serialized = [
                _serialize_detection(item, "face_detection", width, height, scale_x, scale_y)
                for item in detections
            ]
            output.extend(serialized)
            module = _with_module_timing(_module_result(
                "face_detection", "Face detection", model_name, "active", len(detections), status_message
            ), started)
            self._cache_module("face_detection", module, serialized)
            return module
        except Exception as exc:
            module = _with_module_timing(_module_result(
                "face_detection", "Face detection", self.config.face_model_path, "unavailable", message=_module_error(exc)
            ), started)
            self._cache_module("face_detection", module, [])
            return module

    def _run_anpr(
        self,
        frame: Any,
        width: int,
        height: int,
        scale_x: float,
        scale_y: float,
        output: list[dict[str, Any]],
    ) -> dict[str, Any]:
        started = time.perf_counter()
        try:
            if self._anpr_service is None:
                self._anpr_service = self._anpr_factory(
                    str(self.config.anpr_vehicle_model_path),
                    str(self.config.anpr_plate_model_path),
                    vehicle_confidence=self.config.anpr_vehicle_confidence,
                    plate_confidence=self.config.anpr_plate_confidence,
                    image_size=self.config.anpr_image_size,
                    device=self.config.device,
                )
            detections = self._anpr_service.process_frame(frame)
            model_name = getattr(self._anpr_service, "model_name", self.config.anpr_plate_model_path.name)
            status_message = getattr(self._anpr_service, "status_message", "")
            serialized = [
                _serialize_detection(item, "anpr", width, height, scale_x, scale_y)
                for item in detections
            ]
            output.extend(serialized)
            module = _with_module_timing(_module_result("anpr", "Indian ANPR", model_name, "active", len(detections), status_message), started)
            self._cache_module("anpr", module, serialized)
            return module
        except Exception as exc:
            module = _with_module_timing(_module_result(
                "anpr", "Indian ANPR", self.config.anpr_plate_model_path, "unavailable", message=_module_error(exc)
            ), started)
            self._cache_module("anpr", module, [])
            return module

    def _cache_module(
        self,
        module_id: str,
        module: dict[str, Any],
        detections: list[dict[str, Any]],
    ) -> None:
        self._cached_module_results[module_id] = dict(module)
        self._cached_module_detections[module_id] = list(detections)

    def _append_cached_module(
        self, module_id: str, output: list[dict[str, Any]]
    ) -> dict[str, Any]:
        cached = self._cached_module_results.get(module_id)
        if cached is None:
            return _module_result(
                module_id,
                "Face detection" if module_id == "face_detection" else "Indian ANPR",
                self.config.face_model_path if module_id == "face_detection" else self.config.anpr_plate_model_path,
                "skipped",
                message="Waiting for the first scheduled inference.",
            )
        cached_detections = list(self._cached_module_detections.get(module_id, []))
        output.extend(cached_detections)
        return {
            **cached,
            "message": "Using the last scheduled inference result.",
        }


def _module_result(
    module_id: str,
    label: str,
    model_path: Path | str,
    status: str,
    detection_count: int = 0,
    message: str = "",
) -> dict[str, Any]:
    return {
        "id": module_id,
        "label": label,
        "model": model_path.name if isinstance(model_path, Path) else str(model_path),
        "status": status,
        "detectionCount": detection_count,
        "message": message,
    }


def _with_module_timing(module: dict[str, Any], started: float) -> dict[str, Any]:
    return {**module, "inferenceMs": round((time.perf_counter() - started) * 1000, 2)}


def _serialize_detection(
    detection: InferenceDetection,
    source: str,
    width: int,
    height: int,
    scale_x: float = 1.0,
    scale_y: float = 1.0,
) -> dict[str, Any]:
    box = detection.bounding_box
    scaled_box = BoundingBox(
        round(box.left * scale_x),
        round(box.top * scale_y),
        round(box.right * scale_x),
        round(box.bottom * scale_y),
    )
    attributes = dict(detection.attributes)
    vehicle_bbox = attributes.get("vehicle_bbox")
    if isinstance(vehicle_bbox, (list, tuple)) and len(vehicle_bbox) == 4:
        attributes["vehicle_bbox"] = (
            round(vehicle_bbox[0] * scale_x),
            round(vehicle_bbox[1] * scale_y),
            round(vehicle_bbox[2] * scale_x),
            round(vehicle_bbox[3] * scale_y),
        )
    return {
        "label": detection.label,
        "source": source,
        "confidence": round(float(detection.confidence), 4),
        "box": _normalized_box(scaled_box, width, height),
        "trackId": detection.track_id,
        "attributes": attributes,
    }


def _normalized_box(box: BoundingBox, width: int, height: int) -> dict[str, float]:
    left = max(0, min(width, box.left))
    top = max(0, min(height, box.top))
    right = max(left, min(width, box.right))
    bottom = max(top, min(height, box.bottom))
    return {
        "x": round(left / width * 100, 3),
        "y": round(top / height * 100, 3),
        "width": round((right - left) / width * 100, 3),
        "height": round((bottom - top) / height * 100, 3),
    }


def _module_error(exc: Exception) -> str:
    message = str(exc).strip()
    return message[:220] if message else "Module initialization failed."


def _select_modules(requested_modules: Iterable[str] | None) -> frozenset[str]:
    if requested_modules is None:
        return _DEFAULT_MODULE_IDS
    selected = frozenset(module for module in requested_modules if module in _MODULE_IDS)
    return selected or _MODULE_IDS


def _get_pipeline() -> LiveInferencePipeline:
    global _PIPELINE
    config = LiveInferenceConfig.from_env()
    with _PIPELINE_LOCK:
        if _PIPELINE is None or _PIPELINE.config != config:
            _PIPELINE = LiveInferencePipeline(config)
        return _PIPELINE


def detect_frame(
    frame_bytes: bytes,
    requested_modules: Iterable[str] | None = None,
    camera_id: str = "local-preview",
) -> dict[str, Any]:
    """Run the enabled supplied modules on one browser-captured JPEG frame."""

    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        raise InferenceConfigurationError(
            "OpenCV and NumPy are not installed. Install backend/requirements-ai.txt."
        ) from exc

    frame = cv2.imdecode(np.frombuffer(frame_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("The request body is not a readable JPEG frame.")
    return _get_pipeline().process_frame(frame, requested_modules, camera_id=camera_id)
