"""Private Pinata Files API client used only by Django-side workers.

The client intentionally has no browser-facing code. It uploads one evidence
file to Pinata's private network, reconciles an upload after a timeout, and
creates a short-lived access link for an authorized Django response.
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Optional, Protocol, Sequence, Union

from .hashing import is_sha256, sha256_file


DEFAULT_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files"
DEFAULT_API_URL = "https://api.pinata.cloud"
PLACEHOLDER_VALUES = {"", "<ADD_LATER>", "<ADD_LATER_RESTRICTED_GATEWAY>"}
SAFE_TOKEN = re.compile(r"[^A-Za-z0-9_.-]+")


class HttpTransport(Protocol):
    """Subset of a requests-like session used for dependency injection."""

    def post(self, url: str, **kwargs: Any) -> Any:
        ...

    def get(self, url: str, **kwargs: Any) -> Any:
        ...


class PinataError(RuntimeError):
    """Base error for Pinata configuration and request failures."""


class PinataConfigurationError(PinataError):
    """Raised when required server-side Pinata settings are absent or unsafe."""


@dataclass(frozen=True)
class PinataConfig:
    """Server-only Pinata configuration.

    ``network`` defaults to private. Public uploads must be explicitly enabled
    for synthetic demonstrations; production evidence cannot silently fall
    back to a public IPFS network.
    """

    jwt: str
    gateway_url: str
    group_id: Optional[str] = None
    network: str = "private"
    upload_url: str = DEFAULT_UPLOAD_URL
    api_url: str = DEFAULT_API_URL
    timeout_seconds: int = 30
    max_upload_bytes: Optional[int] = None

    @classmethod
    def from_env(cls, environ: Optional[Mapping[str, str]] = None) -> "PinataConfig":
        values = environ if environ is not None else os.environ
        jwt = values.get("PINATA_JWT", "").strip()
        gateway_url = values.get("PINATA_GATEWAY_URL", "").strip().rstrip("/")
        network = values.get("PINATA_NETWORK", "private").strip().lower()

        if jwt in PLACEHOLDER_VALUES or jwt.startswith("<"):
            raise PinataConfigurationError("PINATA_JWT is not configured")
        if gateway_url in PLACEHOLDER_VALUES or gateway_url.startswith("<"):
            raise PinataConfigurationError(
                "PINATA_GATEWAY_URL must be a configured restricted gateway"
            )
        if not gateway_url.startswith("https://"):
            raise PinataConfigurationError("PINATA_GATEWAY_URL must use HTTPS")
        if network not in {"private", "public"}:
            raise PinataConfigurationError("PINATA_NETWORK must be private or public")
        if network == "public" and values.get("PINATA_ALLOW_PUBLIC_DEMO", "").lower() != "true":
            raise PinataConfigurationError(
                "public Pinata uploads require PINATA_ALLOW_PUBLIC_DEMO=true"
            )

        timeout = _positive_int(values.get("PINATA_UPLOAD_TIMEOUT_SECONDS", "30"), "timeout")
        max_upload = _optional_positive_int(
            values.get("PINATA_MAX_UPLOAD_BYTES", ""), "max upload bytes"
        )
        upload_url = values.get("PINATA_UPLOAD_URL", DEFAULT_UPLOAD_URL).strip().rstrip("/")
        api_url = values.get("PINATA_API_URL", DEFAULT_API_URL).strip().rstrip("/")
        if not upload_url.startswith("https://") or not api_url.startswith("https://"):
            raise PinataConfigurationError("Pinata API URLs must use HTTPS")
        return cls(
            jwt=jwt,
            gateway_url=gateway_url,
            group_id=_optional_value(values.get("PINATA_GROUP_ID")),
            network=network,
            upload_url=upload_url,
            api_url=api_url,
            timeout_seconds=timeout,
            max_upload_bytes=max_upload,
        )


@dataclass(frozen=True)
class PinataUpload:
    """Normalized upload metadata persisted with the operational event."""

    file_id: Optional[str]
    name: str
    cid: str
    size: int
    mime_type: str
    created_at: Optional[str] = None
    is_duplicate: bool = False


class PinataClient:
    """Small private-file client with injectable HTTP transport for tests."""

    def __init__(self, config: PinataConfig, transport: Optional[HttpTransport] = None) -> None:
        self.config = config
        self._transport = transport or self._build_transport()

    @staticmethod
    def _build_transport() -> HttpTransport:
        try:
            import requests
        except ImportError as exc:  # pragma: no cover - exercised in deployment
            raise PinataError(
                "Install backend/requirements-services.txt before using PinataClient"
            ) from exc
        return requests.Session()

    def upload_path(
        self,
        path: Union[str, Path],
        event_id: str,
        evidence_sha256: Optional[str] = None,
        mime_type: Optional[str] = None,
    ) -> PinataUpload:
        """Upload one private local file with deterministic reconciliation metadata."""

        file_path = Path(path)
        size = file_path.stat().st_size
        self._check_size(size)
        digest = evidence_sha256 or sha256_file(file_path)
        if not is_sha256(digest):
            raise PinataError("evidence_sha256 must be a 64-character SHA-256 digest")

        content_type = mime_type or mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        with file_path.open("rb") as stream:
            return self._upload(
                stream=stream,
                size=size,
                event_id=event_id,
                evidence_sha256=digest,
                mime_type=content_type,
            )

    def find_existing(self, event_id: str, evidence_sha256: str) -> Optional[PinataUpload]:
        """Find a prior upload after an uncertain network response."""

        if not is_sha256(evidence_sha256):
            raise PinataError("evidence_sha256 must be a 64-character SHA-256 digest")
        response = self._transport.get(
            f"{self.config.api_url}/v3/files/{self.config.network}",
            headers=self._headers(),
            params={"name": self._file_name(event_id), "limit": 100, "order": "DESC"},
            timeout=self.config.timeout_seconds,
        )
        payload = self._decode_response(response, "listing files")
        data = payload.get("data", {})
        files = data.get("files", []) if isinstance(data, Mapping) else []
        for item in files:
            keyvalues = item.get("keyvalues") or {}
            if (
                keyvalues.get("event_id") == event_id
                and keyvalues.get("evidence_sha256") == evidence_sha256
            ):
                return self._upload_from_data(item)
        return None

    def create_access_link(self, cid: str, expires_seconds: int = 180) -> str:
        """Create a short-lived link for a private Pinata file."""

        if not cid.strip():
            raise PinataError("cid is required")
        if not 1 <= expires_seconds <= 3600:
            raise PinataError("expires_seconds must be between 1 and 3600")

        response = self._transport.post(
            f"{self.config.api_url}/v3/files/private/download_link",
            headers={**self._headers(), "Content-Type": "application/json"},
            json={
                "url": f"{self.config.gateway_url}/files/{cid}",
                "expires": expires_seconds,
                "date": int(time.time()),
                "method": "GET",
            },
            timeout=self.config.timeout_seconds,
        )
        payload = self._decode_response(response, "creating access link")
        data = payload.get("data")
        if isinstance(data, str) and data.startswith("https://"):
            return data
        raise PinataError("Pinata did not return a signed access link")

    def _upload(
        self,
        stream: Any,
        size: int,
        event_id: str,
        evidence_sha256: str,
        mime_type: str,
    ) -> PinataUpload:
        name = self._file_name(event_id)
        keyvalues = {
            "event_id": event_id,
            "evidence_sha256": evidence_sha256,
        }
        response = self._transport.post(
            self.config.upload_url,
            headers=self._headers(),
            data={
                "network": self.config.network,
                "name": name,
                "group_id": self.config.group_id or "",
                "keyvalues": json.dumps(keyvalues, separators=(",", ":")),
                "cid_version": "v1",
            },
            files={"file": (name, stream, mime_type)},
            timeout=self.config.timeout_seconds,
        )
        payload = self._decode_response(response, "uploading evidence")
        data = payload.get("data")
        if not isinstance(data, Mapping):
            raise PinataError("Pinata returned an invalid upload response")
        upload = self._upload_from_data(data)
        if upload.size == 0:
            return PinataUpload(
                file_id=upload.file_id,
                name=upload.name,
                cid=upload.cid,
                size=size,
                mime_type=mime_type,
                created_at=upload.created_at,
                is_duplicate=upload.is_duplicate,
            )
        return upload

    def _check_size(self, size: int) -> None:
        if self.config.max_upload_bytes is not None and size > self.config.max_upload_bytes:
            raise PinataError(
                f"evidence file is {size} bytes; configured limit is "
                f"{self.config.max_upload_bytes} bytes"
            )

    def _headers(self) -> Mapping[str, str]:
        return {"Authorization": f"Bearer {self.config.jwt}"}

    @staticmethod
    def _file_name(event_id: str) -> str:
        token = SAFE_TOKEN.sub("-", event_id).strip("-._") or "unknown-event"
        return f"incident-{token}"

    @staticmethod
    def _upload_from_data(data: Mapping[str, Any]) -> PinataUpload:
        cid = str(data.get("cid") or "").strip()
        if not cid:
            raise PinataError("Pinata response did not include a CID")
        return PinataUpload(
            file_id=str(data["id"]) if data.get("id") else None,
            name=str(data.get("name") or ""),
            cid=cid,
            size=int(data.get("size") or 0),
            mime_type=str(data.get("mime_type") or "application/octet-stream"),
            created_at=str(data["created_at"]) if data.get("created_at") else None,
            is_duplicate=bool(data.get("is_duplicate", False)),
        )

    @staticmethod
    def _decode_response(response: Any, operation: str) -> Mapping[str, Any]:
        try:
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:
            status = getattr(response, "status_code", "unknown")
            raise PinataError(f"Pinata failed while {operation} (status {status})") from exc
        if not isinstance(payload, Mapping):
            raise PinataError(f"Pinata returned invalid JSON while {operation}")
        return payload


def _optional_value(value: Optional[str]) -> Optional[str]:
    normalized = (value or "").strip()
    return (
        normalized
        if normalized and normalized not in PLACEHOLDER_VALUES and not normalized.startswith("<")
        else None
    )


def _positive_int(value: str, label: str) -> int:
    try:
        result = int(value)
    except (TypeError, ValueError) as exc:
        raise PinataConfigurationError(f"{label} must be a positive integer") from exc
    if result <= 0:
        raise PinataConfigurationError(f"{label} must be a positive integer")
    return result


def _optional_positive_int(value: str, label: str) -> Optional[int]:
    if not value or value.startswith("<"):
        return None
    return _positive_int(value, label)
