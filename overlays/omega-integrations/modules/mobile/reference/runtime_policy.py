"""Deterministic reference policy. No network, Android privileges or workers.
A caller must verify and cryptographically authenticate grants before invoking this.
"""
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from math import isfinite
from typing import Sequence

class RuntimeMode(str, Enum):
    OFFLINE='OFFLINE'
    HYBRID='HYBRID'
    CLOUD_HPC='CLOUD_HPC'
class WorkloadKind(str, Enum):
    INFERENCE='INFERENCE'
    TRAINING='TRAINING'
    CODE_BUILD='CODE_BUILD'
    EDGE_DONATION='EDGE_DONATION'
    HIDDEN_RESOURCE='HIDDEN_RESOURCE'
    POLICY_EVASION='POLICY_EVASION'
    AUTONOMOUS_FINANCE='AUTONOMOUS_FINANCE'
class State(str, Enum):
    RUN_LOCAL='RUN_LOCAL'
    RUN_REMOTE='RUN_REMOTE'
    PAUSE='PAUSE'
    DENY='DENY'
class Code(str, Enum):
    OK='OK'
    INVALID_INPUT='INVALID_INPUT'
    BLOCKED_ACTIVITY='BLOCKED_ACTIVITY'
    OFFLINE_NO_EGRESS='OFFLINE_NO_EGRESS'
    INSUFFICIENT_NATIVE_MEMORY='INSUFFICIENT_NATIVE_MEMORY'
    CONSENT_REQUIRED='CONSENT_REQUIRED'
    NETWORK_UNAVAILABLE='NETWORK_UNAVAILABLE'
    THERMAL_GUARD='THERMAL_GUARD'
    BATTERY_GUARD='BATTERY_GUARD'
    FOREGROUND_REQUIRED='FOREGROUND_REQUIRED'
    RESOURCE_DONATION_GUARD='RESOURCE_DONATION_GUARD'
    BUDGET_NOT_APPROVED='BUDGET_NOT_APPROVED'
    EGRESS_DISABLED='EGRESS_DISABLED'
@dataclass(frozen=True)
class Workload:
    workload_id:str
    kind:WorkloadKind
    required_ram_mib:int
    duration_sec:int
    estimated_cloud_cost_usd:float
    preferred_remote:bool
@dataclass(frozen=True)
class DeviceState:
    total_native_budget_mib:int
    reserved_native_mib:int
    thermal_headroom:float  # 1.0 means severe threshold, not free percentage
    battery_percent:int
    charging:bool
    unmetered:bool
    network_available:bool
    foreground:bool
@dataclass(frozen=True)
class Grant:
    subject:str
    scope:str
    issued_at:datetime
    expires_at:datetime
    revoked:bool
@dataclass(frozen=True)
class ControlPolicy:
    approved_cloud_usd:float=0.0
    egress_enabled:bool=True
    low_battery_pct:int=15
    pause_thermal_at:float=0.85
@dataclass(frozen=True)
class Decision:
    state:State
    code:Code
    reason:str

def response(state:State, code:Code, reason:str)->Decision:
    return Decision(state,code,reason)

def authorized(grants:Sequence[Grant],scope:str,principal:str,now:datetime)->bool:
    return any(isinstance(g,Grant) and g.scope==scope and g.subject==principal and
               not g.revoked and g.issued_at<=now<g.expires_at for g in grants)

