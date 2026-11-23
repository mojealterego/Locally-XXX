#!/usr/bin/env python3
"""OmegOS document-contract test utility.

Strictly a metadata/data-flow verifier; NOT a formal theorem prover. A separate
real trusted checker must validate proof bytes against the complete goal and
all axioms in any future production implementation.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Callable

import jsonschema

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_DIR = ROOT / "schemas"
KEY_FIELDS = (
    "tenant_id", "obligation_id", "source_sha256", "spec_sha256",
    "assumptions_sha256", "toolchain_lock_sha256", "semantic_profile"
)


class RejectedEvidence(ValueError):
    """The release gate must fail closed for this input."""


def load_schema(name: str) -> dict:
    if name not in ("proof_obligation", "proof_receipt", "adapter_manifest"):
        raise RejectedEvidence("Unrecognized schema name")
    return json.loads((SCHEMA_DIR / f"{name}.schema.json").read_text(encoding="utf-8"))


def validate(obj: dict, name: str) -> None:
    jsonschema.Draft202012Validator(load_schema(name)).validate(obj)
    if name == "proof_obligation":
        if obj["obligation_id"] in obj["dependencies"]:
            raise RejectedEvidence("Self-referential obligation")
        if obj["goal_language"] == "SMT_LIB2" and "(assert" not in obj["goal"]:
            raise RejectedEvidence("Incomplete SMT-LIB goal fragment")


def canonical_sha256(value: object) -> str:
    # Stable for metadata/canonical JSON only; NOT a verified proof encoding.
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def cache_key(obligation: dict, checker_policy_sha256: str, target_sha256: str) -> str:
    validate(obligation, "proof_obligation")
    for value in (checker_policy_sha256, target_sha256):
        if len(value) != 64 or any(ch not in "0123456789abcdef" for ch in value):
            raise RejectedEvidence("Invalid cache dependency hash")
    return canonical_sha256({
        "obligation": obligation,
        "checker_policy_sha256": checker_policy_sha256,
        "target_sha256": target_sha256,
    })


def invalidated_descendants(deps: dict[str, list[str]], changed: str) -> set[str]:
    """The deps map stores node -> immediate prerequisites. Reject cycles."""
    if changed not in deps:
        raise RejectedEvidence("Changed node not in DAG")
    for node, children in deps.items():
        if node in children or any(item not in deps for item in children):
            raise RejectedEvidence("DAG contains self edge or dangling reference")
    seen: dict[str, int] = {}

    def visit(node: str) -> None:
        color = seen.get(node, 0)
        if color == 1:
            raise RejectedEvidence("Proof dependency cycle")
        if color == 2:
            return
        seen[node] = 1
        for prereq in deps[node]:
            visit(prereq)
        seen[node] = 2

    for node in deps:
        visit(node)
    victims = {changed}
    updated = True
    while updated:
        count = len(victims)
        victims.update(node for node, prereqs in deps.items() if any(x in victims for x in prereqs))
        updated = len(victims) > count
    return victims


def eligible_for_promotion(
    obligation: dict,
    receipt: dict,
    adapter: dict,
    proof_bytes: bytes | None = None,
    log_bytes: bytes | None = None,
    independent_checker: Callable[[dict, bytes, str], bool] | None = None,
) -> bool:
    """Contract gate. Never use this alone as a proof checker.

    independent_checker must be the *actual isolated checker*, configured by a
    trusted operator. Mocking it in tests validates ONLY this contract.
    """
    try:
        validate(obligation, "proof_obligation")
        validate(receipt, "proof_receipt")
        validate(adapter, "adapter_manifest")
    except (jsonschema.ValidationError, RejectedEvidence):
        return False
    if any(obligation[k] != receipt[k] for k in KEY_FIELDS):
        return False
    if receipt["status"] != "VERIFIED" or independent_checker is None:
        return False
    if not adapter["trusted_as_checker"] or adapter["allow_network"]:
        return False
    if receipt.get("checker_id") != adapter["adapter_id"]:
        return False
    if receipt.get("proof_format") not in adapter["proof_formats"]:
        return False
    if not proof_bytes or not log_bytes:
        return False
    if len(proof_bytes) > 128 * 1024 * 1024 or len(log_bytes) > 16 * 1024 * 1024:
        return False
    if hashlib.sha256(proof_bytes).hexdigest() != receipt.get("proof_sha256"):
        return False
    if hashlib.sha256(log_bytes).hexdigest() != receipt.get("checker_log_sha256"):
        return False
    if receipt["verification_scope"] in ("BINARY", "HARDWARE", "SYSTEM_COMPOSITION"):
        if not receipt.get("source_binary_sha256") or not receipt.get("translation_validation_sha256"):
            return False
    # Note: matching the checked GOAL and trusted assumptions MUST happen inside
    # independent_checker, using source+spec+assumptions, not a boolean from AI.
    try:
        return independent_checker(obligation, proof_bytes, receipt["proof_format"]) is True
    except (Exception, KeyboardInterrupt):
        return False


def check_examples() -> None:
    for name, kind in (
        ("proof_obligation.example.json", "proof_obligation"),
        ("proof_receipt.not_run.json", "proof_receipt"),
        ("adapter_manifest.example.json", "adapter_manifest"),
    ):
        validate(json.loads((ROOT / "examples" / name).read_text(encoding="utf-8")), kind)


if __name__ == "__main__":
    check_examples()
    print("EXAMPLE CONTRACT SCHEMAS: PASS (no proof engine executed)")
