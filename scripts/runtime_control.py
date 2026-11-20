"""Offline build, Android admission and loopback inference control (POSIX)."""
import argparse
from contextlib import contextmanager
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import signal
import stat
import struct
import subprocess
import tempfile
import threading
import time
from urllib.parse import urlencode
import zipfile
import zlib

MIB = 1024**2

class RuntimeErrorCode(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def require(condition, code, message):
    if not condition: raise RuntimeErrorCode(code, message)


def run_process(args, cwd, log, timeout, env):
    require(os.name == 'posix', 'PLATFORM', 'POSIX process supervision required')
    with log.open('xb') as output:
        try:
            p = subprocess.Popen(args, cwd=cwd, env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        except OSError as e: raise RuntimeErrorCode('PROCESS_START', 'Cannot start '+args[0]) from e
        try:
            code = p.wait(timeout=timeout)
        except BaseException as e:
            try: os.killpg(p.pid, signal.SIGKILL)
            except ProcessLookupError: pass
            p.wait()
            if isinstance(e, subprocess.TimeoutExpired): raise RuntimeErrorCode('TIMEOUT', 'Process deadline: '+args[0]) from e
            raise
        require(code == 0, 'PROCESS_FAILED', f'{args[0]} exited {code}')


def regular(path):
    require(path.is_file() and not path.is_symlink(), 'ARTIFACT', 'Missing or unsafe file: '+str(path))
    return path


def checksum(path):
    with regular(path).open('rb') as f: return hashlib.file_digest(f, 'sha256').hexdigest()


def check_apk(path):
    try:
        with zipfile.ZipFile(regular(path)) as z:
            names=z.namelist(); require(len(names)==len(set(names)) and 'AndroidManifest.xml' in names,'APK','Invalid APK inventory')
            libs=[n for n in names if n.startswith('lib/') and n.endswith('.so')]
            require(bool(libs),'ABI','APK contains no native libraries')
            for n in libs:
                require(re.fullmatch(r'lib/arm64-v8a/[A-Za-z0-9_.+-]+\.so',n) is not None,'ABI','Non-ARM64 library or unsafe path')
                with z.open(n) as f: header=f.read(64)
                require(len(header)>=20 and header[:6]==b'\x7fELF\x02\x01' and struct.unpack_from('<H',header,18)[0]==183,'ABI','Native ELF is not AArch64')
    except (OSError,zipfile.BadZipFile) as e: raise RuntimeErrorCode('APK','Invalid APK') from e


def build_runtime(workspace, journal_parent, target, runner=run_process, *, initialize_android=False, signer_sha256=None, package_id=None, native_lifecycle=False):
    """Build a fresh, explicitly trusted workspace. Never overwrite a prior artifact."""
    w=Path(workspace).absolute(); parent=Path(journal_parent).absolute()
    require(target in ('desktop','android'),'TARGET','Unknown target')
    require(w.is_dir() and not w.is_symlink() and parent.is_dir() and not parent.is_symlink(),'WORKSPACE','Unsafe build directory')
    for name in ('package.json','package-lock.json','src-tauri/Cargo.toml','src-tauri/Cargo.lock'): regular(w/name)
    require(not (w/'src-tauri').is_symlink(),'WORKSPACE','Unsafe native directory')
    android=w/'src-tauri/gen/android'; apk_dir=android/'app/build/outputs/apk'
    require(not native_lifecycle or (target=='android' and signer_sha256 is not None and package_id is not None),'ANDROID_PROJECT','Native lifecycle requires Android and publisher identity')
    if target=='android':
        require((android.is_dir() or (initialize_android and not os.path.lexists(android))) and not android.is_symlink() and not os.path.lexists(apk_dir),'ANDROID_PROJECT','Fresh Tauri Android project or explicit initialization required')
        require((signer_sha256 is None)==(package_id is None),'SIGNER','Require signer pin and package identity together')
        if initialize_android:require(signer_sha256 is not None,'SIGNER','Initialized Android build requires publisher pin')
        if signer_sha256 is not None:
            from scripts.native_acceptance import HEX,PACKAGE
            require(HEX.fullmatch(signer_sha256) and PACKAGE.fullmatch(package_id),'SIGNER','Invalid publisher pin/package')
    require(not os.path.lexists(w/'dist'),'STALE','Use fresh workspace: dist exists')
    lock=w/'.omega-build.lock'
    try: lock.mkdir(mode=0o700)
    except FileExistsError as e: raise RuntimeErrorCode('LOCKED','Workspace already locked; inspect before recovery') from e
    try:
        audit=Path(tempfile.mkdtemp(prefix='omega-build-',dir=parent)); target_dir=audit/'target'
        env=os.environ.copy(); env.update(CARGO_TARGET_DIR=str(target_dir),CARGO_NET_OFFLINE='true',npm_config_offline='true')
        report={'target':target,'status':'RUNNING','steps':[],'evidence':str(audit)}
        steps=[['npm','ci','--offline','--no-audit','--no-fund'],['npm','run','build']]
        if target=='desktop': steps += [['cargo','test','--locked','--offline','--manifest-path','src-tauri/Cargo.toml'],['npm','run','tauri:build','--','--no-bundle']]
        else:
            if not android.exists():steps.insert(1,['npm','run','tauri','--','android','init','--ci','--skip-targets-install'])
            steps += [['npm','run','tauri','--','android','build','--target','aarch64','--apk','--ci']]
        def execute(args):
            index=len(report['steps']); log=audit/f'{index:02d}.log'; record={'argv':args,'status':'RUNNING'};report['steps'].append(record)
            try: runner(args,w,log,1800,env);record['status']='PASS'
            except BaseException: record['status']='FAIL';raise
            finally:
                if log.is_file():record['log_sha256']=checksum(log)
        try:
            for args in steps:
                if native_lifecycle and args[:6]==['npm','run','tauri','--','android','build']:
                    from scripts.android_overlay import install_lifecycle
                    report['native_lifecycle']=install_lifecycle(w,package_id)
                execute(args)
                if args[4:6]==['android','init']:require(android.is_dir() and not android.is_symlink(),'ANDROID_PROJECT','Initialization did not produce native project')
            regular(w/'dist/index.html')
            if target=='desktop':
                artifact=regular(target_dir/'release/locally-uncensored')
                require(os.access(artifact,os.X_OK),'ARTIFACT','Build output not executable')
            else:
                candidates=sorted(p for p in apk_dir.rglob('*.apk') if p.parent.name=='release');require(len(candidates)==1,'ARTIFACT','Expected a single release APK')
                artifact=candidates[0]; check_apk(artifact)
                if signer_sha256 is None:execute(['apksigner','verify','--verbose',str(artifact)])
                else:
                    from scripts.native_acceptance import verify_signer,validate_manifest
                    execute(['apksigner','verify','--verbose','--print-certs',str(artifact)]);log=audit/f"{len(report['steps'])-1:02d}.log"
                    require(log.stat().st_size<=65536,'SIGNER','Signer report exceeds limit');report['signer_sha256']=verify_signer(log.read_text(),signer_sha256)
                    execute(['apkanalyzer','manifest','print',str(artifact)]);log=audit/f"{len(report['steps'])-1:02d}.log"
                    require(log.stat().st_size<=1024**2,'MANIFEST','Manifest exceeds limit');report['launcher']=validate_manifest(log.read_text(),package_id,require_no_backup=native_lifecycle)
            report.update(status='BUILT',artifact=str(artifact),sha256=checksum(artifact));return report
        except BaseException as e:
            report.update(status='FAIL',error_code=getattr(e,'code','INTERRUPTED' if isinstance(e,KeyboardInterrupt) else 'ERROR'));raise
        finally: (audit/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    finally: lock.rmdir()


def read_available():
    for line in Path('/proc/meminfo').read_text().splitlines():
        if line.startswith('MemAvailable:'): return int(line.split()[1])//1024
    raise ValueError('MemAvailable missing')


def read_abi(): return subprocess.check_output(['getprop','ro.product.cpu.abi'],text=True,timeout=3).strip()


def android_probe(abi=read_abi, memory=read_available):
    try: arch=abi(); mib=memory()
    except (OSError,ValueError,subprocess.SubprocessError) as e: raise RuntimeErrorCode('PROBE','Android capability probe failed') from e
    require(arch=='arm64-v8a' and type(mib) is int and mib>0,'ABI','ARM64 and valid available RAM required')
    return {'abi':arch,'available_mib':mib}


class ResourceGate:
    """Process-local leases; thermal samples must be supplied by a trusted sensor."""
    def __init__(self,reserve=1024,clock=time.monotonic):
        require(type(reserve) is int and reserve>=0,'BUDGET','Invalid reserve')
        self.reserve=reserve;self.clock=clock;self.used=0;self.hot=False;self.timestamp=None;self.available=0;self.lock=threading.Lock()
    def sample(self,mib,millicelsius):
        require(type(mib) is int and mib>=0 and type(millicelsius) is int and -20000<=millicelsius<=120000,'PROBE','Invalid sensor sample')
        with self.lock:
            self.available=mib;self.timestamp=self.clock()
            if millicelsius>=43000:self.hot=True
            elif millicelsius<=39500:self.hot=False
    def acquire(self,mib):
        require(type(mib) is int and mib>0,'BUDGET','Invalid lease size')
        with self.lock:
            require(self.timestamp is not None and 0<=self.clock()-self.timestamp<=10,'PROBE','Resource sample stale or unavailable')
            require(not self.hot,'THERMAL','Thermal gate closed')
            require(self.used+mib+self.reserve<=self.available,'OOM','Insufficient available RAM')
            self.used+=mib
    @contextmanager
    def lease(self,mib):
        self.acquire(mib)
        try:yield
        finally:
            with self.lock:self.used-=mib


def android_execute(action,lease_mib,millicelsius,probe=android_probe,gate=None):
    profile=probe()
    require(profile.get('abi')=='arm64-v8a','ABI','ARM64 profile required')
    gate=gate if gate is not None else ResourceGate()
    gate.sample(profile['available_mib'],millicelsius)
    with gate.lease(lease_mib):return action()


def image_budget(width,height,mib):
    require(type(width) is int and type(height) is int and 1<=width<=8192 and 1<=height<=8192,'DIMENSIONS','Invalid image size')
    require(type(mib) is int and 0<mib<=65536,'BUDGET','Invalid output memory budget')
    estimate=width*height*16
    require(estimate<=mib*MIB,'OOM','Output buffer estimate exceeds budget')
    return estimate


def validate_png(data,width,height):
    require(isinstance(data,bytes) and data.startswith(b'\x89PNG\r\n\x1a\n'),'PNG','Expected PNG bytes')
    p=8;header=False;end=False;compressed=[]
    while p+12<=len(data):
        n=struct.unpack_from('>I',data,p)[0];kind=data[p+4:p+8];q=p+12+n
        require(q<=len(data) and zlib.crc32(data[p+4:q-4])==struct.unpack_from('>I',data,q-4)[0],'PNG','Invalid PNG chunk')
        value=data[p+8:q-4]
        if not header:
            require(kind==b'IHDR' and n==13,'PNG','Missing PNG header');w,h,depth,color,comp,filt,inter=struct.unpack('>IIBBBBB',value)
            require((w,h)==(width,height) and depth==8 and color in (2,6) and (comp,filt,inter)==(0,0,0),'PNG','Unexpected dimensions or unsupported PNG encoding');header=True
            expected=(width*(3 if color==2 else 4)+1)*height
        elif kind==b'IDAT':compressed.append(value)
        elif kind==b'IEND':end=True;require(n==0 and q==len(data),'PNG','Invalid PNG ending');break
        else:require(kind!=b'IHDR','PNG','Duplicate PNG header')
        p=q
    require(header and end and bool(compressed),'PNG','Incomplete PNG')
    decoder=zlib.decompressobj();total=0
    try:
        for part in compressed:
            while part:
                b=decoder.decompress(part, min(MIB,expected-total+1));total+=len(b)
                require(total<=expected and not decoder.unused_data,'PNG','PNG decompression exceeds expected size');part=decoder.unconsumed_tail
        require(decoder.eof and total==expected,'PNG','PNG pixel data size mismatch')
    except zlib.error as e:raise RuntimeErrorCode('PNG','Invalid PNG compression') from e


class LocalBackend:
    def __init__(self,port,request=None,sleep=time.sleep):
        require(type(port) is int and 1<=port<=65535,'PORT','Invalid loopback port')
        self.port=port;self.request=request or self._request;self.sleep=sleep
    def _request(self,method,path,body=None,limit=8*MIB):
        encoded=None if body is None else json.dumps(body,allow_nan=False).encode()
        require(encoded is None or len(encoded)<=8*MIB,'LIMIT','Request too large')
        conn=http.client.HTTPConnection('127.0.0.1',self.port,timeout=30); deadline=time.monotonic()+30
        try:
            conn.request(method,path,body=encoded,headers={'Content-Type':'application/json'});r=conn.getresponse()
            require(r.status==200,'HTTP','Backend HTTP '+str(r.status));parts=[];size=0
            while True:
                require(time.monotonic()<deadline,'TIMEOUT','Response deadline');b=r.read1(min(65536,limit-size+1))
                if not b:break
                size+=len(b);require(size<=limit,'LIMIT','Backend response too large');parts.append(b)
            raw=b''.join(parts)
            if method=='POST' and path=='/queue' and raw==b'':return None
            return raw if path.startswith('/view?') else json.loads(raw)
        except (OSError,http.client.HTTPException,ValueError) as e:raise RuntimeErrorCode('TRANSPORT','Backend request failed') from e
        finally:conn.close()
    def chat(self,model,prompt):
        require(isinstance(model,str) and 0<len(model)<=256 and isinstance(prompt,str) and 0<len(prompt)<=65536,'INPUT','Invalid chat input')
        reply=self.request('POST','/v1/chat/completions',{'model':model,'messages':[{'role':'user','content':prompt}],'stream':False,'max_tokens':1024})
        try:content=reply['choices'][0]['message']['content']
        except (KeyError,IndexError,TypeError) as e:raise RuntimeErrorCode('RESPONSE','Invalid chat response') from e
        require(isinstance(content,str) and bool(content.strip()),'RESPONSE','Empty chat response');return content
    def render(self,workflow,output,width,height,mib,polls=120):
        estimate=image_budget(width,height,mib);output=Path(output)
        require(isinstance(workflow,dict) and type(polls) is int and 1<=polls<=120,'INPUT','Invalid workflow or poll budget')
        require(output.parent.is_dir() and not output.parent.is_symlink() and not os.path.lexists(output),'OUTPUT','Unsafe or existing output')
        reply=self.request('POST','/prompt',{'prompt':workflow});pid=reply.get('prompt_id') if isinstance(reply,dict) else None
        require(isinstance(pid,str) and re.fullmatch(r'[A-Za-z0-9_-]{1,128}',pid) is not None,'RESPONSE','Invalid prompt ID')
        for _ in range(polls):
            history=self.request('GET','/history/'+pid);record=history.get(pid) if isinstance(history,dict) else None
            if record is not None:
                require(isinstance(record,dict),'RESPONSE','Invalid history record');status=record.get('status',{})
                require(isinstance(status,dict) and status.get('status_str')!='error','BACKEND','Generation failed')
                if status.get('completed') is True:
                    require(status.get('status_str')=='success','BACKEND','Generation not successful');break
            self.sleep(1)
        else:raise RuntimeErrorCode('TIMEOUT','Generation polling exhausted; submission not repeated')
        try:images=[i for node in record['outputs'].values() for i in node.get('images',[])]
        except (KeyError,TypeError,AttributeError) as e:raise RuntimeErrorCode('RESPONSE','Invalid image outputs') from e
        require(len(images)==1 and isinstance(images[0],dict),'RESPONSE','Expected exactly one image');image=images[0];name=image.get('filename');sub=image.get('subfolder','')
        require(isinstance(name,str) and re.fullmatch(r'[A-Za-z0-9_.-]+\.png',name,re.I) and name not in ('.','..') and isinstance(sub,str) and (not sub or all(re.fullmatch(r'[A-Za-z0-9_-]+',p) for p in sub.split('/'))) and image.get('type')=='output','RESPONSE','Unsafe image location')
        data=self.request('GET','/view?'+urlencode({'filename':name,'subfolder':sub,'type':'output'}),limit=min(256*MIB,mib*MIB));validate_png(data,width,height)
        fd,temp=tempfile.mkstemp(prefix='.omega-image-',dir=output.parent)
        try:
            with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
            os.link(temp,output,follow_symlinks=False)
        finally:Path(temp).unlink(missing_ok=True)
        return {'width':width,'height':height,'sha256':checksum(output),'output_buffer_estimate_bytes':estimate,'prompt_id':pid}


def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='action',required=True)
    b=sub.add_parser('build');b.add_argument('target',choices=['desktop','android']);b.add_argument('workspace');b.add_argument('journal_parent');b.add_argument('--initialize-android',action='store_true');b.add_argument('--signer-sha256');b.add_argument('--package-id');b.add_argument('--native-lifecycle',action='store_true')
    sub.add_parser('android-probe');c=sub.add_parser('chat');c.add_argument('port',type=int);c.add_argument('model');c.add_argument('prompt')
    r=sub.add_parser('render');r.add_argument('port',type=int);r.add_argument('workflow');r.add_argument('output');r.add_argument('width',type=int);r.add_argument('height',type=int);r.add_argument('budget_mib',type=int)
    for cmd in (c,r):
        cmd.add_argument('--android-lease-mib',type=int);cmd.add_argument('--temperature-mc',type=int)
    a=p.parse_args()
    try:
        if a.action=='build':
            require(a.target!='android' or (a.signer_sha256 and a.package_id),'SIGNER','Android CLI requires pinned publisher and package ID')
            result=build_runtime(a.workspace,a.journal_parent,a.target,initialize_android=a.initialize_android,signer_sha256=a.signer_sha256,package_id=a.package_id,native_lifecycle=a.native_lifecycle)
        elif a.action=='android-probe':result=android_probe()
        else:
            if a.action=='chat':
                def action():return {'content':LocalBackend(a.port).chat(a.model,a.prompt)}
            else:
                path=regular(Path(a.workflow));require(path.stat().st_size<=8*MIB,'LIMIT','Workflow too large')
                def action():return LocalBackend(a.port).render(json.loads(path.read_text()),a.output,a.width,a.height,a.budget_mib)
            require((a.android_lease_mib is None)==(a.temperature_mc is None),'INPUT','Both Android resource arguments are required')
            result=action() if a.android_lease_mib is None else android_execute(action,a.android_lease_mib,a.temperature_mc)
        print(json.dumps(result,ensure_ascii=False,indent=2));return 0
    except (RuntimeErrorCode,OSError,ValueError) as e:p.exit(1,str(e)+'\n')
if __name__=='__main__':raise SystemExit(main())
