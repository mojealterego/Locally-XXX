import unittest
from reference_atm.atm import (
    Evidence, KnowledgeStore, BelnapTruth, StepBudget, BudgetExceeded,
    ProposedAction, DecisionGate, ProofAttestation, ClaimRequirement,
    DirectedAcyclicGraph, estimate_binary_backdoor_ate,
    NotIdentifiable, select_best_action, consolidate_memory,
)


class TruthLatticeTests(unittest.TestCase):
    def test_true_false_both_neither_are_distinct(self):
        self.assertEqual(BelnapTruth(True, False).label, 'TRUE_ONLY')
        self.assertEqual(BelnapTruth(False, True).label, 'FALSE_ONLY')
        self.assertEqual(BelnapTruth(True, True).label, 'BOTH')
        self.assertEqual(BelnapTruth(False, False).label, 'NEITHER')

    def test_negation_and_conjunction(self):
        self.assertEqual(BelnapTruth(True, False).negate(), BelnapTruth(False, True))
        self.assertEqual(BelnapTruth(True, True).conjunction(BelnapTruth(True, False)), BelnapTruth(True, True))

    def test_contradiction_does_not_prove_unrelated_claim(self):
        kb = KnowledgeStore()
        kb.add(Evidence('e1', 'door_open', True, 'sensor-a', 'tenant-a', 10, 10))
        kb.add(Evidence('e2', 'door_open', False, 'sensor-b', 'tenant-a', 10, 11))
        self.assertEqual(kb.truth('tenant-a', 'door_open', 12, 12).label, 'BOTH')
        self.assertEqual(kb.truth('tenant-a', 'alarm_disabled', 12, 12).label, 'NEITHER')


class KnowledgeTests(unittest.TestCase):
    def test_bitemporal_as_known_then_vs_now(self):
        kb = KnowledgeStore()
        kb.add(Evidence('x1', 'gate_safe', True, 'audit-old', 't', 100, 110))
        kb.add(Evidence('x2', 'gate_safe', False, 'audit-new', 't', 100, 210))
        self.assertEqual(kb.truth('t', 'gate_safe', 150, 150).label, 'TRUE_ONLY')
        self.assertEqual(kb.truth('t', 'gate_safe', 150, 220).label, 'BOTH')

    def test_cross_tenant_isolation(self):
        kb = KnowledgeStore()
        kb.add(Evidence('x1', 'p', True, 's', 'a', 1, 1))
        self.assertEqual(kb.truth('b', 'p', 10, 10).label, 'NEITHER')

    def test_duplicate_id_rejected_without_data_loss(self):
        kb = KnowledgeStore()
        kb.add(Evidence('e', 'p', True, 's', 'a', 1, 1))
        with self.assertRaises(ValueError):
            kb.add(Evidence('e', 'q', False, 's', 'b', 1, 1))
        self.assertEqual(kb.truth('a', 'p', 2, 2).label, 'TRUE_ONLY')

    def test_invalid_temporal_order_fails_closed(self):
        with self.assertRaises(ValueError):
            Evidence('e','p',True,'s','a', 100, 99)

    def test_revocation_is_visible_only_after_revocation_time(self):
        kb = KnowledgeStore()
        kb.add(Evidence('x', 'p', True, 's', 't', 1, 1))
        kb.revoke('x', 20)
        self.assertEqual(kb.truth('t', 'p', 15, 15).label, 'TRUE_ONLY')
        self.assertEqual(kb.truth('t', 'p', 30, 30).label, 'NEITHER')


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.kb=KnowledgeStore()
        self.kb.add(Evidence('s1','verified_source',True,'local-attestation','t',1,1))
        self.gate=DecisionGate(self.kb)
        self.proof=ProofAttestation('contract-1','digest-1',True,'checker-local','assumptions-v1')

    def test_read_only_with_checked_proof_and_supported_fact(self):
        p=ProposedAction('a1','t','read','read_project',('verified_source',),'contract-1','digest-1',0.75)
        self.assertEqual(self.gate.evaluate(p,self.proof,2,2,False).status,'APPROVED')

    def test_write_requires_human_approval(self):
        p=ProposedAction('a1','t','write','modify_repo',('verified_source',),'contract-1','digest-1',0.75)
        self.assertEqual(self.gate.evaluate(p,self.proof,2,2,False).status,'DEFERRED')
        self.assertEqual(self.gate.evaluate(p,self.proof,2,2,True).status,'APPROVED')

    def test_no_laundering_of_untrusted_contradictory_claim(self):
        self.kb.add(Evidence('s2','verified_source',False,'web-page','t',1,2))
        p=ProposedAction('a1','t','read','read_project',('verified_source',),'contract-1','digest-1',1.0)
        self.assertEqual(self.gate.evaluate(p,self.proof,3,3,True).status,'DEFERRED')

    def test_false_or_unknown_is_not_approval(self):
        p=ProposedAction('a1','t','read','read_project',('unknown_fact',),'contract-1','digest-1',1.0)
        self.assertEqual(self.gate.evaluate(p,self.proof,3,3,True).status,'DEFERRED')

    def test_forged_proof_is_rejected(self):
        p=ProposedAction('a1','t','read','read_project',('verified_source',),'contract-1','digest-1',1.0)
        self.assertEqual(self.gate.evaluate(p,ProofAttestation('contract-1','wrong',True,'checker-local','v1'),3,3,True).status,'REJECTED')
        self.assertEqual(self.gate.evaluate(p,None,3,3,True).status,'DEFERRED')

    def test_cross_tenant_proof_does_not_override_isolation(self):
        p=ProposedAction('a1','other','read','read_project',('verified_source',),'contract-1','digest-1',1.0)
        self.assertEqual(self.gate.evaluate(p,self.proof,3,3,True).status,'DEFERRED')

    def test_secret_requires_explicit_approval_even_with_proof(self):
        p=ProposedAction('a1','t','secret','sign_artifact',('verified_source',),'contract-1','digest-1',1.0)
        self.assertEqual(self.gate.evaluate(p,self.proof,3,3,False).status,'DEFERRED')

    def test_unknown_effect_action_kind_rejected(self):
        p=ProposedAction('a1','t','unknown-kind','shell',('verified_source',),'contract-1','digest-1',1.0)
        self.assertEqual(self.gate.evaluate(p,self.proof,3,3,True).status,'REJECTED')


