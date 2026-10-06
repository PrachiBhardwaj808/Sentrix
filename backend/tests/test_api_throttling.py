from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.app.api.throttling import RateLimitExceeded, enforce_login_limit


class MemoryCache:
    def __init__(self) -> None:
        self.values: dict[str, int] = {}

    def add(self, key: str, value: int, timeout: int) -> bool:
        if key in self.values:
            return False
        self.values[key] = value
        return True

    def incr(self, key: str) -> int:
        self.values[key] += 1
        return self.values[key]


class ApiThrottlingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.memory_cache = MemoryCache()
        self.cache_patcher = patch("backend.app.api.throttling.cache", self.memory_cache)
        self.cache_patcher.start()
        self.addCleanup(self.cache_patcher.stop)

    def test_login_attempts_are_limited_per_normalized_operator(self) -> None:
        for _ in range(10):
            enforce_login_limit(" ADMIN-001 ")

        with self.assertRaises(RateLimitExceeded) as raised:
            enforce_login_limit("admin-001")

        self.assertGreaterEqual(raised.exception.retry_after, 1)
        self.assertLessEqual(raised.exception.retry_after, 300)
        self.assertEqual(len(self.memory_cache.values), 1)
        self.assertNotIn("admin-001", next(iter(self.memory_cache.values.keys())))

    def test_different_operator_ids_use_separate_counters(self) -> None:
        for _ in range(10):
            enforce_login_limit("ADMIN-001")
        enforce_login_limit("COMMAND-001")

        self.assertEqual(len(self.memory_cache.values), 2)


if __name__ == "__main__":
    unittest.main()
