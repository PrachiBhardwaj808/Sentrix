"""SQLite-backed durable outbox for events captured during network outages."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Union

from .models import EventStatus, OutboxEvent, utc_now


class OutboxRepository:
    """Persist event progress safely across worker restarts and power loss."""

    _UPDATE_FIELDS = {
        key
        for key in OutboxEvent(
            event_id="_",
            incident_id="_",
            evidence_path="_",
            captured_at=utc_now(),
            queued_at=utc_now(),
        ).to_row()
        if key != "event_id"
    } | {"custody_tx_ids"}

    def __init__(self, database_path: Union[Path, str]) -> None:
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def initialize(self) -> None:
        with self._connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS outbox_events (
                    event_id TEXT PRIMARY KEY,
                    incident_id TEXT NOT NULL,
                    evidence_path TEXT NOT NULL,
                    captured_at TEXT NOT NULL,
                    queued_at TEXT NOT NULL,
                    status TEXT NOT NULL,
                    severity TEXT NOT NULL DEFAULT 'normal',
                    mime_type TEXT,
                    evidence_sha256 TEXT,
                    evidence_size INTEGER,
                    pinata_cid TEXT,
                    pinata_file_id TEXT,
                    uploaded_at TEXT,
                    blockchain_tx_id TEXT,
                    anchored_at TEXT,
                    custody_tx_ids_json TEXT NOT NULL DEFAULT '[]',
                    model_id TEXT,
                    model_version TEXT,
                    model_version_hash TEXT,
                    model_artifact_hash TEXT,
                    model_confidence REAL,
                    decision_threshold REAL,
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    next_attempt_at TEXT,
                    last_error TEXT,
                    locked_until TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_outbox_ready
                    ON outbox_events(status, next_attempt_at, locked_until, queued_at);
                """
            )

    def enqueue(self, event: OutboxEvent) -> OutboxEvent:
        row = event.to_row()
        columns = list(row)
        placeholders = ", ".join("?" for _ in columns)
        with self._connection() as connection:
            connection.execute(
                f"INSERT OR IGNORE INTO outbox_events ({', '.join(columns)}) VALUES ({placeholders})",
                [row[column] for column in columns],
            )
        return self.get(event.event_id)  # type: ignore[return-value]

    def get(self, event_id: str) -> Optional[OutboxEvent]:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM outbox_events WHERE event_id = ?", (event_id,)
            ).fetchone()
        return OutboxEvent.from_row(row) if row is not None else None

    def claim_ready(self, limit: int = 20, lease_seconds: int = 60) -> List[OutboxEvent]:
        """Claim work briefly so two workers do not upload the same evidence."""

        if limit <= 0 or lease_seconds <= 0:
            raise ValueError("limit and lease_seconds must be positive")

        now = utc_now()
        now_value = now.isoformat()
        lease_value = (now + timedelta(seconds=lease_seconds)).isoformat()
        claimed_ids: List[str] = []
        with self._connection() as connection:
            rows = connection.execute(
                """
                SELECT event_id FROM outbox_events
                WHERE status NOT IN (?, ?)
                  AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
                  AND (locked_until IS NULL OR locked_until <= ?)
                ORDER BY queued_at ASC
                LIMIT ?
                """,
                (
                    EventStatus.CONFIRMED.value,
                    EventStatus.FAILED.value,
                    now_value,
                    now_value,
                    limit,
                ),
            ).fetchall()
            for row in rows:
                cursor = connection.execute(
                    """
                    UPDATE outbox_events
                    SET locked_until = ?
                    WHERE event_id = ?
                      AND (locked_until IS NULL OR locked_until <= ?)
                    """,
                    (lease_value, row["event_id"], now_value),
                )
                if cursor.rowcount == 1:
                    claimed_ids.append(str(row["event_id"]))
        return [event for event_id in claimed_ids if (event := self.get(event_id)) is not None]

    def update(self, event_id: str, **changes: Any) -> Optional[OutboxEvent]:
        """Update only known outbox fields and return the fresh record."""

        unknown = set(changes) - self._UPDATE_FIELDS
        if unknown:
            raise ValueError(f"unsupported outbox fields: {sorted(unknown)}")
        if not changes:
            return self.get(event_id)

        serialized = {
            ("custody_tx_ids_json" if key == "custody_tx_ids" else key): _serialize_change(
                key, value
            )
            for key, value in changes.items()
        }
        assignments = ", ".join(f"{key} = ?" for key in serialized)
        values = list(serialized.values()) + [event_id]
        with self._connection() as connection:
            connection.execute(
                f"UPDATE outbox_events SET {assignments} WHERE event_id = ?", values
            )
        return self.get(event_id)

    def record_failure(
        self,
        event_id: str,
        error: str,
        max_attempts: int = 8,
        base_delay_seconds: int = 5,
        max_delay_seconds: int = 3600,
    ) -> Optional[OutboxEvent]:
        event = self.get(event_id)
        if event is None:
            return None
        attempt = event.retry_count + 1
        permanently_failed = attempt >= max_attempts
        delay = min(max_delay_seconds, base_delay_seconds * (2 ** max(0, attempt - 1)))
        return self.update(
            event_id,
            retry_count=attempt,
            status=EventStatus.FAILED.value if permanently_failed else event.status,
            next_attempt_at=None if permanently_failed else utc_now() + timedelta(seconds=delay),
            last_error=error[:4000],
            locked_until=None,
        )

    def requeue(self, event_id: str) -> Optional[OutboxEvent]:
        """Manually return a failed event to the correct unfinished stage."""

        event = self.get(event_id)
        if event is None:
            return None
        if event.blockchain_tx_id and not event.anchored_at:
            status = EventStatus.BLOCKCHAIN_PENDING.value
        elif event.pinata_cid:
            status = EventStatus.EVIDENCE_UPLOADED.value
        elif event.evidence_sha256:
            status = EventStatus.PINATA_PENDING.value
        else:
            status = EventStatus.PENDING_LOCAL.value
        return self.update(
            event_id,
            status=status,
            retry_count=0,
            next_attempt_at=utc_now(),
            last_error=None,
            locked_until=None,
        )

    def save(self, event: OutboxEvent) -> Optional[OutboxEvent]:
        row = event.to_row()
        row.pop("event_id")
        return self.update(event.event_id, **row)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(str(self.database_path), timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 30000")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = self._connect()
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()


def _serialize_change(key: str, value: Any) -> Any:
    if hasattr(value, "value") and key == "status":
        return value.value
    if key in {"captured_at", "queued_at", "uploaded_at", "anchored_at", "next_attempt_at", "locked_until"}:
        return value.isoformat() if value is not None else None
    if key == "custody_tx_ids_json":
        return value if isinstance(value, str) else __import__("json").dumps(list(value))
    if key == "custody_tx_ids":
        return None if value is None else __import__("json").dumps(list(value))
    return value
