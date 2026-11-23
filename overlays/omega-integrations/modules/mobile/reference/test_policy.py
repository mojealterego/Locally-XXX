import unittest
from dataclasses import replace
from datetime import datetime, timezone, timedelta
from .runtime_policy import (RuntimeMode, Workload, WorkloadKind, DeviceState,
                             Grant, ControlPolicy, decide, State, Code)

NOW = datetime(2026, 11, 21, 12, 0, tzinfo=timezone.utc)


def device(**kw):
    return replace(DeviceState(total_native_budget_mib=6553, reserved_native_mib=3500,
                               thermal_headroom=0.25, battery_percent=75,
                               charging=True, unmetered=True, network_available=True,
                               foreground=True), **kw)


def job(**kw):
    return replace(Workload(workload_id='test-123', kind=WorkloadKind.INFERENCE,
                            required_ram_mib=1024, duration_sec=60, estimated_cloud_cost_usd=0.0,
                            preferred_remote=False), **kw)


def grant(scope='cloud.compute', **kw):
    return replace(Grant(subject='u1', scope=scope,
                         expires_at=NOW + timedelta(minutes=10), issued_at=NOW - timedelta(minutes=1),
                         revoked=False), **kw)


def eval_policy(mode=RuntimeMode.OFFLINE, w=None, d=None, g=(), cap=None):
    return decide(w or job(), d or device(), mode, tuple(g), ControlPolicy() if cap is None else cap,
                  now=NOW, principal='u1')

