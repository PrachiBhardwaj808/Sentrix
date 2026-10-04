"""No-network tests for guard dispatch OTP safety rules."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.config.settings")

from backend.app.services.notifications.otp import (
    OtpConfig,
    cooldown_remaining,
    generate_otp,
    hash_otp,
    verify_otp,
)


class DispatchOtpTests(unittest.TestCase):
    def test_otp_is_six_digits_and_hash_is_not_plaintext(self) -> None:
        otp = generate_otp()
        stored = hash_otp(otp)

        self.assertRegex(otp, r"^\d{6}$")
        self.assertNotEqual(stored, otp)
        self.assertTrue(verify_otp(otp, stored))
        self.assertFalse(verify_otp("000000" if otp != "000000" else "111111", stored))

    def test_configuration_is_bounded(self) -> None:
        config = OtpConfig.from_env({
            "OTP_TTL_SECONDS": "1",
            "OTP_MAX_ATTEMPTS": "99",
            "OTP_RESEND_COOLDOWN_SECONDS": "bad",
        })

        self.assertEqual(config.ttl_seconds, 60)
        self.assertEqual(config.max_attempts, 10)
        self.assertEqual(config.resend_cooldown_seconds, 60)

    def test_cooldown_decreases_and_expires(self) -> None:
        recent = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()
        old = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()

        self.assertGreater(cooldown_remaining(recent, OtpConfig(resend_cooldown_seconds=60)), 0)
        self.assertEqual(cooldown_remaining(old, OtpConfig(resend_cooldown_seconds=60)), 0)


if __name__ == "__main__":
    unittest.main()
