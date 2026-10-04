"""Evidence hashing, private storage, custody, and provenance services."""

from .hashing import sha256_bytes, sha256_file, sha256_text, verify_file_hash
from .custody import CustodyEvent, CustodyRecorder
from .firestore_sink import FirestoreEventSink
from .alert_store import FirestoreAlertStore, get_alert_store
from .firebase import FirebaseConfig, FirebaseConfigurationError, get_firestore_client
from .pinata_client import (
    PinataClient,
    PinataConfig,
    PinataConfigurationError,
    PinataError,
    PinataUpload,
)

__all__ = [
    "PinataClient",
    "PinataConfig",
    "PinataConfigurationError",
    "PinataError",
    "PinataUpload",
    "FirestoreEventSink",
    "FirestoreAlertStore",
    "get_alert_store",
    "FirebaseConfig",
    "FirebaseConfigurationError",
    "get_firestore_client",
    "CustodyEvent",
    "CustodyRecorder",
    "sha256_bytes",
    "sha256_file",
    "sha256_text",
    "verify_file_hash",
]