class MobilePolicyTests(unittest.TestCase):
    def test_offline_local_inference_allowed(self):
        self.assertEqual(eval_policy().state, State.RUN_LOCAL)
    def test_offline_never_egresses_even_with_cloud_grant(self):
        r=eval_policy(w=job(preferred_remote=True),g=[grant()]); self.assertEqual(r.state,State.DENY)
    def test_offline_memory_limit_fails_closed(self):
        r=eval_policy(w=job(required_ram_mib=4000)); self.assertEqual(r.code,Code.INSUFFICIENT_NATIVE_MEMORY)
    def test_hybrid_fallback_requires_cloud_grant(self):
        r=eval_policy(mode=RuntimeMode.HYBRID,w=job(required_ram_mib=4000));self.assertEqual(r.state,State.DENY)
    def test_hybrid_fallback_authorized(self):
        r=eval_policy(mode=RuntimeMode.HYBRID,w=job(required_ram_mib=4000),g=[grant()]);self.assertEqual(r.state,State.RUN_REMOTE)
    def test_hybrid_default_local(self):
        self.assertEqual(eval_policy(mode=RuntimeMode.HYBRID,g=[grant()]).state,State.RUN_LOCAL)
    def test_cloud_hpc_requires_explicit_grant(self):
        self.assertEqual(eval_policy(mode=RuntimeMode.CLOUD_HPC).code,Code.CONSENT_REQUIRED)
    def test_cloud_hpc_with_grant(self):
        self.assertEqual(eval_policy(mode=RuntimeMode.CLOUD_HPC,g=[grant()]).state,State.RUN_REMOTE)
    def test_revoked_grant_denied(self):
        self.assertEqual(eval_policy(mode=RuntimeMode.CLOUD_HPC,g=[grant(revoked=True)]).code,Code.CONSENT_REQUIRED)
    def test_expired_grant_denied(self):
        self.assertEqual(eval_policy(mode=RuntimeMode.CLOUD_HPC,g=[grant(expires_at=NOW)]).code,Code.CONSENT_REQUIRED)
    def test_future_issued_grant_denied(self):
        self.assertEqual(eval_policy(mode=RuntimeMode.CLOUD_HPC,g=[grant(issued_at=NOW+timedelta(seconds=1))]).code,Code.CONSENT_REQUIRED)
    def test_other_principal_grant_denied(self):
        self.assertEqual(eval_policy(mode=RuntimeMode.CLOUD_HPC,g=[grant(subject='attacker')]).code,Code.CONSENT_REQUIRED)
    def test_malformed_resource_request_denied(self):
        self.assertEqual(eval_policy(w=job(required_ram_mib=-1)).code,Code.INVALID_INPUT)
    def test_empty_job_id_denied(self):
        self.assertEqual(eval_policy(w=job(workload_id='')).code,Code.INVALID_INPUT)
    def test_unknown_workload_type_denied(self):
        self.assertEqual(eval_policy(w=job(kind='unknown')).code,Code.INVALID_INPUT)
    def test_disconnected_network_remote_denied(self):
        self.assertEqual(eval_policy(mode=RuntimeMode.CLOUD_HPC,d=device(network_available=False),g=[grant()]).code,Code.NETWORK_UNAVAILABLE)
    def test_thermal_high_pauses_local(self):
        self.assertEqual(eval_policy(d=device(thermal_headroom=0.9)).state,State.PAUSE)
    def test_invalid_thermal_reading_fails_closed(self):
        self.assertEqual(eval_policy(d=device(thermal_headroom=float('nan'))).code,Code.INVALID_INPUT)
    def test_low_battery_local_pauses(self):
        self.assertEqual(eval_policy(d=device(charging=False,battery_percent=9)).code,Code.BATTERY_GUARD)
    def test_background_local_compute_paused(self):
        self.assertEqual(eval_policy(d=device(foreground=False)).code,Code.FOREGROUND_REQUIRED)
    def test_edge_donation_denies_without_consent(self):
        self.assertEqual(eval_policy(mode=RuntimeMode.HYBRID,w=job(kind=WorkloadKind.EDGE_DONATION)).code,Code.CONSENT_REQUIRED)
    def test_edge_donation_granted_when_visible_charging_unmetered(self):
        self.assertEqual(eval_policy(mode=RuntimeMode.HYBRID,w=job(kind=WorkloadKind.EDGE_DONATION),g=[grant('edge.donate')]).state,State.RUN_LOCAL)
    def test_edge_donation_requires_unmetered(self):
        self.assertEqual(eval_policy(mode=RuntimeMode.HYBRID,w=job(kind=WorkloadKind.EDGE_DONATION),d=device(unmetered=False),g=[grant('edge.donate')]).code,Code.RESOURCE_DONATION_GUARD)
    def test_edge_donation_requires_charging(self):
        self.assertEqual(eval_policy(mode=RuntimeMode.HYBRID,w=job(kind=WorkloadKind.EDGE_DONATION),d=device(charging=False),g=[grant('edge.donate')]).code,Code.RESOURCE_DONATION_GUARD)
    def test_hidden_resource_use_always_denied(self):
        self.assertEqual(eval_policy(w=job(kind=WorkloadKind.HIDDEN_RESOURCE)).state,State.DENY)
    def test_policy_evasion_always_denied(self):
        self.assertEqual(eval_policy(w=job(kind=WorkloadKind.POLICY_EVASION)).state,State.DENY)
    def test_financial_autonomy_always_denied(self):
        self.assertEqual(eval_policy(w=job(kind=WorkloadKind.AUTONOMOUS_FINANCE)).state,State.DENY)
    def test_billable_operation_restricted_without_approved_budget(self):
        r=eval_policy(mode=RuntimeMode.CLOUD_HPC,w=job(estimated_cloud_cost_usd=5),g=[grant()]);self.assertEqual(r.code,Code.BUDGET_NOT_APPROVED)
    def test_billable_operation_with_explicit_budget(self):
        r=eval_policy(mode=RuntimeMode.CLOUD_HPC,w=job(estimated_cloud_cost_usd=5),g=[grant()],cap=ControlPolicy(approved_cloud_usd=7));self.assertEqual(r.state,State.RUN_REMOTE)
    def test_budget_exceeded_denied(self):
        r=eval_policy(mode=RuntimeMode.CLOUD_HPC,w=job(estimated_cloud_cost_usd=9),g=[grant()],cap=ControlPolicy(approved_cloud_usd=7));self.assertEqual(r.code,Code.BUDGET_NOT_APPROVED)
    def test_gpu_workload_remote_requires_network(self):
        r=eval_policy(mode=RuntimeMode.HYBRID,w=job(kind=WorkloadKind.TRAINING,required_ram_mib=9000),d=device(network_available=False),g=[grant()]);self.assertEqual(r.code,Code.NETWORK_UNAVAILABLE)
    def test_request_length_limit(self):
        self.assertEqual(eval_policy(w=job(workload_id='x'*129)).code,Code.INVALID_INPUT)
    def test_memory_free_exact_boundary(self):
        self.assertEqual(eval_policy(w=job(required_ram_mib=3053)).state,State.RUN_LOCAL)
    def test_non_finite_cost_denied(self):
        self.assertEqual(eval_policy(w=job(estimated_cloud_cost_usd=float('inf'))).code,Code.INVALID_INPUT)
    def test_unknown_mode_denied(self):
        self.assertEqual(eval_policy(mode='SUPERASI').code,Code.INVALID_INPUT)
    def test_resource_donation_not_remote(self):
        r=eval_policy(mode=RuntimeMode.CLOUD_HPC,w=job(kind=WorkloadKind.EDGE_DONATION),g=[grant('edge.donate'),grant('cloud.compute')]);self.assertEqual(r.state,State.DENY)
    def test_remote_blocked_with_no_egress_flag(self):
        r=eval_policy(mode=RuntimeMode.CLOUD_HPC,g=[grant()],cap=ControlPolicy(egress_enabled=False));self.assertEqual(r.code,Code.EGRESS_DISABLED)

if __name__=='__main__': unittest.main()