def decide(workload:Workload, device:DeviceState, mode:RuntimeMode,
           grants:Sequence[Grant], policy:ControlPolicy, *, now:datetime,
           principal:str)->Decision:
    bad=response(State.DENY,Code.INVALID_INPUT,'Malformed input')
    if not (isinstance(workload,Workload) and isinstance(device,DeviceState) and
            isinstance(mode,RuntimeMode) and isinstance(policy,ControlPolicy) and
            isinstance(now,datetime) and isinstance(principal,str)):
        return bad
    if now.tzinfo is None or not 1<=len(principal)<=128:
        return bad
    if any(not isinstance(g,Grant) or g.issued_at.tzinfo is None or g.expires_at.tzinfo is None for g in grants):
        return bad
    if not isinstance(workload.kind,WorkloadKind) or not isinstance(workload.workload_id,str) or not 1<=len(workload.workload_id)<=128:
        return bad
    if type(workload.required_ram_mib) is not int or not 1<=workload.required_ram_mib<=1_000_000:
        return bad
    if type(workload.duration_sec) is not int or not 1<=workload.duration_sec<=86400:
        return bad
    if not isinstance(workload.preferred_remote,bool) or not isinstance(workload.estimated_cloud_cost_usd,(int,float)):
        return bad
    if not isfinite(workload.estimated_cloud_cost_usd) or workload.estimated_cloud_cost_usd<0:
        return bad
    if not (type(device.total_native_budget_mib) is int and type(device.reserved_native_mib) is int and
            device.total_native_budget_mib>=512 and 0<=device.reserved_native_mib<=device.total_native_budget_mib and
            type(device.battery_percent) is int and 0<=device.battery_percent<=100 and
            isinstance(device.thermal_headroom,(float,int)) and isfinite(device.thermal_headroom) and device.thermal_headroom>=0 and
            all(isinstance(v,bool) for v in (device.charging,device.unmetered,device.network_available,device.foreground))):
        return bad
    if not (isfinite(policy.approved_cloud_usd) and policy.approved_cloud_usd>=0 and
            1<=policy.low_battery_pct<=50 and 0<policy.pause_thermal_at<=2):
        return bad
    if workload.kind in (WorkloadKind.HIDDEN_RESOURCE,WorkloadKind.POLICY_EVASION,WorkloadKind.AUTONOMOUS_FINANCE):
        return response(State.DENY,Code.BLOCKED_ACTIVITY,'Disallowed workload category')
    donation=workload.kind is WorkloadKind.EDGE_DONATION
    if donation:
        if mode is RuntimeMode.OFFLINE:
            return response(State.DENY,Code.OFFLINE_NO_EGRESS,'Offline mode')
        if mode is RuntimeMode.CLOUD_HPC or workload.preferred_remote:
            return response(State.DENY,Code.BLOCKED_ACTIVITY,'Donation only on opted-in local device')
        if not authorized(grants,'edge.donate',principal,now):
            return response(State.DENY,Code.CONSENT_REQUIRED,'Resource donation requires explicit consent')
        if not (device.charging and device.unmetered and device.foreground and device.network_available):
            return response(State.DENY,Code.RESOURCE_DONATION_GUARD,'Visible charging unmetered device required')
    free=device.total_native_budget_mib-device.reserved_native_mib
    remote=not donation and (mode is RuntimeMode.CLOUD_HPC or workload.preferred_remote or
              (mode is RuntimeMode.HYBRID and workload.required_ram_mib>free))
    if remote:
        if mode is RuntimeMode.OFFLINE:
            return response(State.DENY,Code.OFFLINE_NO_EGRESS,'OFFLINE forbids external compute')
        if not policy.egress_enabled:
            return response(State.DENY,Code.EGRESS_DISABLED,'Egress disabled')
        if not authorized(grants,'cloud.compute',principal,now):
            return response(State.DENY,Code.CONSENT_REQUIRED,'Cloud compute consent required')
        if not device.network_available:
            return response(State.DENY,Code.NETWORK_UNAVAILABLE,'Network unavailable')
        if workload.estimated_cloud_cost_usd>policy.approved_cloud_usd:
            return response(State.DENY,Code.BUDGET_NOT_APPROVED,'Unapproved estimated cloud cost')
        return response(State.RUN_REMOTE,Code.OK,'Remote compute authorized')
    if device.thermal_headroom>=policy.pause_thermal_at:
        return response(State.PAUSE,Code.THERMAL_GUARD,'Thermal threshold reached')
    if not device.charging and device.battery_percent<=policy.low_battery_pct:
        return response(State.PAUSE,Code.BATTERY_GUARD,'Battery threshold reached')
    if not device.foreground:
        return response(State.PAUSE,Code.FOREGROUND_REQUIRED,'Foreground execution required')
    if workload.required_ram_mib>free:
        return response(State.DENY,Code.INSUFFICIENT_NATIVE_MEMORY,'Insufficient native memory lease')
    return response(State.RUN_LOCAL,Code.OK,'Local execution admitted')
