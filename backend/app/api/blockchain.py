"""API-facing adapters for the backend-owned evidence registry signer."""

from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any

from ..services.blockchain.contract_client import (
    BlockchainConfig,
    BlockchainError,
    Web3EvidenceClient,
)
from ..services.evidence.hashing import sha256_text


def get_status() -> dict[str, Any]:
    try:
        config = BlockchainConfig.from_env()
    except BlockchainError as exc:
        return {
            "configured": False,
            "connected": False,
            "mode": "not_configured",
            "network": os.getenv("BLOCKCHAIN_NETWORK", "Sepolia testnet"),
            "chainId": None,
            "contractAddress": None,
            "explorerBaseUrl": os.getenv("BLOCKCHAIN_EXPLORER_BASE_URL", "").strip() or None,
            "message": str(exc),
        }

    try:
        client = Web3EvidenceClient(config)
        return {
            "configured": True,
            "connected": True,
            "mode": "live",
            "network": os.getenv("BLOCKCHAIN_NETWORK", "Configured EVM network"),
            "chainId": client.network_chain_id,
            "contractAddress": config.contract_address,
            "explorerBaseUrl": os.getenv("BLOCKCHAIN_EXPLORER_BASE_URL", "").strip() or None,
            "message": "Backend signer is connected to the evidence registry.",
        }
    except BlockchainError as exc:
        return {
            "configured": True,
            "connected": False,
            "mode": "unavailable",
            "network": os.getenv("BLOCKCHAIN_NETWORK", "Configured EVM network"),
            "chainId": config.chain_id,
            "contractAddress": config.contract_address,
            "explorerBaseUrl": os.getenv("BLOCKCHAIN_EXPLORER_BASE_URL", "").strip() or None,
            "message": str(exc),
        }


def evidence_digest(alert: dict[str, Any]) -> str:
    """Return a supplied evidence hash or a deterministic metadata digest.

    Production capture workers should populate ``evidenceSha256`` after hashing
    the actual snapshot or clip. The metadata digest keeps manual operator
    flags verifiable without pretending that they contain a media file.
    """

    existing = str(alert.get("evidenceSha256") or "").strip()
    if existing:
        return existing.removeprefix("0x")
    payload = {
        "alertId": alert.get("id"),
        "capturedAt": alert.get("timestamp"),
        "cameraId": alert.get("sourceCameraId"),
        "evidenceUrl": alert.get("evidenceUrl"),
    }
    return sha256_text(json.dumps(payload, sort_keys=True, separators=(",", ":")))


def incident_digest(alert_id: str) -> str:
    return sha256_text(alert_id)


def anchor(alert: dict[str, Any]) -> dict[str, Any]:
    config = BlockchainConfig.from_env()
    client = Web3EvidenceClient(config)
    incident_hash = incident_digest(str(alert["id"]))
    evidence_hash = evidence_digest(alert)
    captured_at = _parse_timestamp(str(alert.get("timestamp")))
    if str(alert.get("level")) == "critical":
        model_version = str(alert.get("modelVersion") or "unspecified-model")
        model_artifact = str(alert.get("modelArtifactHash") or sha256_text(model_version))
        transaction_hash = client.register_high_severity_incident(
            incident_hash,
            evidence_hash,
            sha256_text(model_version),
            model_artifact,
            float(alert.get("confidence", 0)) / 100,
            float(os.getenv("BLOCKCHAIN_DECISION_THRESHOLD", "0.80")),
            captured_at,
        )
    else:
        transaction_hash = client.register_incident(incident_hash, evidence_hash, captured_at)
    receipt = client.wait_for_confirmation(transaction_hash)
    return {
        "transactionHash": receipt.transaction_hash,
        "blockNumber": receipt.block_number,
        "confirmedAt": receipt.confirmed_at.isoformat(),
        "incidentReferenceHash": incident_hash,
        "evidenceSha256": evidence_hash,
        "status": "anchored",
        "explorerUrl": _explorer_url(receipt.transaction_hash),
    }


def verify(alert: dict[str, Any]) -> dict[str, Any]:
    incident_hash = str(alert.get("blockchainIncidentHash") or incident_digest(str(alert["id"])))
    evidence_hash = evidence_digest(alert)
    transaction_hash = alert.get("blockchainTxId")
    status = get_status()
    if not status["configured"]:
        return {
            "status": "not_configured",
            "verified": False,
            "incidentReferenceHash": incident_hash,
            "evidenceSha256": evidence_hash,
            "transactionHash": transaction_hash,
            "message": "Configure the backend signer, RPC URL, and contract address to verify on-chain.",
        }
    if not status["connected"]:
        return {
            "status": "unavailable",
            "verified": False,
            "incidentReferenceHash": incident_hash,
            "evidenceSha256": evidence_hash,
            "transactionHash": transaction_hash,
            "message": status["message"],
        }
    client = Web3EvidenceClient(BlockchainConfig.from_env())
    verified = client.verify_incident(incident_hash, evidence_hash)
    return {
        "status": "verified" if verified else "mismatch",
        "verified": verified,
        "incidentReferenceHash": incident_hash,
        "evidenceSha256": evidence_hash,
        "transactionHash": transaction_hash,
        "explorerUrl": _explorer_url(str(transaction_hash)) if transaction_hash else None,
        "message": "Evidence hash matches the append-only registry." if verified else "Evidence hash does not match the registry.",
    }


def _parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _explorer_url(transaction_hash: str) -> str | None:
    base = os.getenv("BLOCKCHAIN_EXPLORER_BASE_URL", "").strip().rstrip("/")
    return f"{base}/tx/{transaction_hash}" if base and transaction_hash else None
