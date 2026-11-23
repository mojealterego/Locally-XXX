"""OTCM quad-temporal memory -> ATM contradiction-aware gate -> OmegOS proof obligations.

Reference bridge only: it never executes an action, runs a prover, stores durable
personal data, authorizes live access, or claims mathematical completeness.
"""
from __future__ import annotations
from dataclasses import asdict
from pathlib import Path
import hashlib
import json
import re
import sys
from typing import Any
import importlib.util

BASE=Path(__file__).resolve().parent

def _load(name,path):
    spec=importlib.util.spec_from_file_location(name,str(path))
    if spec is None or spec.loader is None:raise ImportError(name)
    module=importlib.util.module_from_spec(spec)
    sys.modules[name]=module
    spec.loader.exec_module(module)
    return module

otcm=_load('omega_memory_otcm',BASE/'modules/otcm/src/otcm_reference.py')
atm=_load('omega_decision_atm',BASE/'modules/atm/reference_atm/atm.py')

class KnowledgeBridgeError(ValueError):pass

def _require_string(value,code):
    if type(value) is not str or not value.strip() or len(value)>128:
        raise KnowledgeBridgeError(code)
    return value

def _canonical(obj):
    return json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)


def reconcile_as_of(request:dict)->dict:
    """Bounded history reconstruction; proof is always unverified (fail closed)."""
    if type(request) is not dict:raise KnowledgeBridgeError('INVALID_REQUEST')
    if set(request)!={'schema_version','tenant_id','agent_id','events','valid_at','known_at','action'}:
        raise KnowledgeBridgeError('INVALID_REQUEST_FIELDS')
    if request['schema_version']!='omega.knowledge.integration.v1':raise KnowledgeBridgeError('UNSUPPORTED_SCHEMA')
    tenant=_require_string(request['tenant_id'],'INVALID_TENANT')
    agent=_require_string(request['agent_id'],'INVALID_AGENT')
    if re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}',tenant) is None:
        raise KnowledgeBridgeError('INVALID_TENANT')
    if re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}',agent) is None:
        raise KnowledgeBridgeError('INVALID_AGENT')
    events=request['events']
    if type(events) is not list or len(events)>256:raise KnowledgeBridgeError('EVENT_BUDGET')
    if type(request['valid_at']) is not int or type(request['known_at']) is not int:
        raise KnowledgeBridgeError('INVALID_ASOF_TIME')
    action=request['action']
    if type(action) is not dict or set(action)!={'id','sensitivity','tool_name','required_claims','contract_id','source_sha256','utility'}:
        raise KnowledgeBridgeError('INVALID_ACTION')
    claims=action['required_claims']
    if type(claims) is not list or len(claims)>64 or any(type(x) is not str or not x for x in claims):
        raise KnowledgeBridgeError('INVALID_CLAIMS')
    _require_string(action['id'],'INVALID_ACTION_ID')
    _require_string(action['tool_name'],'INVALID_TOOL')
    _require_string(action['contract_id'],'INVALID_CONTRACT')
    if type(action['source_sha256']) is not str or not len(action['source_sha256'])==64 or any(x not in '0123456789abcdef' for x in action['source_sha256']):
        raise KnowledgeBridgeError('INVALID_SOURCE_SHA')
    if type(action['utility']) not in (int,float):raise KnowledgeBridgeError('INVALID_UTILITY')
    # The caller is the security boundary. Raw events are only admitted into a
    # local one-request store scoped to tenant and agent; no sharing is inferred.
    store=otcm.OmniTemporalStore(':memory:')
    try:
        for event in events:
            if type(event) is not dict or set(event)!={'claim','asserts_true','valid_from','valid_to','recorded_at','source'}:
                raise KnowledgeBridgeError('INVALID_EVENT')
            _require_string(event['claim'],'INVALID_CLAIM')
            _require_string(event['source'],'INVALID_SOURCE')
            if type(event['asserts_true']) is not bool:raise KnowledgeBridgeError('INVALID_ASSERTION')
            inp=otcm.MemoryInput(tenant=tenant,agent=agent,claim=event['claim'],
                payload={'asserts_true':event['asserts_true']},valid_from=event['valid_from'],
                valid_to=event['valid_to'],recorded_at=event['recorded_at'],source=event['source'])
            store.append(inp)
        visible=store.as_of(tenant,agent,request['valid_at'],request['known_at'])
    finally:store.close()
    ledger=atm.KnowledgeStore()
    for row in visible:
        if row['valid_from'] > row['recorded_at']:
            raise KnowledgeBridgeError('ATM_FUTURE_VALID_TIME_UNSUPPORTED')
        ledger.add(atm.Evidence(evidence_id=row['id'],claim_id=row['claim'],
            asserts_true=row['payload']['asserts_true'],source_id=row['source'],
            tenant_id=tenant,valid_from=row['valid_from'],recorded_at=row['recorded_at'],valid_to=row['valid_to']))
    truth={claim:ledger.truth(tenant,claim,request['valid_at'],request['known_at']).label for claim in sorted(set(claims))}
    blocked=[claim for claim,value in truth.items() if value!='TRUE_ONLY']
    proposed=atm.ProposedAction(action['id'],tenant,action['sensitivity'],action['tool_name'],
        tuple(claims),action['contract_id'],action['source_sha256'],float(action['utility']))
    # No solver attestation exists. Even if a statement is TRUE_ONLY, the
    # reference engine must not convert that into authorization for a tool call.
    gate=atm.DecisionGate(ledger)
    decision=gate.evaluate(proposed,proof=None,valid_at=request['valid_at'],known_at=request['known_at'],human_approved=False)
    result={'schema_version':'omega.knowledge.reconciliation.v1','tenant_id':tenant,'agent_id':agent,
        'visible_evidence_ids':[row['id'] for row in visible],
        'claim_truth':truth,'conflicted_or_unproven_claims':blocked,
        'action_id':action['id'], 'decision':decision.status,
        'rationale':'UNRESOLVED_CLAIMS' if blocked else decision.rationale,
        'proof_state':'NO_CHECKED_PROOF','action_executed':False,
        'memory_persisted':False,'share_state':'PRIVATE_ONLY'}
    result['manifest_sha256']=hashlib.sha256(_canonical(result).encode()).hexdigest()
    return result


def validate_omegos_obligation(obligation:dict)->dict:
    """Validate a proof request against the imported OmegOS schema, never a proof."""
    if type(obligation) is not dict:raise KnowledgeBridgeError('INVALID_OBLIGATION')
    try:
        from jsonschema import Draft202012Validator
    except ImportError as exc:
        raise KnowledgeBridgeError('JSONSCHEMA_DEPENDENCY_REQUIRED') from exc
    path=BASE/'modules/omegos/schemas/proof_obligation.schema.json'
    schema=json.loads(path.read_text(encoding='utf8'))
    errors=list(Draft202012Validator(schema).iter_errors(obligation))
    if errors:raise KnowledgeBridgeError('INVALID_PROOF_OBLIGATION')
    return {'obligation_id':obligation['obligation_id'],'status':'SCHEMA_VALIDATED_PROVER_NOT_RUN',
            'tenant_id':obligation['tenant_id'],'requested_assurance':obligation['requested_assurance']}
