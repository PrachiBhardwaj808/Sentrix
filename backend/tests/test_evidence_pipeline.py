"""No-network tests for the evidence and offline synchronization services."""

from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from backend.app.services.blockchain.contract_client import BlockchainReceipt
from backend.app.services.evidence.hashing import sha256_bytes, verify_file_hash
from backend.app.services.evidence.firestore_sink import FirestoreEventSink
from backend.app.services.evidence.custody import CustodyEvent, CustodyRecorder
from backend.app.services.evidence.pinata_client import (
    PinataClient,
    PinataConfig,
    PinataConfigurationError,
    PinataUpload,
)
from backend.app.services.offline_queue.models import EventStatus, OutboxEvent
from backend.app.services.offline_queue.repository import OutboxRepository
from backend.app.services.offline_queue.sync_worker import EvidenceSyncWorker


class FakeResponse:
    def __init__(self, payload: Dict[str, Any], status_code: int = 200) -> None:
        self.payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError("fake HTTP failure")

    def json(self) -> Dict[str, Any]:
        return self.payload


class FakePinataTransport:
    def __init__(self) -> None:
        self.posts = []
        self.gets = []

    def post(self, url: str, **kwargs: Any) -> FakeResponse:
        self.posts.append((url, kwargs))
        if url.endswith("download_link"):
            return FakeResponse({"data": "https://gateway.example/files/test-cid?signature=test"})
        return FakeResponse(
            {
                "data": {
                    "id": "file-id",
                    "name": "incident-event-1",
                    "cid": "bafy-test-cid",
                    "size": 12,
                    "mime_type": "image/jpeg",
                    "is_duplicate": False,
                }
            }
        )

    def get(self, url: str, **kwargs: Any) -> FakeResponse:
        self.gets.append((url, kwargs))
        return FakeResponse(
            {
                "data": {
                    "files": [
                        {
                            "id": "existing-file-id",
                            "name": "incident-event-1",
                            "cid": "bafy-existing-cid",
                            "size": 12,
                            "mime_type": "image/jpeg",
                            "keyvalues": {
                                "event_id": "event-1",
                                "evidence_sha256": sha256_bytes(b"evidence"),
                            },
                        }
                    ]
                }
            }
        )


class FakePinata:
    def find_existing(self, event_id: str, evidence_sha256: str) -> None:
        return None

    def upload_path(self, path: str, event_id: str, evidence_sha256: str, mime_type: str) -> PinataUpload:
        return PinataUpload(
            file_id="file-id",
            name=f"incident-{event_id}",
            cid="bafy-uploaded-cid",
            size=Path(path).stat().st_size,
            mime_type=mime_type or "application/octet-stream",
        )


class FakeBlockchain:
    def __init__(self) -> None:
        self.registered = []
        self.custody = []
        self.waited_for = []

    def register_incident(self, incident_reference_hash: str, evidence_sha256: str, captured_at: datetime) -> str:
        self.registered.append((incident_reference_hash, evidence_sha256, captured_at))
        return "0xincident"

    def register_high_severity_incident(self, *args: Any, **kwargs: Any) -> str:
        return "0xhigh-severity"

    def append_custody_event(self, event: Any) -> str:
        self.custody.append(event)
        return "0xcustody"

    def wait_for_confirmation(self, transaction_hash: str) -> BlockchainReceipt:
        self.waited_for.append(transaction_hash)
        return BlockchainReceipt(
            transaction_hash=transaction_hash,
            block_number=100,
            status=1,
            confirmed_at=datetime.now(timezone.utc),
        )


class FakeDocument:
    def __init__(self) -> None:
        self.payload = None

    def set(self, payload: Dict[str, Any], merge: bool = False) -> None:
        self.payload = (payload, merge)


class FakeFirestoreClient:
    def __init__(self) -> None:
        self._document = FakeDocument()

    def collection(self, name: str) -> "FakeFirestoreClient":
        self.collection_name = name
        return self

    def document(self, document_id: str) -> FakeDocument:
        self.document_id = document_id
        return self._document


class FakeCustodySink:
    def __init__(self) -> None:
        self.records = []

    def record_custody_event(self, event: CustodyEvent, transaction_hash: str, receipt: Any) -> None:
        self.records.append((event, transaction_hash, receipt))


