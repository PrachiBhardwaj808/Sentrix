"""Face detection service; recognition is intentionally a separate workflow."""

from .insightface_adapter import InsightFaceAdapter
from .service import FaceDetectionService

__all__ = ["FaceDetectionService", "InsightFaceAdapter"]
