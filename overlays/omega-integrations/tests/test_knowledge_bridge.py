from __future__ import annotations
from copy import deepcopy
from pathlib import Path
import json
import sys
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from knowledge_bridge import reconcile_as_of,validate_omegos_obligation,KnowledgeBridgeError

def request():
    return {'schema_version':'omega.knowledge.integration.v1','tenant_id':'team-one','agent_id':'agent-1',
            'events':[{'claim':'permission-safe','asserts_true':True,'valid_from':5,'valid_to':1000,'recorded_at':10,'source':'signed-log'}],
            'valid_at':20,'known_at':20,
            'action':{'id':'action-1','sensitivity':'write','tool_name':'deploy','required_claims':['permission-safe'],
                      'contract_id':'contract-1','source_sha256':'a'*64,'utility':1.0}}

class KnowledgeBridgeTests(unittest.TestCase):
    def test_truth_does_not_authorize_tool_without_checked_proof(self):
        x=request();r=reconcile_as_of(x)
        self.assertEqual(r['claim_truth']['permission-safe'],'TRUE_ONLY')
        self.assertEqual(r['decision'],'DEFERRED')
        self.assertFalse(r['action_executed'])
        self.assertFalse(r['memory_persisted'])
    def test_conflict_kept_not_exploded(self):
        x=request();x['events'].append(dict(x['events'][0],asserts_true=False,source='other'))
        r=reconcile_as_of(x);self.assertEqual(r['claim_truth']['permission-safe'],'BOTH')
        self.assertEqual(r['rationale'],'UNRESOLVED_CLAIMS')
    def test_unknown_claim_remains_neither(self):
        x=request();x['action']['required_claims']=['unknown']
        self.assertEqual(reconcile_as_of(x)['claim_truth']['unknown'],'NEITHER')
    def test_temporal_visibility_respects_transaction_time(self):
        x=request();x['known_at']=5
        self.assertEqual(reconcile_as_of(x)['claim_truth']['permission-safe'],'NEITHER')
    def test_valid_time_respects_event_scope(self):
        x=request();x['valid_at']=2000
        self.assertEqual(reconcile_as_of(x)['claim_truth']['permission-safe'],'NEITHER')
    def test_no_cross_tenant_input_field(self):
        x=request();x['events'][0]['tenant_id']='foreign'
        with self.assertRaisesRegex(KnowledgeBridgeError,'INVALID_EVENT'):reconcile_as_of(x)
    def test_no_shared_memory_inference(self):
        r=reconcile_as_of(request());self.assertEqual(r['share_state'],'PRIVATE_ONLY')
    def test_invalid_timestamp_is_rejected(self):
        x=request();x['events'][0]['valid_from']=True
        with self.assertRaises(ValueError):reconcile_as_of(x)
    def test_tenant_with_whitespace_denied_before_storage(self):
        x=request();x["tenant_id"]="team one"
        with self.assertRaisesRegex(KnowledgeBridgeError,"INVALID_TENANT"):reconcile_as_of(x)

    def test_event_budget_enforced(self):
        x=request();x['events']=x['events']*257
        with self.assertRaisesRegex(KnowledgeBridgeError,'EVENT_BUDGET'):reconcile_as_of(x)
    def test_stable_digest_order_with_identical_input(self):
        x=request();self.assertEqual(reconcile_as_of(x)['manifest_sha256'],reconcile_as_of(deepcopy(x))['manifest_sha256'])
    def test_future_dated_claim_cannot_silently_change_atm_semantics(self):
        x=request();x["events"][0]["valid_from"]=100;x["valid_at"]=100;x["known_at"]=100
        with self.assertRaisesRegex(KnowledgeBridgeError,"ATM_FUTURE_VALID_TIME_UNSUPPORTED"):reconcile_as_of(x)

    def test_prover_obligation_validated_but_not_executed(self):
        proof=json.loads((ROOT/'modules/omegos/examples/proof_obligation.example.json').read_text())
        r=validate_omegos_obligation(proof)
        self.assertEqual(r['status'],'SCHEMA_VALIDATED_PROVER_NOT_RUN')
    def test_invalid_prover_obligation_denied(self):
        proof=json.loads((ROOT/'modules/omegos/examples/proof_obligation.example.json').read_text())
        proof['toolchain_lock_sha256']='bad'
        with self.assertRaisesRegex(KnowledgeBridgeError,'INVALID_PROOF_OBLIGATION'):validate_omegos_obligation(proof)

if __name__=='__main__':unittest.main()
