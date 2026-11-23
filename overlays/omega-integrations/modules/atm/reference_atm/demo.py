"""Run: python reference_atm/demo.py, from package root."""
try:
    from reference_atm.atm import *
except ModuleNotFoundError:
    from atm import *

if __name__=='__main__':
    kb=KnowledgeStore()
    kb.add(Evidence('sensor-1','is_safe',True,'trusted-sensor','tenant-1',1,1))
    kb.add(Evidence('external-2','is_safe',False,'untrusted-external','tenant-1',1,2))
    truth=kb.truth('tenant-1','is_safe',3,3)
    proof=ProofAttestation('safety-contract','source-digest',True,'reference-checker','assumptions-v1')
    action=ProposedAction('act-1','tenant-1','write','update_configuration',('is_safe',),
                          'safety-contract','source-digest',100.0)
    result=DecisionGate(kb).evaluate(action,proof,3,3,True)
    print({'claim_state':truth.label,'decision':result.status,'reason':result.rationale})
    assert result.status=='DEFERRED'
