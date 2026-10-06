"""Import a protected JSON state export into a migrated PostgreSQL deployment."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from app.models import ApiStateDocument
from app.services.spatial_store import sync_spatial_features


SUPPORTED_SCHEMA_VERSIONS = {2, 3, 4, 5}
STATE_COLLECTIONS = (
    "guards", "shifts", "activityLog", "alerts", "cameras", "sectors",
    "communities", "resources", "infrastructure", "roads", "pois",
    "anprRecords", "watchlistEntries", "demoProfiles", "authUsers",
    "authChallenges", "dispatchChallenges", "authAuditLog", "firebaseOutbox",
    "fcmOutbox", "auditChain",
)
MAX_STATE_EXPORT_BYTES = 100 * 1024 * 1024


class Command(BaseCommand):
    help = "Import an API state JSON export into PostgreSQL; --replace overwrites the existing state."
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument("path", help="Path to a securely transferred api_state.json export")
        parser.add_argument("--replace", action="store_true", help="Replace the current state document")

    def handle(self, *args, **options):
        if connection.vendor != "postgresql" or os.getenv("SENTRIX_STATE_STORAGE", "").strip().lower() != "postgres":
            raise CommandError("Run this command with the production PostGIS database and SENTRIX_STATE_STORAGE=postgres")

        path = Path(options["path"]).expanduser()
        try:
            if not path.is_file() or path.stat().st_size > MAX_STATE_EXPORT_BYTES:
                raise CommandError("State export must be an existing file no larger than 100 MB")
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise CommandError(f"Could not read state export: {exc}") from exc
        if not isinstance(payload, dict) or payload.get("schemaVersion") not in SUPPORTED_SCHEMA_VERSIONS:
            raise CommandError("State export has an unsupported schema version")

        state = self._normalize(payload)
        with transaction.atomic():
            existing = ApiStateDocument.objects.filter(key="main").first()
            if existing and not options["replace"]:
                raise CommandError("Database already has operational state; pass --replace only after backing it up")
            ApiStateDocument.objects.update_or_create(key="main", defaults={"payload": state})
            sync_spatial_features(state)

        self.stdout.write(self.style.SUCCESS(
            f"Imported schema version {state['schemaVersion']} with "
            f"{sum(len(state[name]) for name in STATE_COLLECTIONS)} records across supported collections."
        ))

    @staticmethod
    def _normalize(payload: dict[str, Any]) -> dict[str, Any]:
        state = dict(payload)
        state["schemaVersion"] = 5
        for collection in STATE_COLLECTIONS:
            if collection in state and not isinstance(state[collection], list):
                raise CommandError(f"State collection {collection!r} must be a list")
            state.setdefault(collection, [])
        if not isinstance(state.get("currentUser"), dict):
            state["currentUser"] = {
                "name": "Local operator",
                "rank": "Operator",
                "badgeId": "LOCAL-OPERATOR",
                "role": "Local command console",
            }
        if not isinstance(state.get("system"), dict):
            state["system"] = {"lockdownActive": False, "defconLevel": 2}
        return state
