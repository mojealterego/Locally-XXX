"""Broker-managed ComfyUI tiling, conservative scoped cancellation, VRAM admission."""
import argparse
from contextlib import nullcontext
import sys
import json
import os
from pathlib import Path
import re
import stat
import time
from scripts.resource_broker import Broker, guarded
from scripts.runtime_control import LocalBackend, RuntimeErrorCode, MIB, require, checksum
from scripts.recoverable_render import RenderJob
from scripts.tiled_upscale import TiledJob

ID=re.compile(r'[A-Za-z0-9_-]{1,128}\Z')
CANCEL_STATES=('CANCELLING','CANCEL_UNKNOWN','CANCEL_UNCONFIRMED','CANCEL_TERMINAL')

class QuiescentPause(RuntimeErrorCode):
    """A pre-submit or post-collection refusal with no unresolved submitted tile."""

class GpuAdmission:
    def __init__(self,backend,kind,index,mib):
        require(kind in ('cuda','xpu','mps','npu','privateuseone') and type(index) is int and 0<=index<256 and type(mib) is int and 0<mib<=262144,'VRAM','Invalid accelerator policy')
        self.backend=backend;self.kind=kind;self.index=index;self.mib=mib
    def check(self):
        stats=self.backend.request('GET','/system_stats');devices=stats.get('devices') if isinstance(stats,dict) else None
        require(isinstance(devices,list) and len(devices)<=256 and all(isinstance(d,dict) for d in devices),'VRAM','Invalid device telemetry')
        matches=[d for d in devices if d.get('type')==self.kind and type(d.get('index')) is int and d['index']==self.index]
        require(len(matches)==1,'VRAM','Selected accelerator unavailable or ambiguous')
        d=matches[0];free,total=d.get('vram_free'),d.get('vram_total')
        require(type(free) is int and type(total) is int and 0<=free<=total and 0<total<=2**60,'VRAM','Invalid VRAM telemetry')
        require(free>=self.mib*MIB,'VRAM','Available VRAM below configured threshold');return free

