"""Durable ComfyUI job recovery; never retry a possibly accepted POST."""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
from urllib.parse import urlencode
from scripts.runtime_control import LocalBackend, RuntimeErrorCode, require, image_budget, validate_png, checksum, MIB


class RenderJob:
    def __init__(self,root,backend):
        self.root=Path(root).absolute();self.root.mkdir(mode=0o700,exist_ok=True);s=self.root.lstat()
        require(stat.S_ISDIR(s.st_mode) and s.st_uid==os.getuid() and not s.st_mode&0o077,'STATE','Private owned job directory required')
        self.backend=backend;self.path=self.root/'state.json'
    @contextmanager
    def locked(self):
        fd=os.open(self.root/'lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
        try:
            require(stat.S_ISREG(os.fstat(fd).st_mode),'STATE','Invalid job lock')
            try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError as e:raise RuntimeErrorCode('LOCKED','Job already owned by another process') from e
            yield
        finally:os.close(fd)
    def load(self):
        require(self.path.is_file() and not self.path.is_symlink() and self.path.stat().st_size<=65536,'STATE','Missing or invalid journal')
        return json.loads(self.path.read_text())
    def save(self,state):
        fd,tmp=tempfile.mkstemp(prefix='.state-',dir=self.root)
        try:
            with os.fdopen(fd,'w') as f:json.dump(state,f,sort_keys=True,allow_nan=False);f.flush();os.fsync(f.fileno())
            os.replace(tmp,self.path);self.sync(self.root)
        finally:Path(tmp).unlink(missing_ok=True)
    @staticmethod
    def sync(directory):
        fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(fd)
        finally:os.close(fd)
    def status(self):
        with self.locked():return self.load()
    def get(self,path,limit=8*MIB):
        for attempt in range(3):
            try:return self.backend.request('GET',path,limit=limit)
            except RuntimeErrorCode as e:
                if e.code not in ('TRANSPORT','TIMEOUT') or attempt==2:raise
                self.backend.sleep(0.25*2**attempt)
    def start(self,workflow,output,width,height,mib,polls=120):
        image_budget(width,height,mib);output=Path(output).absolute()
        require(isinstance(workflow,dict) and output.parent.is_dir() and not output.parent.is_symlink() and not os.path.lexists(output),'OUTPUT','Invalid workflow or output')
        require(type(polls) is int and 1<=polls<=120,'INPUT','Invalid poll budget')
        raw=json.dumps(workflow,sort_keys=True,allow_nan=False).encode();require(len(raw)<=8*MIB,'LIMIT','Workflow exceeds budget')
        with self.locked():
            require(not os.path.lexists(self.path),'STATE','Job exists; use resume')
            state={'state':'SUBMITTING','port':self.backend.port,'output':str(output),'width':width,'height':height,'budget_mib':mib,'workflow_sha256':hashlib.sha256(raw).hexdigest()};self.save(state)
            try:
                reply=self.backend.request('POST','/prompt',{'prompt':workflow});pid=reply.get('prompt_id') if isinstance(reply,dict) else None
                require(isinstance(pid,str) and re.fullmatch(r'[A-Za-z0-9_-]{1,128}',pid),'RESPONSE','Invalid prompt ID')
            except BaseException:
                state['state']='UNKNOWN';self.save(state);raise
            state.update(state='ACCEPTED',prompt_id=pid);self.save(state)
            return self.collect(state,polls)
    def resume(self,polls=120):
        with self.locked():
            state=self.load();require(state['port']==self.backend.port,'STATE','Backend port changed')
            require(state['state'] in ('ACCEPTED','READY','DONE'),'STATE','Unknown or terminal failed submission; no automatic replay')
            return self.collect(state,polls)
    def collect(self,state,polls):
        require(type(polls) is int and 1<=polls<=120,'INPUT','Invalid poll budget')
        output=Path(state['output']);width=state['width'];height=state['height'];mib=state['budget_mib'];image_budget(width,height,mib)
        require(output.parent.is_dir() and not output.parent.is_symlink(),'OUTPUT','Unsafe output parent')
        if os.path.lexists(output):
            require(state['state'] in ('READY','DONE') and checksum(output)==state['sha256'],'OUTPUT','Existing output differs from journal')
            if state['state']=='READY':state['state']='DONE';self.save(state)
            return state
        require(state['state']!='DONE','OUTPUT','Completed artifact missing')
        pid=state['prompt_id'];require(isinstance(pid,str) and re.fullmatch(r'[A-Za-z0-9_-]{1,128}',pid),'STATE','Invalid stored prompt ID')
        for _ in range(polls):
            history=self.get('/history/'+pid);record=history.get(pid) if isinstance(history,dict) else None
            if record is not None:
                require(isinstance(record,dict) and isinstance(record.get('status'),dict),'RESPONSE','Invalid history')
                status=record['status']
                if status.get('status_str')=='error':state['state']='FAILED';self.save(state);raise RuntimeErrorCode('BACKEND','Generation failed')
                if status.get('completed') is True:
                    require(status.get('status_str')=='success','BACKEND','Generation not successful');break
            self.backend.sleep(1)
        else:raise RuntimeErrorCode('TIMEOUT','Known prompt retained for later resume; no POST replay')
        try:images=[i for node in record['outputs'].values() for i in node.get('images',[])]
        except (KeyError,TypeError,AttributeError) as e:raise RuntimeErrorCode('RESPONSE','Invalid image outputs') from e
        require(len(images)==1 and isinstance(images[0],dict),'RESPONSE','Expected exactly one image');image=images[0];name=image.get('filename');sub=image.get('subfolder','')
        require(isinstance(name,str) and re.fullmatch(r'[A-Za-z0-9_.-]+\.png',name,re.I) and isinstance(sub,str) and (not sub or all(re.fullmatch(r'[A-Za-z0-9_-]+',p) for p in sub.split('/'))) and image.get('type')=='output','RESPONSE','Unsafe image location')
        data=self.get('/view?'+urlencode({'filename':name,'subfolder':sub,'type':'output'}),min(256*MIB,mib*MIB));validate_png(data,width,height)
        digest=hashlib.sha256(data).hexdigest()
        require(state['state']!='READY' or digest==state['sha256'],'OUTPUT','Recovered backend bytes changed')
        state.update(state='READY',sha256=digest);self.save(state)
        fd,tmp=tempfile.mkstemp(prefix='.omega-render-',dir=output.parent)
        try:
            with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
            os.link(tmp,output,follow_symlinks=False);self.sync(output.parent)
        finally:Path(tmp).unlink(missing_ok=True)
        state['state']='DONE';self.save(state);return state


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory');p.add_argument('port',type=int);sub=p.add_subparsers(dest='action',required=True)
    sub.add_parser('status');sub.add_parser('resume');s=sub.add_parser('start');s.add_argument('workflow');s.add_argument('output');s.add_argument('width',type=int);s.add_argument('height',type=int);s.add_argument('budget_mib',type=int);s.add_argument('--broker-dir');s.add_argument('--lease-mib',type=int)
    a=p.parse_args()
    try:
        job=RenderJob(a.directory,LocalBackend(a.port))
        if a.action=='status':result=job.status()
        elif a.action=='resume':result=job.resume()
        else:
            path=Path(a.workflow);require(path.is_file() and not path.is_symlink() and path.stat().st_size<=8*MIB,'INPUT','Invalid workflow file')
            workflow=json.loads(path.read_text());require((a.broker_dir is None)==(a.lease_mib is None),'INPUT','Both broker parameters required')
            def action():return job.start(workflow,a.output,a.width,a.height,a.budget_mib)
            if a.broker_dir is not None:
                from scripts.resource_broker import Broker,guarded
                from scripts.runtime_control import android_probe
                android_probe();result=guarded(Broker(a.broker_dir),a.lease_mib,action)
            else:result=action()
        print(json.dumps(result,indent=2));return 0
    except (RuntimeErrorCode,OSError,ValueError) as e:p.exit(1,str(e)+'\n')
if __name__=='__main__':raise SystemExit(main())
