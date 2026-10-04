"""Django-side client for the append-only EvidenceRegistry contract."""

from __future__ import annotations

import hashlib
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping, Optional

from ..evidence.custody import CustodyEvent
from ..evidence.hashing import is_sha256, sha256_text


class BlockchainError(RuntimeError):
    """Raised when blockchain configuration, submission, or confirmation fails."""


@dataclass(frozen=True)
class BlockchainConfig:
    rpc_url: str
    chain_id: int
    contract_address: str
    signer_private_key: str
    confirmations: int = 1
    transaction_timeout_seconds: int = 120
    gas_limit: Optional[int] = None

    @classmethod
    def from_env(cls, environ: Optional[Mapping[str, str]] = None) -> "BlockchainConfig":
        values = environ if environ is not None else os.environ
        rpc_url = values.get("BLOCKCHAIN_RPC_URL", "").strip()
        contract_address = values.get("BLOCKCHAIN_CONTRACT_ADDRESS", "").strip()
        private_key = values.get("BLOCKCHAIN_SIGNER_PRIVATE_KEY", "").strip()
        if not rpc_url or rpc_url.startswith("<"):
            raise BlockchainError("BLOCKCHAIN_RPC_URL is not configured")
        if not re.fullmatch(r"0x[0-9a-fA-F]{40}", contract_address):
            raise BlockchainError("BLOCKCHAIN_CONTRACT_ADDRESS must be a 20-byte address")
        if not private_key or private_key.startswith("<"):
            raise BlockchainError("BLOCKCHAIN_SIGNER_PRIVATE_KEY is not configured")

        chain_id = _positive_int(values.get("BLOCKCHAIN_CHAIN_ID", ""), "chain id")
        confirmations = _positive_int(
            values.get("BLOCKCHAIN_CONFIRMATIONS", "1"), "confirmations"
        )
        timeout = _positive_int(
            values.get("BLOCKCHAIN_TX_TIMEOUT_SECONDS", "120"), "transaction timeout"
        )
        gas_limit = _optional_positive_int(values.get("BLOCKCHAIN_GAS_LIMIT", ""), "gas limit")
        return cls(
            rpc_url=rpc_url,
            chain_id=chain_id,
            contract_address=contract_address,
            signer_private_key=private_key,
            confirmations=confirmations,
            transaction_timeout_seconds=timeout,
            gas_limit=gas_limit,
        )


@dataclass(frozen=True)
class BlockchainReceipt:
    transaction_hash: str
    block_number: int
    status: int
    confirmed_at: datetime


EVIDENCE_REGISTRY_ABI = [
    {
        "inputs": [
            {"internalType": "bytes32", "name": "incidentReferenceHash", "type": "bytes32"},
            {"internalType": "bytes32", "name": "evidenceHash", "type": "bytes32"},
            {"internalType": "uint64", "name": "capturedAt", "type": "uint64"},
        ],
        "name": "registerIncident",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "bytes32", "name": "incidentReferenceHash", "type": "bytes32"},
            {"internalType": "bytes32", "name": "evidenceHash", "type": "bytes32"},
            {"internalType": "bytes32", "name": "modelVersionHash", "type": "bytes32"},
            {"internalType": "bytes32", "name": "modelArtifactHash", "type": "bytes32"},
            {"internalType": "uint256", "name": "confidenceBps", "type": "uint256"},
            {"internalType": "uint256", "name": "decisionThresholdBps", "type": "uint256"},
            {"internalType": "uint64", "name": "capturedAt", "type": "uint64"},
        ],
        "name": "registerHighSeverityIncident",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "bytes32", "name": "incidentReferenceHash", "type": "bytes32"},
            {"internalType": "bytes32", "name": "evidenceHash", "type": "bytes32"},
            {"internalType": "string", "name": "action", "type": "string"},
            {"internalType": "string", "name": "actorRole", "type": "string"},
            {"internalType": "uint64", "name": "occurredAt", "type": "uint64"},
        ],
        "name": "appendCustodyEvent",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
        "name": "registeredIncidents",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
        "name": "incidentEvidenceHashes",
        "outputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
        "stateMutability": "view",
        "type": "function",
    },
]


