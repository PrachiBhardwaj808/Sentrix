"""Optional InsightFace adapter for consent-approved local demonstrations.

The dependency is imported lazily so a normal BorderLens install still works
without InsightFace, ONNX Runtime, or model weights. This adapter only returns
face locations and an internal embedding availability flag; it never sends
embeddings to the browser or asserts a person's identity.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, List

from ..contracts import BoundingBox, InferenceDetection


class InsightFaceAdapter:
    """Run the supplied InsightFace package when explicitly configured."""

    def __init__(
        self,
        model_name: str = "buffalo_l",
        root: str = "",
        device: str = "cpu",
        enabled: bool = False,
    ) -> None:
        self.model_name = model_name or "buffalo_l"
        self.root = Path(root).expanduser() if root else Path.home() / ".insightface"
        self.device = device
        self.enabled = enabled
        self.status = "disabled" if not enabled else "cold"
        self.status_message = (
            "InsightFace adapter disabled; enable it only for an approved consented demonstration."
            if not enabled
            else ""
        )
        self._app: Any = None

    def process_frame(self, frame: Any) -> List[InferenceDetection]:
        if not self.enabled:
            return []
        self._ensure_loaded()
        faces = self._app.get(frame)
        detections: List[InferenceDetection] = []
        for face in faces:
            box = [int(round(value)) for value in face.bbox.tolist()]
            embedding = getattr(face, "embedding", None)
            detections.append(
                InferenceDetection(
                    label="face",
                    confidence=float(getattr(face, "det_score", 0.0)),
                    bounding_box=BoundingBox(box[0], box[1], box[2], box[3]),
                    attributes={
                        "embeddingAvailable": embedding is not None,
                        "identityMatch": "disabled",
                    },
                )
            )
        return detections

    def extract_embeddings(self, frame: Any) -> list[list[float]]:
        """Return embeddings for a protected backend workflow only."""

        if not self.enabled:
            raise RuntimeError("InsightFace embedding extraction is disabled.")
        self._ensure_loaded()
        embeddings: list[list[float]] = []
        for face in self._app.get(frame):
            embedding = getattr(face, "embedding", None)
            if embedding is not None:
                embeddings.append([float(value) for value in embedding.tolist()])
        return embeddings

    def _ensure_loaded(self) -> None:
        if self._app is not None:
            return
        if not self.enabled:
            raise RuntimeError("InsightFace adapter is disabled.")
        try:
            from insightface.app import FaceAnalysis
        except ImportError as exc:
            self.status = "unavailable"
            self.status_message = (
                "InsightFace is not installed. Install the approved local package and its runtime dependencies."
            )
            raise RuntimeError(self.status_message) from exc

        providers = ["CPUExecutionProvider"]
        if self.device.startswith("cuda"):
            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        elif self.device in {"mps", "coreml"}:
            providers = ["CoreMLExecutionProvider", "CPUExecutionProvider"]

        self._app = FaceAnalysis(
            name=self.model_name,
            root=str(self.root),
            allowed_modules=["detection", "recognition"],
            providers=providers,
        )
        self._app.prepare(ctx_id=0 if self.device.startswith("cuda") else -1, det_size=(640, 640))
        self.status = "active"
        self.status_message = "InsightFace detection active; identity matching remains separately disabled."