def request_stop(root,backend):
    journal=RenderJob(root,backend)
    require(journal.path.is_file() and not journal.path.is_symlink(),'STATE','Existing job required')
    marker=journal.root/'stop.request'
    try:fd=os.open(marker,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    except FileExistsError:
        require(stat.S_ISREG(marker.lstat().st_mode),'STATE','Invalid stop marker');return {'state':'STOP_REQUESTED'}
    with os.fdopen(fd,'wb') as f:f.write(b'stop\n');f.flush();os.fsync(f.fileno())
    journal.sync(journal.root);return {'state':'STOP_REQUESTED'}

def managed_tiled(job,broker,lease_mib,kind,index,vram_mib,source,model,output,scale,core,halo,budget,*,wait=60,clock=time.monotonic,sleep=time.sleep,owner=None,supervisor=None):
    gpu=GpuAdmission(job.backend,kind,index,vram_mib)
    admission={'broker':str(broker.root),'lease_mib':lease_mib,'device_type':kind,'device_index':index,'min_vram_mib':vram_mib}
    if supervisor is not None:
        require(supervisor.port==job.backend.port,'PORT','Supervisor/backend port mismatch')
        admission['owned_backend']=supervisor.policy
    def stop_check():require(not os.path.lexists(job.root/'stop.request'),'STOPPED','Tiled job stopped; no new work')
    stop_check()
    def action(check):
        def checkpoint(quiescent):
            try:stop_check();check()
            except RuntimeErrorCode as e:
                if quiescent:raise QuiescentPause(e.code,str(e)) from e
                raise
        def before_submit():
            checkpoint(True)
            try:
                if supervisor is not None:
                    supervisor.ensure_ready(quiescent=True)
                    job.check_source(Path(source),job.journal.load()['source_sha256'])
                gpu.check()
            except RuntimeErrorCode as e:raise QuiescentPause(e.code,str(e)) from e
            checkpoint(True)
        with supervisor if supervisor is not None else nullcontext():
            original=job.backend.request
            try:
                if supervisor is not None:
                    # On a fresh owned server, previous volatile history is gone. Never replay an unresolved tile.
                    with job.journal.locked():
                        if job.journal.path.exists():require(job.journal.load().get('admission')==admission,'STATE','Different owned backend policy')
                        for path in job.root.glob('tile-*'):
                            if path.suffix=='.png':continue
                            require(path.is_dir() and not path.is_symlink() and re.fullmatch(r'tile-[0-9]{3}-[0-9]{3}',path.name),'STATE','Invalid tile directory')
                            state_path=path/'state.json'
                            if not os.path.lexists(state_path):continue
                            tile=RenderJob(path,job.backend).status();artifact=job.root/(path.name+'.png')
                            require(tile.get('state')=='DONE' and artifact.is_file() and checksum(artifact)==tile.get('sha256'),'UNKNOWN','Unresolved tile: owned backend startup denied')
                    supervisor.ensure_ready(quiescent=True)
                    def guarded_request(method,path,*a,**kw):
                        stop_check();require(supervisor.owns_listener(),'UNAVAILABLE','Owned backend connection lost')
                        return original(method,path,*a,**kw)
                    job.backend.request=guarded_request
                return job.run(source,model,output,scale,core,halo,budget,admission=admission,before_submit=before_submit,checkpoint=checkpoint)
            except QuiescentPause as e:return {'state':'PAUSED','reason':e.code,'message':str(e)}
            finally:job.backend.request=original
    return guarded(broker,lease_mib,action,wait,clock,sleep,owner,with_check=True)

def queue_ids(reply):
    require(isinstance(reply,dict),'RESPONSE','Invalid queue response');result=[]
    for key in ('queue_running','queue_pending'):
        rows=reply.get(key);require(isinstance(rows,list) and len(rows)<=10000,'RESPONSE','Invalid queue entries')
        require(all(isinstance(r,list) and len(r)>=2 and isinstance(r[1],str) and ID.fullmatch(r[1]) for r in rows),'RESPONSE','Invalid queue ID')
        result.append({r[1] for r in rows});require(len(result[-1])==len(rows),'RESPONSE','Duplicate queue ID')
    require(not result[0]&result[1],'RESPONSE','Ambiguous queue state');return result

def cancel_queued(job):
    """Only delete the journal's pending ID. No global interrupt or optimistic release."""
    with job.locked():
        state=job.load();require(state.get('port')==job.backend.port,'STATE','Backend port changed')
        if state.get('state') in CANCEL_STATES:return state
        require(state.get('state')=='ACCEPTED','STATE','Only accepted jobs can be dequeued')
        pid=state.get('prompt_id');require(isinstance(pid,str) and ID.fullmatch(pid),'STATE','Invalid stored prompt ID')
        running,pending=queue_ids(job.get('/queue'))
        require(pid not in running and pid in pending,'NOT_PENDING','Job not pending; running work is never interrupted')
        state['state']='CANCELLING';job.save(state)
        try:
            job.backend.request('POST','/queue',{'delete':[pid]})
            running,pending=queue_ids(job.get('/queue'))
            state['state']='CANCEL_UNKNOWN' if pid in running or pid in pending else 'CANCEL_UNCONFIRMED'
            history=job.get('/history/'+pid);record=history.get(pid) if isinstance(history,dict) else None
            status=record.get('status') if isinstance(record,dict) else None
            if pid not in running and pid not in pending and isinstance(status,dict) and (status.get('completed') is True or status.get('status_str')=='error'):
                state['state']='CANCEL_TERMINAL';state['backend_terminal_status']=str(status.get('status_str'))
            job.save(state);return state
        except BaseException:
            state['state']='CANCEL_UNKNOWN';job.save(state);raise

def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='command',required=True)
    for name in ('stop','cancel-pending'):
        c=sub.add_parser(name);c.add_argument('directory');c.add_argument('port',type=int)
    r=sub.add_parser('tiled');r.add_argument('directory');r.add_argument('port',type=int);r.add_argument('broker_dir');r.add_argument('source');r.add_argument('model');r.add_argument('output');r.add_argument('--lease-mib',type=int,required=True);r.add_argument('--device-type',required=True);r.add_argument('--device-index',type=int,required=True);r.add_argument('--min-vram-mib',type=int,required=True);r.add_argument('--scale',type=int,default=4);r.add_argument('--core',type=int,default=1024);r.add_argument('--halo',type=int,default=64);r.add_argument('--budget-mib',type=int,default=128);r.add_argument('--wait',type=int,default=60);r.add_argument('--owned-comfy-root');r.add_argument('--owned-state');r.add_argument('--backend-restarts',type=int,default=1);r.add_argument('--startup-deadline',type=int,default=120)
    a=p.parse_args()
    try:
        b=LocalBackend(a.port)
        if a.command=='stop':result=request_stop(a.directory,b)
        elif a.command=='cancel-pending':result=cancel_queued(RenderJob(a.directory,b))
        else:
            require((a.owned_comfy_root is None)==(a.owned_state is None),'POLICY','Owned backend root and private state required together')
            supervisor=None
            if a.owned_comfy_root is not None:
                from scripts.backend_supervisor import OwnedBackend
                root=Path(a.owned_comfy_root).resolve(strict=True);entry=root/'main.py'
                require(entry.is_file() and not entry.is_symlink(),'INPUT','Trusted ComfyUI main.py required')
                require(Path(a.source).resolve(strict=True).parent==root/'input' and Path(a.model).resolve(strict=True).parent==root/'models/upscale_models','INPUT','Owned backend source/model must be in dedicated ComfyUI directories')
                supervisor=OwnedBackend(a.owned_state,a.port,[sys.executable,str(entry),'--listen','127.0.0.1','--port',str(a.port),'--disable-auto-launch'],root,deadline=a.startup_deadline,restarts=a.backend_restarts)
            result=managed_tiled(TiledJob(a.directory,b),Broker(a.broker_dir),a.lease_mib,a.device_type,a.device_index,a.min_vram_mib,a.source,a.model,a.output,a.scale,a.core,a.halo,a.budget_mib,wait=a.wait,supervisor=supervisor)
        print(json.dumps(result,indent=2));return 2 if result.get('state')=='PAUSED' else 0
    except (RuntimeErrorCode,OSError,ValueError) as e:p.exit(1,str(e)+'\n')
if __name__=='__main__':raise SystemExit(main())
