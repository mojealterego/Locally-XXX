"""Offline-only demonstration of mobile memory policy + inference backend routing."""
from __future__ import annotations
from datetime import datetime,timezone
from dataclasses import asdict
from pathlib import Path
import json
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from compute_bridge import mobile,inference,plan_inference_execution

m=mobile.RuntimeMode.OFFLINE
w=mobile.Workload('offline-demo',mobile.WorkloadKind.INFERENCE,1024,60,0.,False)
d=mobile.DeviceState(6553,3500,.25,90,True,True,False,True)
p=mobile.ControlPolicy()
r=inference.Request('sample-tenant',inference.ExecutionMode.OFFLINE,'PRIVATE','local-gguf','GGUF',frozenset({'chat'}),1024)
backends=[inference.Runtime('s24-local','llama.cpp',inference.Deployment.ON_DEVICE,'local-gguf','GGUF',frozenset({'chat'}),frozenset({'PRIVATE'}),frozenset({'sample-tenant'}),1800,True,True)]
print(json.dumps(asdict(plan_inference_execution(workload=w,device=d,mode=m,grants=[],policy=p,now=datetime(2026,11,23,tzinfo=timezone.utc),principal='sample-tenant',request=r,runtimes=backends)),indent=2))
