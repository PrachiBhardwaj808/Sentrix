"""Confirmation helper for blockchain transactions submitted by Django workers."""

from __future__ import annotations

from typing import Any

from .contract_client import BlockchainReceipt, Web3EvidenceClient


class BlockchainTransactionWorker:
    """Keep receipt waiting separate from alert request/response handling."""

    def __init__(self, client: Web3EvidenceClient) -> None:
        self.client = client

    def confirm(self, transaction_hash: str) -> BlockchainReceipt:
        return self.client.wait_for_confirmation(transaction_hash)
