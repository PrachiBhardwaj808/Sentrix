"""Exotel SMS notification adapter.

Provides robust SMS dispatch with dual connect/read timeouts, comprehensive exception
handling, and graceful fallback mock delivery modes for disaster response scenarios
or when demo data is disabled.
"""

from __future__ import annotations

import logging
import os
import re
import secrets
from dataclasses import dataclass
from typing import Any, Mapping

import requests

logger = logging.getLogger(__name__)


class ExotelConfigurationError(RuntimeError):
    """Raised when live Exotel delivery was requested without configuration."""


class ExotelDeliveryError(RuntimeError):
    """Raised when Exotel rejects or cannot receive an SMS request."""


class ExotelTimeoutError(ExotelDeliveryError):
    """Raised when Exotel connection or read times out."""


@dataclass(frozen=True)
class ExotelConfig:
    api_key: str
    api_token: str
    account_sid: str
    sender_id: str
    region: str = "mumbai"
    connect_timeout_seconds: float = 5.0
    read_timeout_seconds: float = 10.0
    allow_mock_fallback: bool = False

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "ExotelConfig":
        values = environ if environ is not None else os.environ

        # Support unified timeout or distinct connect/read timeouts
        default_timeout = float(values.get("EXOTEL_TIMEOUT_SECONDS", "15"))
        connect_timeout = float(
            values.get("EXOTEL_CONNECT_TIMEOUT_SECONDS", str(min(default_timeout, 5.0)))
        )
        read_timeout = float(
            values.get("EXOTEL_READ_TIMEOUT_SECONDS", str(default_timeout))
        )

        mock_fallback = values.get("EXOTEL_MOCK_FALLBACK", "false").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }

        return cls(
            api_key=values.get("EXOTEL_API_KEY", "").strip(),
            api_token=values.get("EXOTEL_API_TOKEN", "").strip(),
            account_sid=values.get("EXOTEL_ACCOUNT_SID", "").strip(),
            sender_id=values.get("EXOTEL_SENDER_ID", "").strip(),
            region=values.get("EXOTEL_REGION", "mumbai").strip().lower() or "mumbai",
            connect_timeout_seconds=max(1.0, min(connect_timeout, 30.0)),
            read_timeout_seconds=max(2.0, min(read_timeout, 60.0)),
            allow_mock_fallback=mock_fallback,
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

    @property
    def timeout_tuple(self) -> tuple[float, float]:
        return (self.connect_timeout_seconds, self.read_timeout_seconds)


def get_status(environ: Mapping[str, str] | None = None) -> dict[str, Any]:
    config = ExotelConfig.from_env(environ)
    return {
        "configured": config.configured,
        "provider": "exotel",
        "region": config.region,
        "senderId": config.sender_id or None,
        "allowMockFallback": config.allow_mock_fallback,
        "timeouts": {
            "connectSeconds": config.connect_timeout_seconds,
            "readSeconds": config.read_timeout_seconds,
        },
        "message": (
            "Exotel live SMS is ready."
            if config.configured
            else "Exotel credentials are not configured (fallback mock mode available)."
            if config.allow_mock_fallback
            else "Exotel credentials are not configured."
        ),
    }


def send_sms(
    to: str,
    body: str,
    *,
    custom_data: str = "",
    allow_mock_fallback: bool | None = None,
) -> dict[str, Any]:
    """
    Send an SMS message through Exotel with connection timeouts, comprehensive
    exception handling, and automatic fallback mock mode on network/provider failure.
    """
    config = ExotelConfig.from_env()
    effective_mock_fallback = (
        allow_mock_fallback
        if allow_mock_fallback is not None
        else config.allow_mock_fallback
    )

    destination = "".join(c for c in str(to) if c.isdigit() or c == "+")
    if len(destination.replace("+", "")) < 8:
        raise ExotelDeliveryError("The recipient phone number is invalid.")
    if not body.strip():
        raise ExotelDeliveryError("The SMS body cannot be empty.")

    # 1. Handle unconfigured state
    if not config.configured:
        if effective_mock_fallback:
            logger.info("Exotel unconfigured; generating simulated mock SMS for %s", destination)
            return {
                "provider": "exotel_mock_fallback",
                "status": "mock_delivered",
                "providerMessageId": f"MOCK-UNCONF-{secrets.token_hex(6).upper()}",
                "httpStatus": 200,
                "mock": True,
                "recipient": destination,
                "message": "Exotel credentials unconfigured; simulated fallback delivery succeeded.",
            }
        raise ExotelConfigurationError(
            "Exotel live SMS is not configured. Add EXOTEL_API_KEY, EXOTEL_API_TOKEN, "
            "EXOTEL_ACCOUNT_SID, and EXOTEL_SENDER_ID to backend/.env."
        )

    payload = {
        "From": config.sender_id,
        "To": destination,
        "Body": body[:1600],
    }
    if custom_data:
        payload["CustomField"] = custom_data[:255]

    # 2. Dispatch with dual connect/read timeouts and comprehensive exception handling
    try:
        response = requests.post(
            config.sms_url,
            auth=(config.api_key, config.api_token),
            data=payload,
            timeout=config.timeout_tuple,
        )
    except requests.exceptions.ConnectTimeout as exc:
        err_msg = f"Exotel connection timed out during handshake ({config.connect_timeout_seconds}s): {exc}"
        logger.warning(err_msg)
        if effective_mock_fallback:
            return _build_mock_fallback(destination, "ConnectTimeout", err_msg)
        raise ExotelTimeoutError(err_msg) from exc
    except requests.exceptions.ReadTimeout as exc:
        err_msg = f"Exotel read timed out waiting for server response ({config.read_timeout_seconds}s): {exc}"
        logger.warning(err_msg)
        if effective_mock_fallback:
            return _build_mock_fallback(destination, "ReadTimeout", err_msg)
        raise ExotelTimeoutError(err_msg) from exc
    except requests.exceptions.SSLError as exc:
        err_msg = f"Exotel SSL verification failed: {exc}"
        logger.error(err_msg)
        if effective_mock_fallback:
            return _build_mock_fallback(destination, "SSLError", err_msg)
        raise ExotelDeliveryError(err_msg) from exc
    except requests.exceptions.ConnectionError as exc:
        err_msg = f"Could not establish connection to Exotel host ({config.api_host}): {exc}"
        logger.warning(err_msg)
        if effective_mock_fallback:
            return _build_mock_fallback(destination, "ConnectionError", err_msg)
        raise ExotelDeliveryError(err_msg) from exc
    except requests.RequestException as exc:
        err_msg = f"Exotel HTTP request failed: {exc}"
        logger.warning(err_msg)
        if effective_mock_fallback:
            return _build_mock_fallback(destination, "RequestException", err_msg)
        raise ExotelDeliveryError(err_msg) from exc
    except Exception as exc:
        err_msg = f"Unexpected error during Exotel dispatch: {exc}"
        logger.error(err_msg)
        if effective_mock_fallback:
            return _build_mock_fallback(destination, "UnexpectedException", err_msg)
        raise ExotelDeliveryError(err_msg) from exc

    # 3. Handle non-2xx HTTP responses
    if not 200 <= response.status_code < 300:
        err_msg = (
            f"Exotel rejected SMS with HTTP {response.status_code}: {response.text[:200]}"
        )
        logger.warning(err_msg)
        if effective_mock_fallback:
            return _build_mock_fallback(destination, f"HTTP_{response.status_code}", err_msg)
        raise ExotelDeliveryError(err_msg)

    # 4. Extract message ID from JSON or XML response
    provider_message_id = _extract_message_id(response)

    return {
        "provider": "exotel",
        "status": "sent",
        "providerMessageId": provider_message_id or None,
        "httpStatus": response.status_code,
        "mock": False,
        "recipient": destination,
    }


def _build_mock_fallback(destination: str, reason: str, error_detail: str) -> dict[str, Any]:
    """Construct a structured fallback mock response when live SMS delivery fails."""
    mock_id = f"MOCK-{reason.upper()}-{secrets.token_hex(6).upper()}"
    logger.info("Exotel fallback mock activated (%s) for %s -> %s", reason, destination, mock_id)
    return {
        "provider": "exotel_mock_fallback",
        "status": "mock_delivered",
        "providerMessageId": mock_id,
        "httpStatus": 200,
        "mock": True,
        "recipient": destination,
        "error": error_detail,
        "message": f"Exotel delivery encountered {reason}; mock fallback delivered successfully.",
    }


def _extract_message_id(response: requests.Response) -> str:
    """Extract the SMS Sid / message ID from Exotel's JSON or XML payload."""
    try:
        data = response.json()
        if isinstance(data, dict):
            sms_msg = data.get("SMSMessage") or data
            if isinstance(sms_msg, dict):
                sid = sms_msg.get("Sid") or sms_msg.get("message_id")
                if sid:
                    return str(sid).strip()
    except Exception:
        pass

    response_text = response.text.strip()
    for marker in ("<Sid>", "<MessageId>", '"Sid":"', '"message_id":"'):
        if marker in response_text:
            remainder = response_text.split(marker, 1)[1]
            provider_message_id = remainder.split("</", 1)[0].split('"', 1)[0].strip()
            if provider_message_id:
                return provider_message_id

    return ""
