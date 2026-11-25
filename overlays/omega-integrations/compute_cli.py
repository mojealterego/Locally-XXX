#!/usr/bin/env python3
"""Offline-only local inference admission bridge; no execution, grants, cloud or model loading."""
from __future__ import annotations
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from compute_bridge import mobile, inference, plan_inference_execution

MAX_INPUT = 65536
def require_object(value, keys):
    if type(value) is not dict or set(value) != set(keys):
        raise ValueError('INVALID_COMPUTE_CONTRACT')
    return value

def integer(v, lower, upper):
    if type(v) is not int or not lower <= v <= upper:
        raise ValueError('INVALID_INTEGER')
    return v

def identifier(v):
    if type(v) is not str or not (1 <= len(v) <= 128) or not all(c.isascii() and (c.isalnum() or c in '_-.') for c in v):
        raise ValueError('INVALID_IDENTIFIER')
    return v

def compile_offline_route(body):
    require_object(body, ('schema_version','tenant_id','model_ref','model_format','data_class','capabilities','estimated_peak_mib','reserve_mib','device','runtimes'))
    if body['schema_version'] != 'omega.compute.offline.v1':
        raise ValueError('INVALID_COMPUTE_SCHEMA')
    tenant = identifier(body['tenant_id'])
    model = identifier(body['model_ref'])
    format_ = body['model_format']
    if format_ not in ('GGUF','ONNX','SAFETENSORS'):
        raise ValueError('UNSUPPORTED_FORMAT')
    classification = body['data_class']
    if classification not in ('PUBLIC','INTERNAL','PRIVATE','RESTRICTED'):
        raise ValueError('INVALID_CLASSIFICATION')
    capabilities = body['capabilities']
    if type(capabilities) is not list or not 1 <= len(capabilities) <= 16:
        raise ValueError('INVALID_CAPABILITIES')
    skills=frozenset(identifier(v) for v in capabilities)
    peak=integer(body['estimated_peak_mib'],1,1000000)
    reserve=integer(body['reserve_mib'],0,1000000)
    dev=require_object(body['device'],('total_native_budget_mib','reserved_native_mib','thermal_headroom','battery_percent','charging','unmetered','network_available','foreground'))
    for k in ('total_native_budget_mib','reserved_native_mib','battery_percent'):
        if type(dev[k]) is not int:raise ValueError('INVALID_DEVICE_TELEMETRY')
    for k in ('charging','unmetered','network_available','foreground'):
        if type(dev[k]) is not bool:raise ValueError('INVALID_DEVICE_TELEMETRY')
    if type(dev['thermal_headroom']) not in (int,float):raise ValueError('INVALID_DEVICE_TELEMETRY')
    state=mobile.DeviceState(**dev)
    inventory=body['runtimes']
    if type(inventory) is not list or len(inventory)>32:
        raise ValueError('INVALID_RUNTIME_INVENTORY')
    runtimes=[]
    for x in inventory:
        require_object(x,('runtime_id','engine','deployment','model_ref','model_format','capabilities','memory_headroom_mib','healthy','version_pinned'))
        if x['deployment'] not in ('ON_DEVICE','DESKTOP_LOCAL'):raise ValueError('REMOTE_IN_OFFLINE_INVENTORY')
        if type(x['healthy']) is not bool or type(x['version_pinned']) is not bool:raise ValueError('INVALID_RUNTIME_METADATA')
        if type(x['capabilities']) is not list or len(x['capabilities'])>32:raise ValueError('INVALID_RUNTIME_METADATA')
        runtimes.append(inference.Runtime(
            runtime_id=identifier(x['runtime_id']),engine=identifier(x['engine']),
            deployment=inference.Deployment(x['deployment']),model_ref=identifier(x['model_ref']),model_format=x['model_format'],
            capabilities=frozenset(identifier(v) for v in x['capabilities']),allowed_data_classes=frozenset((classification,)),
            tenants=frozenset((tenant,)),memory_headroom_mib=integer(x['memory_headroom_mib'],0,1000000),
            healthy=x['healthy'],version_pinned=x['version_pinned']
        ))
    request=inference.Request(tenant,inference.ExecutionMode.OFFLINE,classification,model,format_,skills,peak,reserve,False)
    workload=mobile.Workload('offline-local-plan',mobile.WorkloadKind.INFERENCE,peak+reserve,60,0.0,False)
    decision=plan_inference_execution(workload=workload,device=state,mode=mobile.RuntimeMode.OFFLINE,grants=[],
                                      policy=mobile.ControlPolicy(approved_cloud_usd=0.0,egress_enabled=False),
                                      now=datetime(2026,1,1,tzinfo=timezone.utc),principal=tenant,request=request,runtimes=runtimes)
    out=asdict(decision)
    if out['state'] not in ('ROUTE_PLAN_ONLY','DENIED_OR_PAUSED') or out['execution_mode']!='OFFLINE':
        raise ValueError('INVALID_POLICY_RESULT')
    return {'schema_version':'omega.compute.offline.result.v1',**out,'runtime_executed':False,'cloud_egress':False,'telemetry_verified':False,'inventory_verified':False}

def main():
    try:
        raw=sys.stdin.buffer.read(MAX_INPUT+1)
        if len(raw)>MAX_INPUT:raise ValueError('INPUT_TOO_LARGE')
        result=compile_offline_route(json.loads(raw))
        print(json.dumps(result,allow_nan=False,ensure_ascii=False,separators=(',',':')))
        return 0
    except (ValueError,TypeError,KeyError,OverflowError):
        print('COMPUTE_POLICY_REJECTED',file=sys.stderr)
        return 2

if __name__=='__main__':
    raise SystemExit(main())
