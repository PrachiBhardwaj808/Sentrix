"""Tamper-evident local audit primitives."""

from .chain import append_chain_entry, audit_chain_status, verify_audit_chain

__all__ = ["append_chain_entry", "audit_chain_status", "verify_audit_chain"]