class Web3EvidenceClient:
    """Sign and submit contract calls without exposing the private key to clients."""

    def __init__(self, config: BlockchainConfig) -> None:
        try:
            from web3 import Web3
        except ImportError as exc:  # pragma: no cover - exercised in deployment
            raise BlockchainError(
                "Install backend/requirements-services.txt before using Web3EvidenceClient"
            ) from exc

        self.config = config
        self._web3 = Web3(
            Web3.HTTPProvider(
                config.rpc_url,
                request_kwargs={"timeout": config.transaction_timeout_seconds},
            )
        )
        if not self._web3.is_connected():
            raise BlockchainError("could not connect to the configured blockchain RPC")
        self._account = self._web3.eth.account.from_key(config.signer_private_key)
        self._contract = self._web3.eth.contract(
            address=self._web3.to_checksum_address(config.contract_address),
            abi=EVIDENCE_REGISTRY_ABI,
        )

    def register_incident(
        self, incident_reference_hash: str, evidence_sha256: str, captured_at: datetime
    ) -> str:
        return self._send(
            self._contract.functions.registerIncident(
                _bytes32(incident_reference_hash),
                _bytes32(evidence_sha256),
                _unix_timestamp(captured_at),
            )
        )

    def register_high_severity_incident(
        self,
        incident_reference_hash: str,
        evidence_sha256: str,
        model_version_hash: str,
        model_artifact_hash: str,
        confidence: float,
        decision_threshold: float,
        captured_at: datetime,
    ) -> str:
        return self._send(
            self._contract.functions.registerHighSeverityIncident(
                _bytes32(incident_reference_hash),
                _bytes32(evidence_sha256),
                _bytes32(model_version_hash),
                _bytes32(model_artifact_hash),
                _basis_points(confidence),
                _basis_points(decision_threshold),
                _unix_timestamp(captured_at),
            )
        )

    def append_custody_event(self, event: CustodyEvent) -> str:
        return self._send(
            self._contract.functions.appendCustodyEvent(
                _bytes32(sha256_text(event.event_id)),
                _bytes32(sha256_text(event.incident_id)),
                _bytes32(event.evidence_sha256),
                event.action,
                event.actor_role,
                _unix_timestamp(event.occurred_at),
            )
        )

    def wait_for_confirmation(self, transaction_hash: str) -> BlockchainReceipt:
        try:
            receipt = self._web3.eth.wait_for_transaction_receipt(
                transaction_hash,
                timeout=self.config.transaction_timeout_seconds,
            )
        except Exception as exc:
            raise BlockchainError("timed out waiting for blockchain confirmation") from exc

        status = int(receipt.get("status", 0))
        if status != 1:
            raise BlockchainError(f"blockchain transaction reverted: {transaction_hash}")
        block_number = int(receipt["blockNumber"])
        target_block = block_number + self.config.confirmations - 1
        while int(self._web3.eth.block_number) < target_block:
            time.sleep(1)
        return BlockchainReceipt(
            transaction_hash=transaction_hash,
            block_number=block_number,
            status=status,
            confirmed_at=datetime.now(timezone.utc),
        )

    @property
    def network_chain_id(self) -> int:
        return int(self._web3.eth.chain_id)

    def verify_incident(self, incident_reference_hash: str, evidence_sha256: str) -> bool:
        """Verify the append-only on-chain incident hash pair."""

        reference = _bytes32(incident_reference_hash)
        expected = _bytes32(evidence_sha256)
        registered = bool(self._contract.functions.registeredIncidents(reference).call())
        stored = self._contract.functions.incidentEvidenceHashes(reference).call()
        return registered and bytes(stored) == expected

    def _send(self, function: Any) -> str:
        try:
            nonce = self._web3.eth.get_transaction_count(self._account.address, "pending")
            transaction = function.build_transaction(
                {
                    "from": self._account.address,
                    "nonce": nonce,
                    "chainId": self.config.chain_id,
                }
            )
            if self.config.gas_limit is not None:
                transaction["gas"] = self.config.gas_limit
            elif "gas" not in transaction:
                transaction["gas"] = self._web3.eth.estimate_gas(transaction)
            if "gasPrice" not in transaction and "maxFeePerGas" not in transaction:
                transaction["gasPrice"] = self._web3.eth.gas_price
            signed = self._account.sign_transaction(transaction)
            raw_transaction = getattr(signed, "raw_transaction", None)
            if raw_transaction is None:
                raw_transaction = signed.rawTransaction
            return self._web3.to_hex(self._web3.eth.send_raw_transaction(raw_transaction))
        except Exception as exc:
            raise BlockchainError("could not submit blockchain transaction") from exc


def _bytes32(value: str) -> bytes:
    candidate = (value or "").strip().lower()
    if candidate.startswith("0x"):
        candidate = candidate[2:]
    if is_sha256(candidate):
        return bytes.fromhex(candidate)
    if len(candidate) == 64 and all(char in "0123456789abcdef" for char in candidate):
        return bytes.fromhex(candidate)
    return hashlib.sha256(value.encode("utf-8")).digest()


def _unix_timestamp(value: datetime) -> int:
    return int(value.astimezone(timezone.utc).timestamp())


def _basis_points(value: float) -> int:
    if not 0.0 <= value <= 1.0:
        raise BlockchainError("confidence and threshold must be between 0 and 1")
    return round(value * 10000)


def _positive_int(value: str, label: str) -> int:
    try:
        result = int(value)
    except (TypeError, ValueError) as exc:
        raise BlockchainError(f"{label} must be a positive integer") from exc
    if result <= 0:
        raise BlockchainError(f"{label} must be a positive integer")
    return result


def _optional_positive_int(value: str, label: str) -> Optional[int]:
    if not value or value.startswith("<"):
        return None
    return _positive_int(value, label)
