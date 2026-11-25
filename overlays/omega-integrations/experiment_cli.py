#!/usr/bin/env python3
"""Attention/HAEE experiment planning gateway. No training, cloud consent, or signing key accepted."""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from experiment_bridge import plan_experiment, ExperimentBridgeError

MAX_INPUT=65536

def compile_local_plan(request):
    if type(request) is not dict or set(request)!=set(('attention_profile','haee_experiment')):
        raise ValueError('INVALID_EXPERIMENT_INPUT')
    experiment=request['haee_experiment']
    if type(experiment) is not dict:
        raise ValueError('INVALID_EXPERIMENT_CONTRACT')
    principal=experiment.get('tenant_id')
    if type(principal) is not str or not principal:
        raise ValueError('INVALID_EXPERIMENT_TENANT')
    result=plan_experiment(request['attention_profile'],experiment,
                           principal=principal,allow_cloud=False,allow_dataset_egress=False)
    if (result.get('status')!='PLAN_ONLY_NOT_TRAINED' or result.get('execution')!='NO_EXECUTOR_BOUND' or
        result.get('authorization',{}).get('cloud_plan_authorized') is not False or
        result.get('authorization',{}).get('external_dataset_egress_authorized') is not False):
        raise ValueError('INVALID_EXPERIMENT_RESULT')
    return result

def main():
    try:
        source=sys.stdin.buffer.read(MAX_INPUT+1)
        if len(source)>MAX_INPUT:raise ValueError('INPUT_TOO_LARGE')
        data=json.loads(source)
        result=compile_local_plan(data)
        print(json.dumps(result,ensure_ascii=False,allow_nan=False,separators=(',',':')))
        return 0
    except (ExperimentBridgeError,ValueError,TypeError,KeyError,OverflowError):
        print('EXPERIMENT_ADMISSION_REJECTED',file=sys.stderr)
        return 2

if __name__=='__main__':raise SystemExit(main())
