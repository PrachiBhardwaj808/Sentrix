"""Regression tests for data that must stay server-side."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.app.api.repository import ApiRepository


class RepositorySecurityTests(unittest.TestCase):
    def test_snapshot_hides_auth_users_but_reset_preserves_them(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            repository = ApiRepository(str(Path(temporary_directory) / "state.json"))
            repository._state["authUsers"] = [{"operatorId": "ADMIN-001", "passwordHash": "hashed-only"}]
            repository.upsert("watchlistEntries", {
                "id": "WATCH-TEST",
                "type": "plate",
                "value": "TEST123",
            })

            public_snapshot = repository.snapshot()
            self.assertNotIn("authUsers", public_snapshot)
            self.assertEqual(public_snapshot["watchlistEntries"][0]["value"], "TEST123")

            repository.reset()
            self.assertEqual(repository._state["authUsers"][0]["passwordHash"], "hashed-only")
            self.assertEqual(repository.snapshot()["watchlistEntries"][0]["id"], "WATCH-TEST")


if __name__ == "__main__":
    unittest.main()
