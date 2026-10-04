"""Hash-chain helpers for alert and operator-action integrity.

The chain stores hashes and metadata only. It does not duplicate alert bodies,
raw footage, embeddings, or other sensitive payloads. A chain detects
retroactive edits/deletions in the stored log; it cannot prove that a writer
was truthful at the time an event was created.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, MutableMapping


GENESIS_HASH = "0" * 64
AUDITED_COLLECTIONS = frozenset({"alerts", "activityLog"})


def append_chain_entry(
    state: MutableMapping[str, Any],
    *,
    collection: str,
    operation: str,
    record: MutableMapping[str, Any],
) -> dict[str, Any] | None:
    """Append a metadata/content hash entry for an audited record."""

    if collection not in AUDITED_COLLECTIONS:
        return None
    chain = state.setdefault("auditChain", [])
    previous_hash = str(chain[-1].get("chainHash") or GENESIS_HASH) if chain else GENESIS_HASH
    sequence = len(chain) + 1
    record_id = str(record.get("id") or "")
    content_hash = _content_hash(collection, operation, record)
    chain_hash = _chain_hash(previous_hash, sequence, collection, operation, record_id, content_hash)
    entry = {
        "sequence": sequence,
        "collection": collection,
        "operation": operation,
        "recordId": record_id,
        "contentHash": content_hash,
        "previousHash": previous_hash,
        "chainHash": chain_hash,
        "recordedAt": datetime.now(timezone.utc).isoformat(),
    }
    chain.append(entry)
    return entry


def verify_audit_chain(state: MutableMapping[str, Any]) -> dict[str, Any]:
    """Recompute every chain link and return the first broken position."""

    chain = state.get("auditChain") or []
    expected_previous = GENESIS_HASH
    for index, entry in enumerate(chain, start=1):
        if not isinstance(entry, dict):
            return _failure(index, "entry is not an object")
        if int(entry.get("sequence", -1)) != index:
            return _failure(index, "sequence is not contiguous")
        if str(entry.get("previousHash")) != expected_previous:
            return _failure(index, "previous hash does not match")
        expected_chain = _chain_hash(
            expected_previous,
            index,
            str(entry.get("collection") or ""),
            str(entry.get("operation") or ""),
            str(entry.get("recordId") or ""),
            str(entry.get("contentHash") or ""),
        )
        if str(entry.get("chainHash")) != expected_chain:
            return _failure(index, "chain hash does not match")
        expected_previous = expected_chain
    return {
        "verified": True,
        "status": "verified",
        "entries": len(chain),
        "lastChainHash": expected_previous if chain else GENESIS_HASH,
        "message": "Audit chain is internally consistent.",
    }


def audit_chain_status(state: MutableMapping[str, Any]) -> dict[str, Any]:
    result = verify_audit_chain(state)
    result["collections"] = sorted(AUDITED_COLLECTIONS)
    result["mode"] = "local_hash_chain"
    return result


def _content_hash(collection: str, operation: str, record: MutableMapping[str, Any]) -> str:
    payload = {
        "collection": collection,
        "operation": operation,
        "record": _json_safe(record),
    }
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def _chain_hash(
    previous_hash: str,
    sequence: int,
    collection: str,
    operation: str,
    record_id: str,
    content_hash: str,
) -> str:
    payload = {
        "previousHash": previous_hash,
        "sequence": sequence,
        "collection": collection,
        "operation": operation,
        "recordId": record_id,
        "contentHash": content_hash,
    }
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str)


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value


def _failure(sequence: int, message: str) -> dict[str, Any]:
    return {
        "verified": False,
        "status": "broken",
        "entries": max(0, sequence - 1),
        "brokenSequence": sequence,
        "message": message,
    }
