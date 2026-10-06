"""Small cache-backed throttles for unauthenticated authentication endpoints."""

from __future__ import annotations

import hashlib

from django.core.cache import cache


class RateLimitExceeded(Exception):
    def __init__(self, retry_after: int) -> None:
        self.retry_after = max(1, retry_after)
        super().__init__("Too many attempts. Try again shortly.")


def enforce_login_limit(operator_id: str, *, limit: int = 10, window_seconds: int = 300) -> None:
    """Limit repeated guesses for an operator ID in a fixed time window."""
    normalized_id = operator_id.strip().casefold() or "<missing>"
    digest = hashlib.sha256(normalized_id.encode("utf-8")).hexdigest()
    window = max(1, int(window_seconds))
    bucket = int(__import__("time").time()) // window
    cache_key = f"sentrix:auth-login:{digest}:{bucket}"

    cache.add(cache_key, 0, timeout=window + 1)
    attempts = cache.incr(cache_key)
    if attempts > max(1, int(limit)):
        remaining = window - (int(__import__("time").time()) % window)
        raise RateLimitExceeded(remaining)
