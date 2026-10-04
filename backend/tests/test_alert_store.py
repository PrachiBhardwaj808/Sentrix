"""No-network tests for Firestore alert persistence and history loading."""

from __future__ import annotations

import unittest
from datetime import datetime, timezone
from typing import Any

from backend.app.services.evidence.alert_store import FirestoreAlertStore


class FakeDocument:
    def __init__(self, document_id: str, collection: "FakeCollection") -> None:
        self.id = document_id
        self.collection = collection

    def set(self, payload: dict[str, Any], merge: bool = False) -> None:
        if merge:
            self.collection.documents[self.id] = {**self.collection.documents.get(self.id, {}), **payload}
        else:
            self.collection.documents[self.id] = dict(payload)

    def to_dict(self) -> dict[str, Any]:
        return dict(self.collection.documents[self.id])


class FakeCollection:
    def __init__(self, documents: dict[str, dict[str, Any]] | None = None) -> None:
        self.documents = documents or {}

    def document(self, document_id: str) -> FakeDocument:
        return FakeDocument(document_id, self)

    def stream(self) -> list[FakeDocument]:
        return [FakeDocument(document_id, self) for document_id in self.documents]


class FakeClient:
    def __init__(self, collection: FakeCollection) -> None:
        self.alerts = collection

    def collection(self, name: str) -> FakeCollection:
        self.collection_name = name
        return self.alerts


class FirestoreAlertStoreTests(unittest.TestCase):
    def test_upsert_uses_alert_id_and_does_not_drop_existing_fields(self) -> None:
        collection = FakeCollection({"ALT-1": {"notes": "existing", "legacy": True}})
        store = FirestoreAlertStore(FakeClient(collection))

        store.upsert_alert({"id": "ALT-1", "status": "open", "timestamp": "2026-08-30T10:00:00+00:00"})

        self.assertEqual(collection.documents["ALT-1"]["status"], "open")
        self.assertEqual(collection.documents["ALT-1"]["notes"], "existing")
        self.assertTrue(collection.documents["ALT-1"]["updatedAt"])

    def test_list_returns_firestore_history_newest_first_and_uses_document_id(self) -> None:
        collection = FakeCollection({
            "ALT-OLD": {"timestamp": "2026-08-29T10:00:00+00:00", "eventType": "Old"},
            "ALT-NEW": {"timestamp": datetime(2026, 8, 30, 10, tzinfo=timezone.utc), "eventType": "New"},
        })
        store = FirestoreAlertStore(FakeClient(collection))

        alerts = store.list_alerts()

        self.assertEqual([alert["id"] for alert in alerts], ["ALT-NEW", "ALT-OLD"])
        self.assertEqual(alerts[0]["timestamp"], "2026-08-30T10:00:00+00:00")

    def test_missing_alert_id_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            FirestoreAlertStore(FakeClient(FakeCollection())).upsert_alert({"eventType": "Missing id"})
