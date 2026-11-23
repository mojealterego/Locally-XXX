from __future__ import annotations
import copy
import hashlib
import json
from pathlib import Path
import unittest

from verify_contracts import (
    RejectedEvidence, cache_key, check_examples, eligible_for_promotion,
    invalidated_descendants, validate
)

ROOT = Path(__file__).resolve().parents[1]


def example(filename: str) -> dict:
    return json.loads((ROOT / "examples" / filename).read_text(encoding="utf-8"))


class ContractsTest(unittest.TestCase):
    def setUp(self):
        self.goal = example("proof_obligation.example.json")
        self.receipt = example("proof_receipt.not_run.json")
        self.adapter = example("adapter_manifest.example.json")
        self.mock_proof = b"DUMMY PROOF: NOT AN ACTUAL CERTIFICATE"
        self.mock_log = b"DUMMY CHECKER LOG: UNIT TEST ONLY"

    def verified_mock(self):
        receipt = copy.deepcopy(self.receipt)
        receipt.update(
            status="VERIFIED", checker_id=self.adapter["adapter_id"],
            checker_version="fixture-only", proof_format="ALETHE",
            proof_sha256=hashlib.sha256(self.mock_proof).hexdigest(),
            checker_log_sha256=hashlib.sha256(self.mock_log).hexdigest(),
        )
        adapter = copy.deepcopy(self.adapter)
        adapter["trusted_as_checker"] = True
        return receipt, adapter

    def test_01_schema_fixtures_pass(self):
        check_examples()

    def test_02_reject_unknown_field(self):
        self.goal["unexpected"] = 1
        with self.assertRaises(Exception):
            validate(self.goal, "proof_obligation")

    def test_03_reject_self_edge(self):
        self.goal["dependencies"] = [self.goal["obligation_id"]]
        with self.assertRaises(RejectedEvidence):
            validate(self.goal, "proof_obligation")

    def test_04_invalidation_transitive(self):
        dag = {"A": [], "B": ["A"], "C": ["B"], "D": []}
        self.assertEqual(invalidated_descendants(dag, "A"), {"A", "B", "C"})

    def test_05_cycle_detected(self):
        with self.assertRaises(RejectedEvidence):
            invalidated_descendants({"A": ["B"], "B": ["A"]}, "A")

    def test_06_stale_toolchain_invalidates_cache(self):
        k1 = cache_key(self.goal, "e"*64, "f"*64)
        changed = copy.deepcopy(self.goal)
        changed["toolchain_lock_sha256"] = "1"*64
        self.assertNotEqual(k1, cache_key(changed, "e"*64, "f"*64))

    def test_07_policy_change_invalidates_cache(self):
        self.assertNotEqual(cache_key(self.goal, "e"*64, "f"*64), cache_key(self.goal, "1"*64, "f"*64))

    def test_08_cannot_promote_not_run(self):
        self.assertFalse(eligible_for_promotion(self.goal, self.receipt, self.adapter))

    def test_09_verified_label_without_checker_rejected(self):
        receipt, adapter = self.verified_mock()
        self.assertFalse(eligible_for_promotion(self.goal, receipt, adapter, self.mock_proof, self.mock_log))

    def test_10_untrusted_adapter_rejected(self):
        receipt, adapter = self.verified_mock()
        adapter["trusted_as_checker"] = False
        self.assertFalse(eligible_for_promotion(self.goal, receipt, adapter, self.mock_proof, self.mock_log, lambda *_: True))

    def test_11_network_enabled_checker_rejected(self):
        receipt, adapter = self.verified_mock()
        adapter["allow_network"] = True
        self.assertFalse(eligible_for_promotion(self.goal, receipt, adapter, self.mock_proof, self.mock_log, lambda *_: True))

    def test_12_wrong_tenant_rejected(self):
        receipt, adapter = self.verified_mock()
        receipt["tenant_id"] = "other-tenant"
        self.assertFalse(eligible_for_promotion(self.goal, receipt, adapter, self.mock_proof, self.mock_log, lambda *_: True))

    def test_13_mismatched_proof_hash_rejected(self):
        receipt, adapter = self.verified_mock()
        self.assertFalse(eligible_for_promotion(self.goal, receipt, adapter, b"evil", self.mock_log, lambda *_: True))

    def test_14_mismatched_goal_spec_rejected(self):
        receipt, adapter = self.verified_mock()
        receipt["spec_sha256"] = "e"*64
        self.assertFalse(eligible_for_promotion(self.goal, receipt, adapter, self.mock_proof, self.mock_log, lambda *_: True))

    def test_15_checker_exception_rejected(self):
        receipt, adapter = self.verified_mock()
        def bad(*args):
            raise RuntimeError("checker failed")
        self.assertFalse(eligible_for_promotion(self.goal, receipt, adapter, self.mock_proof, self.mock_log, bad))

    def test_16_mock_positive_contract_only(self):
        receipt, adapter = self.verified_mock()
        self.assertTrue(eligible_for_promotion(self.goal, receipt, adapter, self.mock_proof, self.mock_log, lambda *_: True))

    def test_17_binary_scope_without_translation_receipt_rejected(self):
        receipt, adapter = self.verified_mock()
        receipt["verification_scope"] = "BINARY"
        self.assertFalse(eligible_for_promotion(self.goal, receipt, adapter, self.mock_proof, self.mock_log, lambda *_: True))

    def test_18_wrong_format_rejected(self):
        receipt, adapter = self.verified_mock()
        receipt["proof_format"] = "ROCQ_TERM"
        self.assertFalse(eligible_for_promotion(self.goal, receipt, adapter, self.mock_proof, self.mock_log, lambda *_: True))

    def test_19_cache_deterministic(self):
        self.assertEqual(cache_key(self.goal, "e"*64, "f"*64), cache_key(dict(reversed(list(self.goal.items()))), "e"*64, "f"*64))

    def test_20_invalid_syntax_rejected(self):
        self.goal["goal"] = "not-a-valid-smt-goal"
        with self.assertRaises(RejectedEvidence):
            validate(self.goal, "proof_obligation")


if __name__ == "__main__":
    unittest.main()