class EvidencePipelineTests(unittest.TestCase):
    def test_pinata_environment_requires_private_configuration(self) -> None:
        config = PinataConfig.from_env(
            {
                "PINATA_JWT": "server-token",
                "PINATA_GATEWAY_URL": "https://gateway.example",
                "PINATA_GROUP_ID": "<OPTIONAL_ADD_LATER>",
            }
        )
        self.assertEqual(config.network, "private")
        self.assertIsNone(config.group_id)
        with self.assertRaises(PinataConfigurationError):
            PinataConfig.from_env(
                {
                    "PINATA_JWT": "server-token",
                    "PINATA_GATEWAY_URL": "https://gateway.example",
                    "PINATA_NETWORK": "public",
                }
            )

    def test_hashing_and_pinata_upload(self) -> None:
        transport = FakePinataTransport()
        config = PinataConfig(
            jwt="server-only-token",
            gateway_url="https://gateway.example",
            max_upload_bytes=100,
        )
        client = PinataClient(config, transport=transport)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "snapshot.jpg"
            path.write_bytes(b"evidence")
            digest = sha256_bytes(b"evidence")
            upload = client.upload_path(path, "event-1", evidence_sha256=digest)
            self.assertEqual(upload.cid, "bafy-test-cid")
            self.assertEqual(transport.posts[0][1]["data"]["network"], "private")
            self.assertIn('"event_id":"event-1"', transport.posts[0][1]["data"]["keyvalues"])
            self.assertTrue(verify_file_hash(path, digest))
            self.assertEqual(
                client.find_existing("event-1", digest).cid, "bafy-existing-cid"  # type: ignore[union-attr]
            )
            self.assertTrue(client.create_access_link(upload.cid).startswith("https://"))

    def test_outbox_persists_and_requeues(self) -> None:
        now = datetime.now(timezone.utc)
        with tempfile.TemporaryDirectory() as directory:
            repository = OutboxRepository(Path(directory) / "events.sqlite3")
            event = OutboxEvent(
                event_id="event-1",
                incident_id="incident-1",
                evidence_path=str(Path(directory) / "snapshot.jpg"),
                captured_at=now,
                queued_at=now,
            )
            repository.enqueue(event)
            claimed = repository.claim_ready()
            self.assertEqual([item.event_id for item in claimed], ["event-1"])
            updated = repository.update(
                "event-1",
                custody_tx_ids=("0xcustody",),
                evidence_sha256=sha256_bytes(b"evidence"),
                blockchain_tx_id="0xincident",
                status=EventStatus.BLOCKCHAIN_PENDING.value,
            )
            self.assertEqual(updated.custody_tx_ids, ("0xcustody",))  # type: ignore[union-attr]
            failed = repository.record_failure("event-1", "temporary outage", max_attempts=2)
            self.assertEqual(failed.status, EventStatus.BLOCKCHAIN_PENDING.value)  # type: ignore[union-attr]
            failed = repository.record_failure("event-1", "still offline", max_attempts=2)
            self.assertEqual(failed.status, EventStatus.FAILED.value)  # type: ignore[union-attr]
            requeued = repository.requeue("event-1")
            self.assertEqual(requeued.status, EventStatus.BLOCKCHAIN_PENDING.value)  # type: ignore[union-attr]

    def test_sync_worker_confirms_event_and_initial_custody(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            evidence_path = Path(directory) / "snapshot.jpg"
            evidence_path.write_bytes(b"evidence")
            now = datetime.now(timezone.utc)
            repository = OutboxRepository(Path(directory) / "events.sqlite3")
            repository.enqueue(
                OutboxEvent(
                    event_id="event-1",
                    incident_id="incident-1",
                    evidence_path=str(evidence_path),
                    captured_at=now,
                    queued_at=now,
                    mime_type="image/jpeg",
                )
            )
            blockchain = FakeBlockchain()
            worker = EvidenceSyncWorker(repository, FakePinata(), blockchain)
            result = worker.run_once()
            self.assertEqual(result[0].status, EventStatus.CONFIRMED.value)
            saved = repository.get("event-1")
            self.assertEqual(saved.status, EventStatus.CONFIRMED.value)  # type: ignore[union-attr]
            self.assertEqual(saved.pinata_cid, "bafy-uploaded-cid")  # type: ignore[union-attr]
            self.assertEqual(saved.custody_tx_ids, ("0xcustody",))  # type: ignore[union-attr]
            self.assertEqual(blockchain.waited_for, ["0xcustody", "0xincident"])

    def test_firestore_sink_omits_local_evidence_path(self) -> None:
        now = datetime.now(timezone.utc)
        client = FakeFirestoreClient()
        sink = FirestoreEventSink(client)
        sink.upsert_event(
            OutboxEvent(
                event_id="event-1",
                incident_id="incident-1",
                evidence_path="C:/private/local/snapshot.jpg",
                captured_at=now,
                queued_at=now,
            )
        )
        payload, merge = client._document.payload
        self.assertTrue(merge)
        self.assertEqual(client.collection_name, "alerts")
        self.assertEqual(client.document_id, "incident-1")
        self.assertNotIn("evidence_path", payload)

    def test_custody_recorder_anchors_and_persists_action(self) -> None:
        event = CustodyEvent(
            event_id="custody-1",
            incident_id="incident-1",
            evidence_sha256=sha256_bytes(b"evidence"),
            action="viewed",
            actor_role="commander",
            occurred_at=datetime.now(timezone.utc),
        )
        blockchain = FakeBlockchain()
        sink = FakeCustodySink()
        transaction_hash = CustodyRecorder(blockchain, sink).record(event)
        self.assertEqual(transaction_hash, "0xcustody")
        self.assertEqual(sink.records[0][0], event)


if __name__ == "__main__":
    unittest.main()
