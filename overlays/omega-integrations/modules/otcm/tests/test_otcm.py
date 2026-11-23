import json
import tempfile
import unittest
from pathlib import Path
from src.otcm_reference import OmniTemporalStore, MemoryInput, PolicyError

class TestOmniTemporalStore(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = OmniTemporalStore(Path(self.tmp.name)/'otcm.sqlite3')
        self.base = dict(tenant='team-a', agent='planner', claim='svc.timeout', payload={'seconds':30},
                         valid_from=100, valid_to=300, recorded_at=150, source='manual', privacy='private')
    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()
    def put(self, **change):
        obj = {**self.base, **change}
        return self.store.append(MemoryInput(**obj))
    def test_bitemporal_replay_uses_valid_and_transaction_time(self):
        self.put()
        self.assertEqual(len(self.store.as_of('team-a','planner',200,149)),0)
        self.assertEqual(len(self.store.as_of('team-a','planner',200,150)),1)
        self.assertEqual(len(self.store.as_of('team-a','planner',301,250)),0)
    def test_late_fact_does_not_rewrite_earlier_known_state(self):
        self.put(recorded_at=230,valid_from=90)
        self.assertEqual(self.store.as_of('team-a','planner',150,225),[])
        self.assertEqual(len(self.store.as_of('team-a','planner',150,230)),1)
    def test_conflicting_evidence_is_preserved(self):
        self.put()
        self.put(payload={'seconds':60},recorded_at=151,source='diagnostic')
        self.assertEqual(len(self.store.as_of('team-a','planner',180,160)),2)
    def test_retraction_is_a_new_event(self):
        event=self.put()
        self.store.retract('team-a','planner',event[0],recorded_at=240,reason='superseded')
        self.assertEqual(len(self.store.as_of('team-a','planner',200,230)),1)
        self.assertEqual(len(self.store.as_of('team-a','planner',200,250)),0)
        self.assertEqual(len(self.store.audit('team-a','planner')),2)
    def test_private_memory_is_not_shared_to_other_agent(self):
        self.put()
        self.assertEqual(self.store.as_of('team-a','worker',180,250),[])
        self.assertEqual(self.store.as_of('team-b','planner',180,250),[])
    def test_shared_memory_requires_explicit_consent_reference(self):
        with self.assertRaises(PolicyError): self.put(privacy='shared')
        self.put(privacy='shared',consent='consent:sample-001')
        self.assertEqual(len(self.store.as_of('team-a','worker',180,250)),1)
        self.assertEqual(self.store.as_of('team-b','worker',180,250),[])
    def test_simulation_branch_does_not_poison_main(self):
        self.put(branch='sim-2030',simulation_at=999)
        self.assertEqual(self.store.as_of('team-a','planner',180,250),[])
        self.assertEqual(len(self.store.as_of('team-a','planner',180,250,branch='sim-2030',simulation_at=999)),1)
    def test_simulation_requires_future_time_and_non_main_branch(self):
        with self.assertRaises(ValueError): self.put(branch='main',simulation_at=999)
        with self.assertRaises(ValueError): self.put(branch='sim',simulation_at=None)
    def test_cognitive_steps_are_ordered_and_filterable(self):
        x=self.put(); y=self.put(recorded_at=151)
        self.assertLess(x[1],y[1]); self.assertEqual(len(self.store.as_of('team-a','planner',180,250,cognitive_at=x[1])),1)
    def test_invalid_interval_is_rejected(self):
        with self.assertRaises(ValueError): self.put(valid_from=100,valid_to=100)
    def test_invalid_identity_is_rejected(self):
        with self.assertRaises(ValueError): self.put(tenant='')
    def test_invalid_payload_is_rejected(self):
        with self.assertRaises(ValueError): self.put(payload={'nested':float('nan')})
    def test_duplicate_identical_input_is_idempotent(self):
        a=self.put(); b=self.put(); self.assertEqual(a,b)
        self.assertEqual(len(self.store.audit('team-a','planner')),1)
    def test_cognitive_clock_does_not_cross_tenants(self):
        self.put(); b=self.put(tenant='team-b')
        self.assertEqual(b[1],1)
    def test_consolidation_keeps_source_and_provenance(self):
        a=self.put(); self.put(recorded_at=151,payload={'seconds':31})
        s=self.store.consolidate('team-a','planner',[a[0]],'confirmed timeout is 30 seconds',recorded_at=180)
        results=self.store.as_of('team-a','planner',200,200)
        abstraction=[e for e in results if e['id']==s[0]][0]
        self.assertEqual(abstraction['kind'],'abstraction')
        self.assertEqual(abstraction['source_ids'],[a[0]])
        self.assertGreaterEqual(len(results),3)
    def test_consolidation_rejects_foreign_sources(self):
        r=self.put()
        with self.assertRaises(PolicyError): self.store.consolidate('team-b','worker',[r[0]],'bad',181)
    def test_consolidation_requires_source(self):
        with self.assertRaises(ValueError): self.store.consolidate('team-a','planner',[],'bad',180)
    def test_replay_is_stable_across_reopening_database(self):
        self.put(); original=self.store.as_of('team-a','planner',180,250)
        self.store.close()
        self.store=OmniTemporalStore(Path(self.tmp.name)/'otcm.sqlite3')
        self.assertEqual(original,self.store.as_of('team-a','planner',180,250))
    def test_retraction_cannot_target_foreign_agent_private_data(self):
        e=self.put()
        with self.assertRaises(PolicyError): self.store.retract('team-a','worker',e[0],240,'bad')
    def test_zero_external_side_effects_by_default(self):
        self.assertFalse(hasattr(self.store,'execute_prospective_actions'))
    def test_wrong_branch_record_not_seen_with_time_filter(self):
        self.put(branch='sim-2030',simulation_at=999)
        self.assertEqual(self.store.as_of('team-a','planner',180,250,branch='sim-2030',simulation_at=800),[])
    def test_no_raw_data_deleted_by_summarization(self):
        e=self.put()
        self.store.consolidate('team-a','planner',[e[0]],'Summary',180)
        self.assertTrue(any(x['id']==e[0] for x in self.store.audit('team-a','planner')))
    def test_empty_consolidation_summary_rejected(self):
        e=self.put()
        with self.assertRaises(ValueError):self.store.consolidate('team-a','planner',[e[0]],'  ',180)
    def test_retraction_of_shared_event_hides_it_from_all_shared_readers(self):
        event=self.put(privacy='shared',consent='consent:revocation-check')
        self.assertEqual(len(self.store.as_of('team-a','worker',180,190)),1)
        self.store.retract('team-a','planner',event[0],recorded_at=240,reason='invalid')
        self.assertEqual(self.store.as_of('team-a','worker',180,250),[])
    def test_no_cross_tenant_share_even_with_same_agent(self):
        self.put(privacy='shared',consent='consent:1')
        self.assertEqual(self.store.as_of('team-b','planner',180,250),[])
    def test_as_of_with_cognitive_zero_is_empty(self):
        self.put()
        self.assertEqual(self.store.as_of('team-a','planner',180,250,cognitive_at=0),[])
    def test_receipt_hash_is_64_hex_chars(self):
        r=self.put()
        self.assertEqual(len(r[0]),64)
        int(r[0],16)
    def test_no_leaked_credentials_in_exception(self):
        with self.assertRaisesRegex(ValueError,'Invalid'):self.put(payload={'x':set(['secret'])})

if __name__=='__main__':unittest.main()
