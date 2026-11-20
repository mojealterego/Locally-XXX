"""Scoped llama-server KV checkpoints. Explicit, operator-owned single-slot server."""
import argparse, contextlib, fcntl, hashlib, json, os, re, stat, tempfile, uuid
from pathlib import Path
from urllib.request import Request, build_opener, ProxyHandler, HTTPRedirectHandler

HEX=re.compile(r'[a-f0-9]{64}\Z'); TOKEN=re.compile(r'[a-f0-9]{32}\Z')
SCOPE=re.compile(r'[A-Za-z0-9_-]{1,128}\Z'); TYPES={'f16','q8_0','q4_0'}

def digest(path):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as stream:
        before=os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode):raise ValueError('Regular file required')
        value=hashlib.file_digest(stream,'sha256').hexdigest();after=os.fstat(stream.fileno())
        if (before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_size,after.st_mtime_ns,after.st_ctime_ns):raise ValueError('File changed while hashing')
        return value,before.st_size

def identity(model,engine_sha256,ctx,cache_k,cache_v):
    if not HEX.fullmatch(engine_sha256) or type(ctx) is not int or not 128<=ctx<=1048576 or cache_k not in TYPES or cache_v not in TYPES:raise ValueError('Invalid cache configuration')
    return {'model_sha256':digest(model)[0],'engine_sha256':engine_sha256,'ctx':ctx,'cache_k':cache_k,'cache_v':cache_v}

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise ValueError('Redirect refused')

class SlotClient:
    def __init__(self,port):
        if type(port) is not int or not 1<=port<=65535:raise ValueError('Invalid local port')
        self.base=f'http://127.0.0.1:{port}';self.opener=build_opener(ProxyHandler({}),NoRedirect())
    def call(self,path,data=None):
        req=Request(self.base+path,data=None if data is None else json.dumps(data).encode(),headers={'Content-Type':'application/json'})
        with self.opener.open(req,timeout=120) as res:
            raw=res.read(65537)
        if len(raw)>65536:raise ValueError('Oversized slot response')
        return json.loads(raw)
    def idle(self,save):
        slots=self.call('/slots')
        if not isinstance(slots,list) or len(slots)!=1 or not isinstance(slots[0],dict):raise ValueError('Single owned slot required')
        s=slots[0];i=s.get('id');n=s.get('n_prompt_tokens',0)
        if type(i) is not int or not 0<=i<65536 or s.get('is_processing') is not False or (save and (type(n) is not int or n<=0)):raise ValueError('Slot busy or empty')
        return i
    def action(self,slot,action,filename):return self.call(f'/slots/{slot}?action={action}',{'filename':filename})

class Cache:
    def __init__(self,root,client):
        self.root=Path(root).absolute();s=self.root.lstat()
        if self.root.resolve()!=self.root or not stat.S_ISDIR(s.st_mode) or s.st_uid!=os.getuid() or s.st_mode&0o077:raise ValueError('Private owned slot directory required')
        self.client=client
    @contextlib.contextmanager
    def lock(self):
        fd=os.open(self.root/'.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
        try:
            fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);yield
        finally:os.close(fd)
    def check(self,ident,scope):
        if not isinstance(scope,str) or not SCOPE.fullmatch(scope) or not isinstance(ident,dict) or set(ident)!={'model_sha256','engine_sha256','ctx','cache_k','cache_v'}:raise ValueError('Invalid scope or identity')
        if any(not isinstance(ident[k],str) or not HEX.fullmatch(ident[k]) for k in ('model_sha256','engine_sha256')) or type(ident['ctx']) is not int or not 128<=ident['ctx']<=1048576 or ident['cache_k'] not in TYPES or ident['cache_v'] not in TYPES:raise ValueError('Invalid identity')
    def save(self,ident,scope):
        self.check(ident,scope)
        with self.lock():
            token=uuid.uuid4().hex;name=token+'.bin';path=self.root/name;slot=self.client.idle(True)
            reply=self.client.action(slot,'save',name)
            if not isinstance(reply,dict) or type(reply.get('n_saved')) is not int or reply['n_saved']<=0:raise ValueError('No saved tokens')
            sha,size=digest(path)
            if size<32 or reply.get('n_written')!=size:raise ValueError('Invalid cache size')
            os.chmod(path,0o600)
            with path.open('rb') as f:os.fsync(f.fileno())
            meta={'identity':ident,'scope':scope,'sha256':sha,'bytes':size,'tokens':reply['n_saved']}
            fd,tmp=tempfile.mkstemp(dir=self.root,prefix='.manifest-')
            try:
                with os.fdopen(fd,'w') as f:json.dump(meta,f,sort_keys=True);f.flush();os.fsync(f.fileno())
                os.replace(tmp,self.root/(token+'.json'))
                fd=os.open(self.root,os.O_RDONLY|os.O_DIRECTORY)
                try:os.fsync(fd)
                finally:os.close(fd)
            finally:Path(tmp).unlink(missing_ok=True)
            return token
    def restore(self,token,ident,scope):
        self.check(ident,scope)
        if not isinstance(token,str) or not TOKEN.fullmatch(token):raise ValueError('Invalid token')
        with self.lock():
            fd=os.open(self.root/(token+'.json'),os.O_RDONLY|os.O_NOFOLLOW)
            with os.fdopen(fd,'rb') as f:raw=f.read(4097)
            if len(raw)>4096:raise ValueError('Oversized manifest')
            meta=json.loads(raw)
            if meta['identity']!=ident or meta['scope']!=scope:raise ValueError('Cache identity/scope mismatch')
            name=token+'.bin'
            if digest(self.root/name)!=(meta['sha256'],meta['bytes']):raise ValueError('Cache integrity mismatch')
            slot=self.client.idle(False);reply=self.client.action(slot,'restore',name)
            if not isinstance(reply,dict) or reply.get('n_restored')!=meta['tokens'] or reply.get('n_read')!=meta['bytes']:raise ValueError('Restore count mismatch; invalidate engine before reuse')
            return reply

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory');p.add_argument('port',type=int);p.add_argument('model');p.add_argument('engine_sha256');p.add_argument('ctx',type=int);p.add_argument('cache_k',choices=sorted(TYPES));p.add_argument('cache_v',choices=sorted(TYPES));p.add_argument('scope');p.add_argument('--restore');a=p.parse_args()
    cache=Cache(a.directory,SlotClient(a.port));ident=identity(a.model,a.engine_sha256,a.ctx,a.cache_k,a.cache_v)
    print(json.dumps(cache.restore(a.restore,ident,a.scope) if a.restore else {'token':cache.save(ident,a.scope)}))
if __name__=='__main__':main()
