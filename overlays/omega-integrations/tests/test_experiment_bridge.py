"""Host contract tests for Attention/PEFT -> HAEE -> signed AETHR/OXA plan."""
from __future__ import annotations
import copy
import json
from pathlib import Path
import tempfile
import unittest
import sys
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from experiment_bridge import ExperimentBridgeError, plan_experiment, pack_signed_plan, verify_signed_plan

PROFILE=json.loads((ROOT/'modules/attention/examples/hopper_inference.json').read_text())
EXPERIMENT=json.loads((ROOT/'modules/haee/examples/experiment.json').read_text())

class ExperimentBridgeTests(unittest.TestCase):
    def setUp(self):
        self.profile=copy.deepcopy(PROFILE)
        self.profile.update(mode='fine_tune',training_strategy='lora')
        self.exp=copy.deepcopy(EXPERIMENT)
    def plan(self,**kwargs):
        return plan_experiment(self.profile,self.exp,principal='team-studio',**kwargs)
    def test_valid_haee_plan_remains_non_executable(self):
        p=self.plan()
        self.assertEqual(p['status'],'PLAN_ONLY_NOT_TRAINED')
        self.assertEqual(p['tenant_id'],'team-studio')
        self.assertEqual(p['attention']['training_strategy'],'lora')
        self.assertTrue(p['attention']['runtime_capability_probe_required'])
        self.assertEqual(p['approval'],'HUMAN_BEFORE_PROMOTION')
    def test_wrong_tenant_fails_closed(self):
        with self.assertRaisesRegex(ExperimentBridgeError,'TENANT_MISMATCH'):
            plan_experiment(self.profile,self.exp,principal='outsider')
    def test_empty_tenant_denied(self):
        self.exp['tenant_id']='   '
        with self.assertRaisesRegex(ExperimentBridgeError,'INVALID_TENANT'):
            self.plan()
    def test_extra_schema_field_denied(self):
        self.exp['untrusted']='x'
        with self.assertRaisesRegex(ExperimentBridgeError,'INVALID_HAEE_CONTRACT'):
            self.plan()
    def test_attention_invalid_gpu_guard(self):
        self.profile['gpu_count']=0
        with self.assertRaisesRegex(ExperimentBridgeError,'INVALID_ATTENTION_PROFILE'):
            self.plan()
    def test_inference_profile_cannot_start_evolution(self):
        self.profile['mode']='inference';self.profile['training_strategy']='none'
        with self.assertRaisesRegex(ExperimentBridgeError,'TRAINING_REQUIRED'):
            self.plan()
    def test_offline_android_training_denied(self):
        self.exp['run_profile']='OFFLINE_ANDROID_ARM64'
        with self.assertRaisesRegex(ExperimentBridgeError,'INCOMPATIBLE_EXECUTION_PROFILE'):
            self.plan()
    def test_hybrid_requires_explicit_cloud_consent_if_egress(self):
        self.exp['allow_external_dataset_egress']=True
        with self.assertRaisesRegex(ExperimentBridgeError,'CLOUD_CONSENT_REQUIRED'):
            self.plan()
    def test_hybrid_egress_requires_approved_data_policy(self):
        self.exp['allow_external_dataset_egress']=True
        with self.assertRaisesRegex(ExperimentBridgeError,'DATA_EGRESS_NOT_AUTHORIZED'):
            self.plan(allow_cloud=True)
    def test_cloud_egress_with_permission_can_plan(self):
        self.exp.update(run_profile='CLOUD_HPC',allow_external_dataset_egress=True)
        self.assertEqual(self.plan(allow_cloud=True,allow_dataset_egress=True)['status'],'PLAN_ONLY_NOT_TRAINED')
    def test_remote_hpc_requires_cloud_authorization_even_without_dataset_egress(self):
        self.exp['run_profile']='CLOUD_HPC'
        with self.assertRaisesRegex(ExperimentBridgeError,'CLOUD_CONSENT_REQUIRED'):
            self.plan()
    def test_insufficient_eval_budget_fails(self):
        self.exp['max_evaluations']=10
        with self.assertRaisesRegex(ExperimentBridgeError,'INVALID_EVALUATION_BUDGET'):
            self.plan()
    def test_local_egress_forbidden_even_with_remote_consent(self):
        self.exp['run_profile']='DESKTOP_LOCAL'
        self.exp['allow_external_dataset_egress']=True
        with self.assertRaisesRegex(ExperimentBridgeError,'DATA_EGRESS_NOT_AUTHORIZED'):
            self.plan(allow_cloud=True, allow_dataset_egress=True)
    def test_signed_oxa_round_trip_with_external_trust_anchor(self):
        p=self.plan();key=Ed25519PrivateKey.generate()
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/'plan.oxa'
            manifest=pack_signed_plan(p,target,key)
            self.assertEqual(manifest['format'],'oxa.v1')
            recovered=verify_signed_plan(target,key.public_key())
            self.assertEqual(recovered['plan_sha256'],p['plan_sha256'])
            self.assertEqual(recovered['status'],'PLAN_ONLY_NOT_TRAINED')
    def test_invalid_signature_is_denied(self):
        p=self.plan();key=Ed25519PrivateKey.generate();wrong=Ed25519PrivateKey.generate()
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/'plan.oxa';pack_signed_plan(p,target,key)
            with self.assertRaisesRegex(ExperimentBridgeError,'INVALID_OXA_SIGNATURE_OR_CONTENT'):
                verify_signed_plan(target,wrong.public_key())
    def test_modified_signed_payload_is_denied(self):
        p=self.plan();key=Ed25519PrivateKey.generate()
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/'plan.oxa';pack_signed_plan(p,target,key)
            raw=bytearray(target.read_bytes());raw[-65]^=1;target.write_bytes(raw)
            with self.assertRaisesRegex(ExperimentBridgeError,'INVALID_OXA_SIGNATURE_OR_CONTENT'):
                verify_signed_plan(target,key.public_key())
    def test_opaque_untrusted_plan_rejected(self):
        key=Ed25519PrivateKey.generate()
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ExperimentBridgeError,'INVALID_PLAN'):
                pack_signed_plan({'status':'EXECUTED'},Path(tmp)/'plan.oxa',key)
    def test_repeatable_plan_hash(self):
        self.assertEqual(self.plan()['plan_sha256'],self.plan()['plan_sha256'])
    def test_no_evolution_promotion_without_explicit_approval(self):
        self.exp['approval_policy']='AUTO_PROMOTION'
        with self.assertRaisesRegex(ExperimentBridgeError,'INVALID_HAEE_CONTRACT'):
            self.plan()
    def test_haee_unsupported_type_rejected(self):
        with self.assertRaisesRegex(ExperimentBridgeError,'INVALID_HAEE_CONTRACT'):
            plan_experiment(self.profile,[],principal='team-studio')

if __name__=='__main__':unittest.main()
