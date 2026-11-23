"""Download the pinned MIT YOLO11x accident detector into ignored local data."""
from __future__ import annotations

import hashlib
import os
import tempfile
import urllib.request
from pathlib import Path

MODEL_URL = (
    "https://huggingface.co/Enos-123/traffic-accident-detection-yolo11x/resolve/"
    "cdc556d278e00273fc3af373051b0df2fb7c7f1e/weights/epoch61.pt"
)
EXPECTED_SHA256 = "ea56e358905e79e1451170e699b21ad774ca95e12034ae1ab1f7d09fd3619cae"
TARGET = Path(__file__).resolve().parents[1] / ".localdata/models/traffic-accident.pt"


def main() -> None:
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    if TARGET.exists() and hashlib.sha256(TARGET.read_bytes()).hexdigest() == EXPECTED_SHA256:
        print(f"Model is already present and verified: {TARGET}")
        return
    digest = hashlib.sha256()
    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=TARGET.parent, delete=False) as temporary:
            temporary_path = temporary.name
            with urllib.request.urlopen(MODEL_URL, timeout=60) as response:
                while chunk := response.read(1024 * 1024):
                    temporary.write(chunk)
                    digest.update(chunk)
        if digest.hexdigest() != EXPECTED_SHA256:
            raise RuntimeError(f"Model checksum mismatch: {digest.hexdigest()}")
        os.replace(temporary_path, TARGET)
        print(f"Downloaded and verified model: {TARGET}")
    finally:
        if temporary_path and os.path.exists(temporary_path):
            os.unlink(temporary_path)


if __name__ == "__main__":
    main()
