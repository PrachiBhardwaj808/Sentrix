"""Remove known presentation fixtures without touching operator-created records."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from app.api.repository import repository


class Command(BaseCommand):
    help = "Remove known demo watchlist entries, profiles, alerts, and activity records."

    def handle(self, *args, **options):
        removed: dict[str, int] = {}

        def is_demo_id(value: object, prefixes: tuple[str, ...]) -> bool:
            text = str(value or "")
            return any(text.startswith(prefix) for prefix in prefixes)

        rules = {
            "watchlistEntries": lambda item: str(item.get("id", "")) in {"WATCH-PLATE-001", "WATCH-PLATE-002", "WATCH-FACE-001"},
            "demoProfiles": lambda item: str(item.get("id", "")).startswith("DEMO-PERSON-"),
            "alerts": lambda item: str(item.get("id", "")).startswith("ALT-DEMO-") or item.get("evidenceSource") == "demo",
            "activityLog": lambda item: str(item.get("id", "")).startswith("LOG-DEMO-") or "demo state initialized" in str(item.get("details", "")).casefold(),
            "communities": lambda item: is_demo_id(item.get("id"), ("COMM-DEMO-", "MAP-"))
            or "fictional" in str(item.get("name", "")).casefold(),
            "roads": lambda item: is_demo_id(item.get("id"), ("ROAD-DEMO-", "MAP-"))
            or "fictional" in str(item.get("name", "")).casefold(),
            "resources": lambda item: is_demo_id(item.get("id"), ("RES-DEMO-", "MAP-"))
            or "fictional" in str(item.get("name", "")).casefold(),
            "infrastructure": lambda item: is_demo_id(item.get("id"), ("INFRA-DEMO-", "MAP-"))
            or "fictional" in str(item.get("name", "")).casefold(),
            "cameras": lambda item: str(item.get("id", "")) in {"CAM-ALPHA-01", "CAM-BRAVO-02"}
            or is_demo_id(item.get("id"), ("CAM-DEMO-",)),
            "sectors": lambda item: str(item.get("id", "")) in {"SEC-ALPHA", "SEC-BRAVO"}
            or is_demo_id(item.get("id"), ("SEC-DEMO-",)),
        }
        snapshot = repository.snapshot()
        for collection, is_fixture in rules.items():
            ids = [str(item.get("id")) for item in snapshot.get(collection, []) if item.get("id") and is_fixture(item)]
            removed[collection] = sum(1 for item_id in ids if repository.delete(collection, item_id))

        total = sum(removed.values())
        summary = ", ".join(f"{collection}={count}" for collection, count in removed.items())
        self.stdout.write(self.style.SUCCESS(f"Removed {total} demo records ({summary})."))
