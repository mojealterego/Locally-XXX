#!/usr/bin/env python3
"""No-network plan-only demonstration. Ephemeral signing key is a DEMO, not production trust."""
from __future__ import annotations
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from experiment_bridge import plan_experiment,pack_signed_plan,verify_signed_plan

profile=json.loads((ROOT/'modules/attention/examples/hopper_inference.json').read_text())
profile.update(mode='fine_tune',training_strategy='lora')
experiment=json.loads((ROOT/'modules/haee/examples/experiment.json').read_text())
plan=plan_experiment(profile,experiment,principal=experiment['tenant_id'])
with TemporaryDirectory() as temp:
    key=Ed25519PrivateKey.generate()
    target=Path(temp)/'admission.oxa'
    pack_signed_plan(plan,target,key)
    reconstructed=verify_signed_plan(target,key.public_key())
    if reconstructed['plan_sha256']!=plan['plan_sha256']:
        raise SystemExit('Trust check failed')
    print(json.dumps({'status':plan['status'],'experiment_id':plan['experiment_id'],
        'attention':plan['attention']['attention_backend'],
        'plan_sha256':plan['plan_sha256'],'oxa_verified':True,
        'demo_ephemeral_key':True,'training_executed':False,
        'runtime_connected':False},indent=2))
