"""Deterministic, deny-by-default inference backend *selection* only."""
from __future__ import annotations
from dataclasses import dataclass, field

class RouteError(RuntimeError):pass

@dataclass(frozen=True)
class Backend:
    id:str
    locality:str  # local | remote
    device:str
    formats:frozenset[str]
    free_mib:int
    grammar:bool
    price_micro_usd:int
    ttft_p95_ms:int
    tenants:frozenset[str]=frozenset()  # empty = eligible for any tenant

@dataclass(frozen=True)
class Request:
    mode:str
    format:str
    required_mib:int
    tenant:str
    cloud_consent:bool=False
    classification:str='internal'
    requires_grammar:bool=False
    max_price_micro_usd:int|None=None
    max_ttft_p95_ms:int|None=None
    def __post_init__(self):
        if self.mode not in ('OFFLINE','HYBRID','CLOUD_HPC'):
            raise ValueError('invalid mode')
        if self.required_mib<0 or not self.tenant or not self.format:
            raise ValueError('invalid inference request')
        if self.classification not in ('public','internal','confidential','secret'):
            raise ValueError('invalid classification')
        if self.max_price_micro_usd is not None and self.max_price_micro_usd<0:raise ValueError('invalid price limit')
        if self.max_ttft_p95_ms is not None and self.max_ttft_p95_ms<0:raise ValueError('invalid latency limit')

def choose_backend(req:Request,backends:list[Backend])->Backend:
    matching=[]
    for b in backends:
        if b.locality not in ('local','remote') or b.free_mib<0 or b.price_micro_usd<0 or b.ttft_p95_ms<0:continue
        if req.mode=='OFFLINE' and b.locality!='local':continue
        if req.mode=='CLOUD_HPC' and b.locality!='remote':continue
        if b.locality=='remote' and not req.cloud_consent:continue
        if b.locality=='remote' and req.classification in ('confidential','secret'):continue
        if b.tenants and req.tenant not in b.tenants:continue
        if req.format not in b.formats or req.required_mib>b.free_mib:continue
        if req.requires_grammar and not b.grammar:continue
        if req.max_price_micro_usd is not None and b.price_micro_usd>req.max_price_micro_usd:continue
        if req.max_ttft_p95_ms is not None and b.ttft_p95_ms>req.max_ttft_p95_ms:continue
        matching.append(b)
    if not matching:raise RouteError('no eligible backend under policy and resource constraints')
    return min(matching,key=lambda b:(0 if b.locality=='local' else 1,b.price_micro_usd,b.ttft_p95_ms,b.id))
