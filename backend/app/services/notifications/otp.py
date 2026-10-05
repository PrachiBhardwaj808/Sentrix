"""Short-lived, backend-only OTP helpers for authorized guard dispatch."""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Mapping

from django.contrib.auth.hashers import check_password, make_password


@dataclass(frozen=True)
class OtpConfig:
    """Operational limits for dispatch verification codes."""

    ttl_seconds: int = 300
    max_attempts: int = 5
    resend_cooldown_seconds: int = 60

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "OtpConfig":
        values = environ if environ is not None else os.environ

        def bounded(name: str, default: int, minimum: int, maximum: int) -> int:
            try:
                return max(minimum, min(int(values.get(name, str(default))), maximum))
            except (TypeError, ValueError):
                return default

        return cls(
            ttl_seconds=bounded("OTP_TTL_SECONDS", 300, 60, 900),
            max_attempts=bounded("OTP_MAX_ATTEMPTS", 5, 1, 10),
            resend_cooldown_seconds=bounded("OTP_RESEND_COOLDOWN_SECONDS", 60, 15, 600),
        )


def generate_otp() -> str:
    """Generate a six-digit code without using predictable time-based values."""

    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(otp: str) -> str:
    """Store only a one-way Django password hash, never the plaintext code."""

    return make_password(otp)


def verify_otp(otp: str, stored_hash: str) -> bool:
    return bool(otp and stored_hash and check_password(otp, stored_hash))


def expires_at(config: OtpConfig | None = None) -> str:
    settings = config or OtpConfig.from_env()
    return (datetime.now(timezone.utc) + timedelta(seconds=settings.ttl_seconds)).isoformat()


def cooldown_remaining(created_at: str, config: OtpConfig | None = None) -> int:
    """Return resend seconds remaining; malformed timestamps fail closed."""

    settings = config or OtpConfig.from_env()
    try:
        timestamp = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return settings.resend_cooldown_seconds
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - timestamp).total_seconds()
    return max(0, int(settings.resend_cooldown_seconds - elapsed))


def dispatch_message(*, otp: str, alert_id: str, sector: str, priority: str, dispatched_at: str) -> str:
    """Keep the guard message concise and explicit about not sharing the OTP."""

    return (
        f"Sentrix {priority.upper()} dispatch {alert_id} for {sector}. "
        f"Report as instructed at {dispatched_at}. Verification OTP: {otp}. "
        "OTP expires soon; do not share it."
    )
