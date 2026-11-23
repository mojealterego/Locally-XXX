from __future__ import annotations
from dataclasses import replace
from datetime import datetime,timedelta,timezone
from pathlib import Path
import sys
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from compute_bridge import mobile,inference,plan_inference_execution,PolicyBridgeError

NOW=datetime(2026,11,23,10,0,tzinfo=timezone.utc)
LOCAL=inference.Runtime('local','llama.cpp',inference.Deployment.ON_DEVICE,'model-1','GGUF',frozenset({'chat'}),frozenset({'PRIVATE','INTERNAL','PUBLIC'}),frozenset({'tenant-1'}),4096,True,True)
REMOTE=inference.Runtime('cloud','vLLM',inference.Deployment.CLOUD_HPC,'model-1','GGUF',frozenset({'chat'}),frozenset({'INTERNAL','PRIVATE','PUBLIC'}),frozenset({'tenant-1'}),65536,True,True)

def config(mode='OFFLINE',memory=1024,remote=False,data='INTERNAL',consent=False,allow_remote=False):
    mod=mobile.RuntimeMode(mode)
    workload=mobile.Workload('task-1',mobile.WorkloadKind.INFERENCE,memory,60,0.01 if remote else 0.0,remote)
    device=mobile.DeviceState(6553,3500,0.25,75,True,True,True,True)
    policy=mobile.ControlPolicy(approved_cloud_usd=1.0)
    grants=[mobile.Grant('tenant-1','cloud.compute',NOW-timedelta(minutes=1),NOW+timedelta(minutes=10),False)] if consent else []
    request=inference.Request('tenant-1',inference.ExecutionMode(mode),data,'model-1','GGUF',frozenset({'chat'}),memory,allow_remote_egress=allow_remote)
    return dict(workload=workload,device=device,mode=mod,grants=grants,policy=policy,now=NOW,principal='tenant-1',request=request,runtimes=[LOCAL,REMOTE])

class AdmissionTests(unittest.TestCase):
    def test_offline_selects_on_device_without_network(self):
        c=config();c['device']=replace(c['device'],network_available=False)
        a=plan_inference_execution(**c);self.assertEqual((a.state,a.runtime_id),('ROUTE_PLAN_ONLY','local'))
    def test_cloud_requires_explicit_grant(self):
        c=config('CLOUD_HPC',remote=True,allow_remote=True)
        self.assertEqual(plan_inference_execution(**c).reason,'CONSENT_REQUIRED')
    def test_cloud_with_grant_selects_hpc_only(self):
        c=config('CLOUD_HPC',remote=True,consent=True,allow_remote=True)
        self.assertEqual(plan_inference_execution(**c).runtime_id,'cloud')
    def test_cloud_flag_without_grant_cannot_bypass(self):
        c=config('HYBRID',remote=True,allow_remote=True)
        self.assertEqual(plan_inference_execution(**c).state,'DENIED_OR_PAUSED')
    def test_private_cloud_is_blocked_even_with_grant(self):
        c=config('CLOUD_HPC',remote=True,consent=True,allow_remote=True,data='PRIVATE')
        self.assertEqual(plan_inference_execution(**c).reason,'PRIVATE_REMOTE_BLOCKED')
    def test_restricted_cloud_is_blocked_even_with_grant(self):
        c=config('CLOUD_HPC',remote=True,consent=True,allow_remote=True,data='RESTRICTED')
        self.assertEqual(plan_inference_execution(**c).reason,'PRIVATE_REMOTE_BLOCKED')
    def test_local_thermal_pause(self):
        c=config();c['device']=replace(c['device'],thermal_headroom=0.99)
        self.assertEqual(plan_inference_execution(**c).reason,'THERMAL_GUARD')
    def test_no_remote_fallback_when_local_policy_is_authoritative(self):
        c=config('HYBRID',consent=True,allow_remote=True);c['runtimes']=[REMOTE]
        self.assertEqual(plan_inference_execution(**c).reason,'NO_POLICY_ELIGIBLE_BACKEND')
    def test_mismatched_memory_budget_denied(self):
        c=config();c['request']=replace(c['request'],estimated_peak_mib=1500)
        with self.assertRaisesRegex(PolicyBridgeError,'UNALIGNED_MEMORY_LEASE'):plan_inference_execution(**c)
    def test_mismatched_mode_denied(self):
        c=config();c['request']=replace(c['request'],mode=inference.ExecutionMode.CLOUD_HPC)
        with self.assertRaisesRegex(PolicyBridgeError,'MODE_MISMATCH'):plan_inference_execution(**c)
    def test_foreign_tenant_denied(self):
        c=config();c['principal']='other'
        with self.assertRaisesRegex(PolicyBridgeError,'TENANT_PRINCIPAL_MISMATCH'):plan_inference_execution(**c)
    def test_unhealthy_runtime_does_not_get_selected(self):
        c=config();c['runtimes']=[replace(LOCAL,healthy=False),REMOTE]
        self.assertEqual(plan_inference_execution(**c).state,'DENIED_OR_PAUSED')
    def test_unpinned_runtime_does_not_get_selected(self):
        c=config();c['runtimes']=[replace(LOCAL,version_pinned=False)]
        self.assertEqual(plan_inference_execution(**c).reason,'NO_POLICY_ELIGIBLE_BACKEND')
    def test_no_egress_flag_blocks_remote(self):
        c=config('CLOUD_HPC',remote=True,consent=True)
        self.assertEqual(plan_inference_execution(**c).reason,'REMOTE_EGRESS_NOT_AUTHORIZED')
    def test_offline_remote_request_is_denied(self):
        c=config('OFFLINE',remote=True,consent=True,allow_remote=True)
        self.assertEqual(plan_inference_execution(**c).state,'DENIED_OR_PAUSED')
    def test_malformed_runtime_inventory_fails_closed(self):
        c=config();c["runtimes"]=None
        with self.assertRaisesRegex(PolicyBridgeError,"INVALID_RUNTIME_INVENTORY"):plan_inference_execution(**c)

    def test_invalid_task_category_denied(self):
        c=config();c['workload']=replace(c['workload'],kind=mobile.WorkloadKind.EDGE_DONATION)
        with self.assertRaisesRegex(PolicyBridgeError,'ONLY_INFERENCE_TASKS_SUPPORTED'):plan_inference_execution(**c)

if __name__=='__main__':unittest.main()
