"""Small Exotel SMS adapter.

Credentials are read only from the Django environment. The adapter does not
log API tokens or message bodies containing sensitive operational data.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Mapping

import requests


class ExotelConfigurationError(RuntimeError):
    """Raised when live Exotel delivery was requested without configuration."""


class ExotelDeliveryError(RuntimeError):
    """Raised when Exotel rejects or cannot receive an SMS request."""


@dataclass(frozen=True)
class ExotelConfig:
    api_key: str
    api_token: str
    account_sid: str
    sender_id: str
    region: str = "mumbai"
    timeout_seconds: int = 15

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "ExotelConfig":
        values = environ if environ is not None else os.environ
        return cls(
            api_key=values.get("EXOTEL_API_KEY", "").strip(),
            api_token=values.get("EXOTEL_API_TOKEN", "").strip(),
            account_sid=values.get("EXOTEL_ACCOUNT_SID", "").strip(),
            sender_id=values.get("EXOTEL_SENDER_ID", "").strip(),
            region=values.get("EXOTEL_REGION", "mumbai").strip().lower() or "mumbai",
            timeout_seconds=max(5, min(int(values.get("EXOTEL_TIMEOUT_SECONDS", "15")), 60)),
        )

    @property
    def configured(self) -> bool:
        return all((self.api_key, self.api_token, self.account_sid, self.sender_id))

    @property
    def api_host(self) -> str:
        return "api.exotel.com" if self.region == "singapore" else "api.in.exotel.com"

    @property
    def sms_url(self) -> str:
        return f"https://{self.api_host}/v1/accounts/{self.account_sid}/sms/send"


def get_status(environ: Mapping[str, str] | None = None) -> dict[str, Any]:
    config = ExotelConfig.from_env(environ)
    return {
        "configured": config.configured,
        "provider": "exotel",
        "region": config.region,
        "senderId": config.sender_id or None,
        "message": "Exotel live SMS is ready." if config.configured else "Exotel credentials are not configured.",
    }


def send_sms(to: str, body: str, *, custom_data: str = "") -> dict[str, Any]:
    config = ExotelConfig.from_env()
    if not config.configured:
        raise ExotelConfigurationError(
            "Exotel live SMS is not configured. Add EXOTEL_API_KEY, EXOTEL_API_TOKEN, "
            "EXOTEL_ACCOUNT_SID, and EXOTEL_SENDER_ID to backend/.env."
        )

    destination = "".join(character for character in str(to) if character.isdigit() or character == "+")
    if len(destination.replace("+", "")) < 8:
        raise ExotelDeliveryError("The recipient phone number is invalid.")
    if not body.strip():
        raise ExotelDeliveryError("The SMS body cannot be empty.")

    payload = {
        "From": config.sender_id,
        "To": destination,
        "Body": body[:1600],
    }
    if custom_data:
        payload["CustomField"] = custom_data[:255]

    try:
        response = requests.post(
            config.sms_url,
            auth=(config.api_key, config.api_token),
            data=payload,
            timeout=config.timeout_seconds,
        )
    except requests.RequestException as exc:
        raise ExotelDeliveryError(f"Exotel request failed: {exc}") from exc

    if not 200 <= response.status_code < 300:
        raise ExotelDeliveryError(f"Exotel rejected the SMS request with HTTP {response.status_code}.")

    provider_message_id = ""
    response_text = response.text.strip()
    for marker in ("<Sid>", "<MessageId>", '"Sid":"', '"message_id":"'):
        if marker in response_text:
            remainder = response_text.split(marker, 1)[1]
            provider_message_id = remainder.split("</", 1)[0].split('"', 1)[0].strip()
            if provider_message_id:
                break

    return {
        "provider": "exotel",
        "status": "sent",
        "providerMessageId": provider_message_id or None,
        "httpStatus": response.status_code,
    }
