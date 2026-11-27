"""Tamper-evident local audit-chain regression tests."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app.api.repository import ApiRepository


class AuditChainTests(unittest.TestCase):
    def test_alert_and_activity_mutations_are_chained_and_verifiable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = ApiRepository(str(Path(directory) / "state.json"))
            repo.upsert("alerts", {"id": "ALT-1", "status": "open"})
            repo.add_activity({"id": "LOG-1", "actionType": "created"})
            repo.update("alerts", "ALT-1", {"status": "resolved"})

            result = repo.verify_audit_chain()

            self.assertTrue(result["verified"])
            self.assertEqual(result["entries"], 3)
            self.assertEqual(repo.audit_chain_status()["mode"], "local_hash_chain")

    def test_tampering_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = ApiRepository(str(Path(directory) / "state.json"))
            repo.upsert("alerts", {"id": "ALT-1", "status": "open"})
            repo._state["auditChain"][0]["chainHash"] = "tampered"

            result = repo.verify_audit_chain()

            self.assertFalse(result["verified"])
            self.assertEqual(result["status"], "broken")

    def test_hmac_signing_detects_recomputed_chain_without_key(self) -> None:
        with patch.dict(os.environ, {"AUDIT_CHAIN_HMAC_KEY": "test-hmac-secret-key"}):
            with tempfile.TemporaryDirectory() as directory:
                repo = ApiRepository(str(Path(directory) / "state.json"))
                repo.upsert("alerts", {"id": "ALT-1", "status": "open"})

                status = repo.audit_chain_status()
                self.assertTrue(status["verified"])
                self.assertTrue(status["hmacConfigured"])
                self.assertEqual(status["signedEntries"], 1)
                self.assertEqual(status["mode"], "hmac_signed_hash_chain")

                # Attacker with DB write access edits chainHash & recomputes without HMAC key
                repo._state["auditChain"][0]["hmacSignature"] = "0" * 64
                tampered = repo.verify_audit_chain()
                self.assertFalse(tampered["verified"])
                self.assertEqual(tampered["status"], "broken")


if __name__ == "__main__":
    unittest.main()
