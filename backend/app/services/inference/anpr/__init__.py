"""Indian automatic number plate recognition service."""

from .plate_format import is_indian_plate, normalize_indian_plate
from .service import AnprService

__all__ = ["AnprService", "is_indian_plate", "normalize_indian_plate"]
