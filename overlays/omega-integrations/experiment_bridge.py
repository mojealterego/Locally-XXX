"""Local-only experiment admission: real Attention planner + HAEE schema + AETHR/OXA signing.

No training, hardware runtime, cloud deployment, automatic model promotion or inference occurs.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import struct
import sys
import tempfile
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
import jsonschema

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT/'modules/attention'))
sys.path.insert(0, str(ROOT/'modules/aethr/src'))
from reference.planner import ConfigError, plan_job
from oxa_ref import archive

SCHEMA=json.loads((ROOT/'modules/haee/schemas/haee.experiment.v1.schema.json').read_text(encoding='utf8'))
VALIDATOR=jsonschema.Draft202012Validator(SCHEMA,format_checker=jsonschema.FormatChecker())
MAX_PLAN_BYTES=64*1024

class ExperimentBridgeError(ValueError):
    """Strict policy or contract violation."""


def _canonical(obj: dict[str,Any])->bytes:
    return json.dumps(obj,ensure_ascii=True,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf-8')


def _digest_plan(plan:dict[str,Any])->str:
    return hashlib.sha256(_canonical({k:v for k,v in plan.items() if k!='plan_sha256'})).hexdigest()


def _verify_plan(plan:object)->dict[str,Any]:
    if not isinstance(plan,dict) or plan.get('status')!='PLAN_ONLY_NOT_TRAINED' or plan.get('artifact_kind')!='experiment_admission_plan':
        raise ExperimentBridgeError('INVALID_PLAN')
    if not isinstance(plan.get('plan_sha256'),str) or plan['plan_sha256']!=_digest_plan(plan):
        raise ExperimentBridgeError('INVALID_PLAN_HASH')
    if len(_canonical(plan))>MAX_PLAN_BYTES:
        raise ExperimentBridgeError('PLAN_TOO_LARGE')
    return plan


def plan_experiment(attention_profile:object, haee_experiment:object, *, principal:str, allow_cloud:bool=False,allow_dataset_egress:bool=False)->dict[str,Any]:
    """Fail closed: validated contracts and explicit egress grant; return only a plan."""
    if not isinstance(haee_experiment,dict):
        raise ExperimentBridgeError('INVALID_HAEE_CONTRACT: object required')
    errors=sorted(VALIDATOR.iter_errors(haee_experiment),key=lambda e:repr(e.path))
    if errors:
        raise ExperimentBridgeError('INVALID_HAEE_CONTRACT: '+errors[0].message[:180])
    tenant=haee_experiment['tenant_id']
    if not isinstance(tenant,str) or not tenant.strip() or tenant!=tenant.strip():
        raise ExperimentBridgeError('INVALID_TENANT')
    if not isinstance(principal,str) or not principal.strip() or tenant!=principal:
        raise ExperimentBridgeError('TENANT_MISMATCH')
    if haee_experiment['max_evaluations'] < haee_experiment['population'] or haee_experiment['max_parallel_evaluations']>haee_experiment['population']:
        raise ExperimentBridgeError('INVALID_EVALUATION_BUDGET')
    try:
        attention=plan_job(attention_profile)
    except (ConfigError,TypeError,ValueError) as e:
        raise ExperimentBridgeError('INVALID_ATTENTION_PROFILE') from e
    if attention['mode'] not in ('training','fine_tune'):
        raise ExperimentBridgeError('TRAINING_REQUIRED')
    run=haee_experiment['run_profile']
    if run=='OFFLINE_ANDROID_ARM64':
        raise ExperimentBridgeError('INCOMPATIBLE_EXECUTION_PROFILE')
    if run=='DESKTOP_LOCAL' and haee_experiment['allow_external_dataset_egress']:
        raise ExperimentBridgeError('DATA_EGRESS_NOT_AUTHORIZED')
    if run=='CLOUD_HPC' and not allow_cloud:
        raise ExperimentBridgeError('CLOUD_CONSENT_REQUIRED')
    if haee_experiment['allow_external_dataset_egress'] and not allow_cloud:
        raise ExperimentBridgeError('CLOUD_CONSENT_REQUIRED')
    if haee_experiment['allow_external_dataset_egress'] and not allow_dataset_egress:
        raise ExperimentBridgeError('DATA_EGRESS_NOT_AUTHORIZED')
    # A HYBRID plan is not an authorization to send data. Neither is CLOUD_HPC by itself.
    plan={
        'schema_version':'1.0.0',
        'artifact_kind':'experiment_admission_plan',
        'status':'PLAN_ONLY_NOT_TRAINED',
        'tenant_id':tenant,
        'experiment_id':haee_experiment['experiment_id'],
        'run_profile':run,
        'approval':'HUMAN_BEFORE_PROMOTION',
        'dataset':dict(haee_experiment['dataset']),
        'seed':haee_experiment['seed'],
        'population':haee_experiment['population'],
        'max_generations':haee_experiment['max_generations'],
        'max_evaluations':haee_experiment['max_evaluations'],
        'max_wall_clock_minutes':haee_experiment['max_wall_clock_minutes'],
        'max_parallel_evaluations':haee_experiment['max_parallel_evaluations'],
        'allowed_operators':list(haee_experiment['allowed_operators']),
        'objectives':list(haee_experiment['objective_ids']),
        'authorization':{'cloud_plan_authorized':bool(allow_cloud),'external_dataset_egress_authorized':bool(allow_cloud and allow_dataset_egress and haee_experiment['allow_external_dataset_egress'])},
        'attention':attention,
        'execution':'NO_EXECUTOR_BOUND',
        'requires':['REAL_HARDWARE_CAPABILITY_PROBE','DATASET_RIGHTS_REVIEW','OPERATOR_APPROVAL','RUNTIME_BUILD_TEST','E2E_TRAINING','NUMERICAL_QUALITY_CHECK'],
    }
    plan['plan_sha256']=_digest_plan(plan)
    return _verify_plan(plan)


def pack_signed_plan(plan:dict[str,Any], destination:Path|str, key:Ed25519PrivateKey)->dict[str,Any]:
    """Create an authenticated OXA1 *data* artifact; never embed a signing key."""
    _verify_plan(plan)
    try:
        with tempfile.TemporaryDirectory(prefix='omega-plan-') as d:
            source=Path(d)/'training-plan.json'
            source.write_bytes(_canonical(plan))
            return archive.pack(destination, {'training-plan.json':source},key,profile='experiment-plan-only')
    except (OSError,ValueError) as e:
        raise ExperimentBridgeError('OXA_PACK_FAILED') from e


def verify_signed_plan(destination:Path|str, trusted_key:Ed25519PublicKey)->dict[str,Any]:
    """Verify signed manifest AND payload with externally provided trust anchor."""
    try:
        manifest=archive.verify(destination,trusted_key)
        entries=manifest['artifacts']
        if manifest['profile']!='experiment-plan-only' or len(entries)!=1 or entries[0]['name']!='training-plan.json' or entries[0]['size']>MAX_PLAN_BYTES:
            raise ExperimentBridgeError('INVALID_OXA_PROFILE')
        with Path(destination).open('rb') as fh:
            fh.seek(4)
            hdr=fh.read(4)
            length=struct.unpack('<I',hdr)[0]
            fh.seek(8+length)
            raw=fh.read(entries[0]['size'])
        obj=json.loads(raw)
        if raw!=_canonical(obj):
            raise ExperimentBridgeError('INVALID_OXA_PAYLOAD_ENCODING')
        return _verify_plan(obj)
    except (OSError, ValueError,TypeError, KeyError, struct.error) as e:
        raise ExperimentBridgeError('INVALID_OXA_SIGNATURE_OR_CONTENT') from e
