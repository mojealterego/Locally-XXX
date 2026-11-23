"""Composition of the original Inference Gateway and Mobile Sovereign policy.

Admits only a *plan*, without starting inference, remote services or requesting
permissions. Authenticated grants, principal and telemetry are trusted inputs,
never inferred from untrusted user strings. Python >=3.11, no runtime dependencies.
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import importlib.util
import sys
from typing import Sequence

BASE=Path(__file__).resolve().parent

def _load(alias:str,path:Path):
    spec=importlib.util.spec_from_file_location(alias,str(path))
    if spec is None or spec.loader is None:raise ImportError(alias)
    m=importlib.util.module_from_spec(spec)
    sys.modules[alias]=m
    spec.loader.exec_module(m)
    return m

mobile=_load('omega_mobile_reference_policy',BASE/'modules/mobile/reference/runtime_policy.py')
inference=_load('omega_inference_reference_router',BASE/'modules/inference/reference/inference_router.py')

@dataclass(frozen=True)
class ComputeAdmission:
    state:str
    reason:str
    runtime_id:str|None
    runtime_engine:str|None
    execution_mode:str
    trust_level:str='HOST_REFERENCE_PLAN_ONLY'

class PolicyBridgeError(ValueError):pass


def plan_inference_execution(*, workload,device,mode,grants:Sequence,policy,
                             now:datetime,principal:str,request,runtimes:Sequence)->ComputeAdmission:
    """Compose two independent admission gates. Never auto-upgrade LOCAL to CLOUD."""
    if not isinstance(request,inference.Request):raise PolicyBridgeError('INVALID_INFERENCE_REQUEST')
    request.validate()
    if not isinstance(mode,mobile.RuntimeMode):raise PolicyBridgeError('INVALID_MODE')
    if request.mode.value!=mode.value:raise PolicyBridgeError('MODE_MISMATCH')
    if not isinstance(workload,mobile.Workload) or workload.kind!=mobile.WorkloadKind.INFERENCE:
        raise PolicyBridgeError('ONLY_INFERENCE_TASKS_SUPPORTED')
    if not isinstance(principal,str) or principal!=request.tenant_id:
        raise PolicyBridgeError('TENANT_PRINCIPAL_MISMATCH')
    if not isinstance(runtimes,(list,tuple)) or len(runtimes)>1024 or any(not isinstance(rt,inference.Runtime) for rt in runtimes):
        raise PolicyBridgeError('INVALID_RUNTIME_INVENTORY')
    if request.estimated_peak_mib+request.reserve_mib!=workload.required_ram_mib:
        raise PolicyBridgeError('UNALIGNED_MEMORY_LEASE')
    d=mobile.decide(workload,device,mode,grants,policy,now=now,principal=principal)
    if d.state not in (mobile.State.RUN_LOCAL,mobile.State.RUN_REMOTE):
        return ComputeAdmission('DENIED_OR_PAUSED',d.code.value,None,None,mode.value)
    remote=d.state==mobile.State.RUN_REMOTE
    if remote and request.data_class in ('PRIVATE','RESTRICTED'):
        return ComputeAdmission('DENIED_OR_PAUSED','PRIVATE_REMOTE_BLOCKED',None,None,mode.value)
    if remote and not request.allow_remote_egress:
        return ComputeAdmission('DENIED_OR_PAUSED','REMOTE_EGRESS_NOT_AUTHORIZED',None,None,mode.value)
    if not remote and mode is mobile.RuntimeMode.CLOUD_HPC:
        raise PolicyBridgeError('INVALID_POLICY_ROUTE')
    if not remote and request.allow_remote_egress and mode is mobile.RuntimeMode.OFFLINE:
        raise PolicyBridgeError('OFFLINE_EGRESS_FLAG_FORBIDDEN')
    if remote and mode is mobile.RuntimeMode.OFFLINE:
        raise PolicyBridgeError('REMOTE_IN_OFFLINE')
    # Resource policy decision is authoritative. If it says local, do not silently
    # switch to a remote backend just because the model is unavailable on-device.
    candidates=[r for r in runtimes if (r.deployment in (inference.Deployment.ON_DEVICE,inference.Deployment.DESKTOP_LOCAL))!=remote]
    try: selected=inference.select_runtime(request,candidates)
    except inference.NoEligibleRuntime:
        return ComputeAdmission('DENIED_OR_PAUSED','NO_POLICY_ELIGIBLE_BACKEND',None,None,mode.value)
    return ComputeAdmission('ROUTE_PLAN_ONLY',d.code.value,selected.runtime_id,selected.engine,mode.value)