class BudgetTests(unittest.TestCase):
    def test_iteration_budget_cannot_be_exceeded(self):
        budget=StepBudget(2)
        budget.consume();budget.consume()
        with self.assertRaises(BudgetExceeded): budget.consume()

    def test_zero_or_negative_budget_rejected(self):
        with self.assertRaises(ValueError): StepBudget(0)

    def test_budget_exhaustion_does_not_force_unverified_action(self):
        kb=KnowledgeStore()
        p=ProposedAction('a','t','write','modify',('unproven',),'c','d',0.9)
        out=select_best_action([p],DecisionGate(kb),None,1,1,False,StepBudget(1))
        self.assertEqual(out.status,'DEFERRED')


class CausalTests(unittest.TestCase):
    def test_adjustment_blocks_backdoor_and_estimates_effect(self):
        dag=DirectedAcyclicGraph({'Z':(), 'X':('Z',), 'Y':('X','Z')})
        records=[]
        # Each stratum has a treatment/outcome contrast of +1, with different baselines.
        for z in (0,1):
            for x in (0,1):
                for _ in range(4):
                    records.append({'Z':z,'X':x,'Y':float(x + 2*z)})
        self.assertAlmostEqual(estimate_binary_backdoor_ate(dag, records,'X','Y',('Z',)),1.0)

    def test_missing_confounder_is_not_identifiable(self):
        dag=DirectedAcyclicGraph({'Z':(), 'X':('Z',), 'Y':('X','Z')})
        with self.assertRaises(NotIdentifiable):
            estimate_binary_backdoor_ate(dag,[{'X':0,'Y':0},{'X':1,'Y':1}],'X','Y',())

    def test_positivity_failure_is_rejected(self):
        dag=DirectedAcyclicGraph({'Z':(), 'X':('Z',), 'Y':('X','Z')})
        data=[{'Z':0,'X':0,'Y':0.},{'Z':0,'X':1,'Y':1.}, {'Z':1,'X':1,'Y':3.}]
        with self.assertRaises(NotIdentifiable):
            estimate_binary_backdoor_ate(dag,data,'X','Y',('Z',))

    def test_cyclic_graph_is_rejected(self):
        with self.assertRaises(ValueError): DirectedAcyclicGraph({'A':('B',),'B':('A',)})

    def test_cannot_adjust_for_exposure_descendant(self):
        dag=DirectedAcyclicGraph({'X':(),'Z':('X',),'Y':('Z',)})
        with self.assertRaises(NotIdentifiable):
            estimate_binary_backdoor_ate(dag,[],'X','Y',('Z',))


class ConsolidationAndSelectionTests(unittest.TestCase):
    def test_consolidation_keeps_conflicting_evidence(self):
        evidence=[Evidence('e1','c',True,'s1','t',1,1),Evidence('e2','c',False,'s2','t',1,1)]
        summary=consolidate_memory(evidence)
        self.assertEqual(summary['c']['positive_count'],1)
        self.assertEqual(summary['c']['negative_count'],1)
        self.assertTrue(summary['c']['has_conflict'])

    def test_selector_never_chooses_unapproved_high_score(self):
        kb=KnowledgeStore();kb.add(Evidence('e','c',True,'s','t',1,1))
        proof=ProofAttestation('r','d',True,'checker','v1')
        actions=[ProposedAction('high','t','write','change',('c',),'r','d',100.0),ProposedAction('low','t','read','inspect',('c',),'r','d',1.0)]
        result=select_best_action(actions,DecisionGate(kb),proof,2,2,False,StepBudget(4))
        self.assertEqual(result.status,'APPROVED')
        self.assertEqual(result.action_id,'low')

    def test_selector_is_deterministic_for_ties(self):
        kb=KnowledgeStore();kb.add(Evidence('e','c',True,'s','t',1,1))
        proof=ProofAttestation('r','d',True,'checker','v1')
        actions=[ProposedAction('b','t','read','inspect',('c',),'r','d',1.0),ProposedAction('a','t','read','inspect',('c',),'r','d',1.0)]
        result=select_best_action(actions,DecisionGate(kb),proof,2,2,False,StepBudget(5))
        self.assertEqual(result.action_id,'a')


if __name__ == '__main__':
    unittest.main()
