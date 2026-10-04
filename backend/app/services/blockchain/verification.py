"""Independent checks used by commanders and investigation tooling."""

from __future__ import annotations

from pathlib import Path
from typing import Union

from ..evidence.hashing import verify_file_hash


def verify_evidence_file(path: Union[str, Path], expected_sha256: str) -> bool:
    """Verify that downloaded evidence still matches its on-chain digest."""

    return verify_file_hash(path, expected_sha256)


def verify_successful_receipt(status: int) -> bool:
    """Return whether an EVM receipt represents a successful transaction."""

    return int(status) == 1
