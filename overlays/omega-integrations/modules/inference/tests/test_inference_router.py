"""Contract tests for routing ONLY, not LLM backends or GPU performance."""
import sys
from pathlib import Path
import unittest
from dataclasses import replace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "reference"))
from inference_router import Deployment, ExecutionMode, Request, Runtime, NoEligibleRuntime, select_runtime


def req(**changes):
    return replace(Request("tenant-1", ExecutionMode.OFFLINE, "PRIVATE", "qwen-local", "GGUF", frozenset({"CHAT", "STREAMING"}), 800, reserve_mib=128), **changes)


def rt(name="local", **changes):
    return replace(Runtime(name, "llama.cpp", Deployment.ON_DEVICE, "qwen-local", "GGUF", frozenset({"CHAT", "STREAMING"}), frozenset({"PRIVATE", "INTERNAL", "PUBLIC"}), frozenset({"tenant-1"}), 1800, True, True, priority=10, ttft_p95_ms=300, cost_micro_usd_per_1000_tokens=0), **changes)


class RoutingTests(unittest.TestCase):
    def test_offline_local_is_selected(self):
        self.assertEqual(select_runtime(req(), [rt()]).runtime_id, "local")

    def test_offline_refuses_cloud_even_when_remote_allowed(self):
        with self.assertRaises(NoEligibleRuntime):
            select_runtime(req(allow_remote_egress=True), [rt(deployment=Deployment.CLOUD_HPC)])

    def test_hybrid_requires_explicit_consent_for_remote(self):
        with self.assertRaises(NoEligibleRuntime):
            select_runtime(req(mode=ExecutionMode.HYBRID), [rt(deployment=Deployment.CLOUD_HPC)])

    def test_hybrid_remote_with_consent(self):
        x = rt(deployment=Deployment.CLOUD_HPC)
        self.assertEqual(select_runtime(req(mode=ExecutionMode.HYBRID, allow_remote_egress=True), [x]), x)

    def test_hybrid_local_preferred_when_cloud_faster(self):
        c = rt(name="cloud", deployment=Deployment.CLOUD_HPC, priority=0, ttft_p95_ms=20)
        self.assertEqual(select_runtime(req(mode=ExecutionMode.HYBRID, allow_remote_egress=True), [c, rt()]).runtime_id, "local")

    def test_cloud_hpc_mode_requires_cloud_and_consent(self):
        with self.assertRaises(NoEligibleRuntime):
            select_runtime(req(mode=ExecutionMode.CLOUD_HPC), [rt()])
        with self.assertRaises(NoEligibleRuntime):
            select_runtime(req(mode=ExecutionMode.CLOUD_HPC), [rt(deployment=Deployment.CLOUD_HPC)])

    def test_wrong_tenant_rejected(self):
        with self.assertRaises(NoEligibleRuntime):
            select_runtime(req(), [rt(tenants=frozenset({"tenant-2"}))])

    def test_data_class_rejected(self):
        with self.assertRaises(NoEligibleRuntime):
            select_runtime(req(), [rt(allowed_data_classes=frozenset({"PUBLIC"}))])

    def test_missing_capability_rejected(self):
        with self.assertRaises(NoEligibleRuntime):
            select_runtime(req(), [rt(capabilities=frozenset({"CHAT"}))])

    def test_insufficient_headroom_rejected(self):
        with self.assertRaises(NoEligibleRuntime):
            select_runtime(req(), [rt(memory_headroom_mib=927)])

    def test_wrong_format_and_model_rejected(self):
        with self.assertRaises(NoEligibleRuntime):
            select_runtime(req(), [rt(model_format="SAFETENSORS")])
        with self.assertRaises(NoEligibleRuntime):
            select_runtime(req(), [rt(model_ref="unrelated")])

    def test_unhealthy_and_unpinned_rejected(self):
        for x in (rt(healthy=False), rt(version_pinned=False)):
            with self.assertRaises(NoEligibleRuntime):
                select_runtime(req(), [x])

    def test_determinism_independent_of_candidate_order(self):
        a, b = rt("aaa"), rt("bbb")
        self.assertEqual(select_runtime(req(), [a,b]), a)
        self.assertEqual(select_runtime(req(), [b,a]), a)

    def test_no_candidates_fails_closed(self):
        with self.assertRaises(NoEligibleRuntime):
            select_runtime(req(), [])

    def test_duplicate_ids_rejected(self):
        with self.assertRaises(ValueError):
            select_runtime(req(), [rt(), rt()])

    def test_invalid_request_rejected(self):
        for r in (req(tenant_id=""), req(data_class="UNKNOWN"), req(estimated_peak_mib=-1), req(capabilities=frozenset())):
            with self.assertRaises(ValueError):
                select_runtime(r, [rt()])

    def test_zero_remote_egress_and_no_silent_privacy_downgrade(self):
        cloud = rt("cloud", deployment=Deployment.CLOUD_HPC, allowed_data_classes=frozenset({"PUBLIC"}))
        with self.assertRaises(NoEligibleRuntime):
            select_runtime(req(mode=ExecutionMode.HYBRID, allow_remote_egress=True), [cloud])

    def test_stable_ranking_uses_priority_then_latency(self):
        high = rt("high", priority=3, ttft_p95_ms=5000)
        low = rt("low", priority=5, ttft_p95_ms=1)
        self.assertEqual(select_runtime(req(), [high, low]), high)


if __name__ == "__main__":
    unittest.main()
