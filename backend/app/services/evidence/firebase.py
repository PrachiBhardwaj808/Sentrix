"""Lazy Firebase Admin configuration for the operational Firestore sink.

The ZIP project included Firebase Admin environment keys, but its runtime did
not initialize Firebase from them. This adapter supports both standard service
account file configuration and the inline values used by the project while
keeping initialization optional for local development.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping, Optional


class FirebaseConfigurationError(RuntimeError):
    """Raised when Firebase Admin configuration is incomplete or invalid."""


@dataclass(frozen=True)
class FirebaseConfig:
    credentials_path: Optional[str]
    project_id: Optional[str]
    client_email: Optional[str]
    private_key_id: Optional[str]
    private_key: Optional[str]
    client_id: Optional[str]

    @classmethod
    def from_env(cls, environ: Optional[Mapping[str, str]] = None) -> "FirebaseConfig":
        values = environ if environ is not None else os.environ
        credentials_path = values.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip() or None
        if credentials_path:
            return cls(
                credentials_path=credentials_path,
                project_id=values.get("FIREBASE_PROJECT_ID", "").strip() or None,
                client_email=None,
                private_key_id=None,
                private_key=None,
                client_id=None,
            )

        inline = {
            "project_id": values.get("FIREBASE_PROJECT_ID", "").strip(),
            "client_email": values.get("FIREBASE_CLIENT_EMAIL", "").strip(),
            "private_key_id": values.get("FIREBASE_PRIVATE_KEY_ID", "").strip(),
            "private_key": values.get("FIREBASE_PRIVATE_KEY", "").strip(),
            "client_id": values.get("FIREBASE_CLIENT_ID", "").strip(),
        }
        if not any(inline.values()):
            return cls(
                credentials_path=None,
                project_id=None,
                client_email=None,
                private_key_id=None,
                private_key=None,
                client_id=None,
            )
        missing = [name for name, value in inline.items() if not value]
        if missing:
            raise FirebaseConfigurationError(
                "Firebase inline credentials are missing: " + ", ".join(missing)
            )
        return cls(credentials_path=None, **inline)

    @property
    def configured(self) -> bool:
        return bool(self.credentials_path or self.project_id)


def get_status(environ: Optional[Mapping[str, str]] = None) -> dict[str, Any]:
    """Return safe configuration status without returning credentials."""

    try:
        config = FirebaseConfig.from_env(environ)
    except FirebaseConfigurationError as exc:
        return {"configured": False, "initialized": False, "projectId": None, "message": str(exc)}
    if not config.configured:
        return {
            "configured": False,
            "initialized": False,
            "projectId": None,
            "message": "Firebase Admin credentials are not configured.",
        }
    try:
        get_firestore_client()
    except FirebaseConfigurationError as exc:
        return {
            "configured": True,
            "initialized": False,
            "projectId": config.project_id,
            "message": str(exc),
        }
    except Exception as exc:  # pragma: no cover - depends on deployment SDK
        return {
            "configured": True,
            "initialized": False,
            "projectId": config.project_id,
            "message": f"Firebase Admin initialization failed: {exc}",
        }
    return {
        "configured": True,
        "initialized": True,
        "projectId": config.project_id,
        "message": "Firebase Admin Firestore client is ready.",
    }


@lru_cache(maxsize=1)
def get_firestore_client() -> Any:
    """Initialize Firebase Admin once and return its Firestore client."""

    config = FirebaseConfig.from_env()
    if not config.configured:
        raise FirebaseConfigurationError(
            "Set GOOGLE_APPLICATION_CREDENTIALS or all FIREBASE_* inline credentials."
        )

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError as exc:  # pragma: no cover - exercised in deployment
        raise FirebaseConfigurationError(
            "Install backend/requirements-services.txt before using Firebase Admin."
        ) from exc

    try:
        app = firebase_admin.get_app()
    except ValueError:
        credential = _credential(config, credentials)
        options = {"projectId": config.project_id} if config.project_id else None
        app = firebase_admin.initialize_app(credential, options)
    return firestore.client(app=app)


def _credential(config: FirebaseConfig, credentials: Any) -> Any:
    if config.credentials_path:
        path = Path(config.credentials_path)
        if not path.is_file():
            raise FirebaseConfigurationError(
                f"GOOGLE_APPLICATION_CREDENTIALS does not point to a file: {path}"
            )
        return credentials.Certificate(str(path))

    private_key = (config.private_key or "").replace("\\n", "\n")
    return credentials.Certificate(
        {
            "type": "service_account",
            "project_id": config.project_id,
            "private_key_id": config.private_key_id,
            "private_key": private_key,
            "client_email": config.client_email,
            "client_id": config.client_id,
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    )
