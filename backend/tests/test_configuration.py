"""No-network tests for shared backend configuration adapters."""

from __future__ import annotations

import unittest

from backend.app.services.evidence.firebase import (
    FirebaseConfig,
    FirebaseConfigurationError,
    get_status,
)


class FirebaseConfigurationTests(unittest.TestCase):
    def test_empty_environment_keeps_firebase_optional(self) -> None:
        config = FirebaseConfig.from_env({})

        self.assertFalse(config.configured)
        self.assertFalse(get_status({})["configured"])

    def test_service_account_path_configuration_is_supported(self) -> None:
        config = FirebaseConfig.from_env({
            "GOOGLE_APPLICATION_CREDENTIALS": "C:\\secrets\\firebase.json",
            "FIREBASE_PROJECT_ID": "border-demo",
        })

        self.assertTrue(config.configured)
        self.assertEqual(config.credentials_path, "C:\\secrets\\firebase.json")
        self.assertEqual(config.project_id, "border-demo")

    def test_inline_service_account_configuration_uses_all_zip_keys(self) -> None:
        config = FirebaseConfig.from_env({
            "FIREBASE_PROJECT_ID": "border-demo",
            "FIREBASE_CLIENT_EMAIL": "firebase-adminsdk@example.iam.gserviceaccount.com",
            "FIREBASE_PRIVATE_KEY_ID": "private-key-id",
            "FIREBASE_PRIVATE_KEY": "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----\\n",
            "FIREBASE_CLIENT_ID": "client-id",
        })

        self.assertTrue(config.configured)
        self.assertEqual(config.private_key_id, "private-key-id")
        self.assertIn("BEGIN PRIVATE KEY", config.private_key or "")

    def test_partial_inline_configuration_is_rejected(self) -> None:
        with self.assertRaises(FirebaseConfigurationError):
            FirebaseConfig.from_env({"FIREBASE_PROJECT_ID": "border-demo"})
