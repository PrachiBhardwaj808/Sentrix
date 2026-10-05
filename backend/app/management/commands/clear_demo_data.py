"""Remove known presentation fixtures without touching operator-created records."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from app.api.repository import repository


class Command(BaseCommand):
    help = "Remove known demo watchlist entries, profiles, alerts, and activity records."

    def handle(self, *args, **options):
        removed: dict[str, int] = {}
        rules = {
            "watchlistEntries": lambda item: str(item.get("id", "")) in {"WATCH-PLATE-001", "WATCH-PLATE-002", "WATCH-FACE-001"},
            "demoProfiles": lambda item: str(item.get("id", "")).startswith("DEMO-PERSON-"),
            "alerts": lambda item: str(item.get("id", "")).startswith("ALT-DEMO-") or item.get("evidenceSource") == "demo",
            "activityLog": lambda item: str(item.get("id", "")).startswith("LOG-DEMO-") or "demo state initialized" in str(item.get("details", "")).casefold(),
        }
        for collection, is_fixture in rules.items():
            ids = [str(item.get("id")) for item in repository.snapshot().get(collection, []) if item.get("id") and is_fixture(item)]
            removed[collection] = sum(1 for item_id in ids if repository.delete(collection, item_id))

        total = sum(removed.values())
        summary = ", ".join(f"{collection}={count}" for collection, count in removed.items())
        self.stdout.write(self.style.SUCCESS(f"Removed {total} demo records ({summary})."))
