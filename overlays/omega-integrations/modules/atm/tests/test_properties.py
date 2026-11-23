import random
import unittest
from reference_atm.atm import (BelnapTruth, Evidence, KnowledgeStore, StepBudget, BudgetExceeded,
                                DecisionGate, ProposedAction, ProofAttestation,
                                select_best_action, DirectedAcyclicGraph, NotIdentifiable)


class PropertyAndBoundaryTests(unittest.TestCase):
    def test_all_four_valued_combinations_commutative_idempotent(self):
        vals=[BelnapTruth(a,b) for a in (False, True) for b in (False, True)]
        for a in vals:
            self.assertEqual(a.conjunction(a),a)
            self.assertEqual(a.disjunction(a),a)
            self.assertEqual(a.negate().negate(),a)
            for b in vals:
                self.assertEqual(a.conjunction(b),b.conjunction(a))
                self.assertEqual(a.disjunction(b),b.disjunction(a))
                self.assertEqual(a.conjunction(b).negate(),a.negate().disjunction(b.negate()))
                self.assertEqual(a.disjunction(b).negate(),a.negate().conjunction(b.negate()))

    def test_replay_is_insertion_order_independent_for_distinct_evidence(self):
        data=[Evidence(f'e{i}', 'claim', i%2==0,f's{i}','tenant',0,i) for i in range(30)]
        baseline=KnowledgeStore()
        for e in data:baseline.add(e)
        baseline_states=[baseline.truth('tenant','claim',0,t) for t in range(30)]
        for seed in (101,202,303,404,20261121):
            seq=data[:]
            random.Random(seed).shuffle(seq)
            kb=KnowledgeStore()
            for ev in seq:kb.add(ev)
            self.assertEqual([kb.truth('tenant','claim',0,t) for t in range(30)],baseline_states)

    def test_zero_private_data_leak_between_many_tenants(self):
        kb=KnowledgeStore()
        for t in range(20):
            kb.add(Evidence(f'e{t}','private-claim',True,f's{t}',f'tenant-{t}',0,0))
        for t in range(20):
            self.assertEqual(len(kb.get_evidence(f'tenant-{t}','private-claim',1,1)),1)
        self.assertEqual(kb.truth('tenant-other','private-claim',1,1).label,'NEITHER')

    def test_higher_utility_cannot_override_policy(self):
        kb=KnowledgeStore();kb.add(Evidence('ok','safe',True,'trusted','tenant',0,0))
        proof=ProofAttestation('contract','digest',True,'checker','v1')
        rng=random.Random(20261121)
        for _ in range(100):
            high=rng.randint(2,100000)
            candidates=[ProposedAction('unsafe','tenant','secret','sign',('safe',),'contract','digest',float(high)),
                        ProposedAction('safe','tenant','read','inspect',('safe',),'contract','digest',1.0)]
            choice=select_best_action(candidates,DecisionGate(kb),proof,1,1,False,StepBudget(3))
            self.assertEqual(choice.action_id,'safe')

    def test_confounded_collider_not_adjusted_automatically(self):
        # X -> Z <- Y; conditioning on Z would open a spurious path.
        dag=DirectedAcyclicGraph({'X':(), 'Y':(), 'Z':('X','Y')})
        self.assertTrue(dag.valid_backdoor_set('X','Y',()))
        self.assertFalse(dag.valid_backdoor_set('X','Y',('Z',)))

    def test_budget_is_not_resettable_by_consumer(self):
        budget=StepBudget(1)
        budget.consume()
        for _ in range(10):
            with self.assertRaises(BudgetExceeded):budget.consume()
        self.assertEqual(budget.used,1)


if __name__=='__main__':unittest.main()
