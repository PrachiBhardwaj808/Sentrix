"""Hash evidence and approved model artifacts without loading them into memory."""

from __future__ import annotations

import hashlib
import hmac
import re
from pathlib import Path
from typing import BinaryIO, Union


PathLike = Union[str, Path]
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
DEFAULT_CHUNK_SIZE = 1024 * 1024


def sha256_bytes(value: bytes) -> str:
    """Return the lowercase SHA-256 digest for ``value``."""

    return hashlib.sha256(value).hexdigest()


def sha256_text(value: str) -> str:
    """Hash a UTF-8 identifier before it is used as an on-chain reference."""

    return sha256_bytes(value.encode("utf-8"))


def sha256_stream(stream: BinaryIO, chunk_size: int = DEFAULT_CHUNK_SIZE) -> str:
    """Hash bytes from the stream's current position in bounded memory."""

    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")

    digest = hashlib.sha256()
    while True:
        chunk = stream.read(chunk_size)
        if not chunk:
            break
        digest.update(chunk)
    return digest.hexdigest()


def sha256_file(path: PathLike, chunk_size: int = DEFAULT_CHUNK_SIZE) -> str:
    """Return the SHA-256 digest for a local evidence or model file."""

    with Path(path).open("rb") as stream:
        return sha256_stream(stream, chunk_size=chunk_size)


def is_sha256(value: str) -> bool:
    """Return whether ``value`` is a normalized SHA-256 hexadecimal digest."""

    return bool(SHA256_PATTERN.fullmatch((value or "").lower()))


def verify_file_hash(path: PathLike, expected_sha256: str) -> bool:
    """Constant-time compare of a local file digest with a recorded digest."""

    expected = (expected_sha256 or "").lower()
    if not is_sha256(expected):
        return False
    return hmac.compare_digest(sha256_file(path), expected)
