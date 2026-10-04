"""Runtime device selection for local AI inference."""

from __future__ import annotations


def cuda_available() -> bool:
    try:
        import torch

        return bool(torch.cuda.is_available())
    except Exception:
        return False


def mps_available() -> bool:
    try:
        import torch

        return bool(torch.backends.mps.is_available())
    except Exception:
        return False


def resolve_device(preference: str = "cuda") -> str:
    """Resolve CUDA, Apple Silicon MPS, or CPU for every inference service."""

    requested = preference.strip().lower()
    if requested == "cpu":
        return "cpu"
    if requested == "mps":
        if mps_available():
            return "mps"
        return "cuda" if cuda_available() else "cpu"
    if requested not in {"auto", "cuda"}:
        requested = "cuda"
    if cuda_available():
        return "cuda"
    return "mps" if mps_available() else "cpu"
