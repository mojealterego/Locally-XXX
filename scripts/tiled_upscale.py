"""Resumable, reference-conditioned ComfyUI upscaling and row-streamed RGB PNG stitching."""
import argparse
from contextlib import ExitStack
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import stat
import tempfile
import zlib
from urllib.parse import urlencode
from PIL import Image
from scripts.runtime_control import LocalBackend, RuntimeErrorCode, require, checksum, validate_png, MIB
from scripts.recoverable_render import RenderJob


def plan(width,height,scale,core,halo,budget):
    require(all(type(x) is int for x in (width,height,scale,core,halo,budget)), 'INPUT','Integer geometry required')
    require(scale in (2,4) and 8<=width<=8192 and 8<=height<=8192 and width%scale==height%scale==0,'DIMENSIONS','Unsupported canvas or scale')
    require(128<=core<=1536 and scale<=halo<=core//4 and core%scale==halo%scale==0 and 1<=budget<=4096,'BUDGET','Invalid tile geometry or budget')
    def axis(n):
        count=(n+core-1)//core; boundaries=[i*(n//scale)//count*scale for i in range(count+1)]
        return [(max(0,a-halo),min(n,b+halo)) for a,b in zip(boundaries,boundaries[1:])]
    xs,ys=axis(width),axis(height)
    require(len(xs)*len(ys)<=256,'LIMIT','Too many tiles')
    tiles=[{'id':f'tile-{r:03d}-{c:03d}','row':r,'col':c,'x':a,'y':d,'w':b-a,'h':e-d} for r,(d,e) in enumerate(ys) for c,(a,b) in enumerate(xs)]
    estimate=max(t['w']*t['h'] for t in tiles)*32+width*64+4*MIB
    require(estimate<=budget*MIB,'OOM','Estimated client tile memory exceeds budget')
    return {'width':width,'height':height,'scale':scale,'core':core,'halo':halo,'budget':budget,'estimated_client_bytes':estimate,'tiles':tiles}


def choose_plan(width,height,scale,core,halo,budget):
    while True:
        try:return plan(width,height,scale,core,halo,budget)
        except RuntimeErrorCode as e:
            if e.code!='OOM' or core<=max(128,halo*4):raise
            core=max(128,halo*4,core-64)


def workflow(tile,scale,image,model):
    require(all(isinstance(n,str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}',n) for n in (image,model)),'INPUT','Unsafe backend filename')
    return {'1':{'class_type':'LoadImage','inputs':{'image':image}},
            '2':{'class_type':'ImageCrop','inputs':{'image':['1',0],'x':tile['x']//scale,'y':tile['y']//scale,'width':tile['w']//scale,'height':tile['h']//scale}},
            '3':{'class_type':'UpscaleModelLoader','inputs':{'model_name':model}},
            '4':{'class_type':'ImageUpscaleWithModel','inputs':{'upscale_model':['3',0],'image':['2',0]}},
            '5':{'class_type':'SaveImage','inputs':{'images':['4',0],'filename_prefix':'omega-tiled'}}}


def blend(a,b,n,vertical=None):
    # Integer crossfade. RGB components share one weight per pixel.
    if vertical is not None:
        k=vertical+1; return bytes((x*(n+1-k)+y*k)//(n+1) for x,y in zip(a,b))
    return bytes((x*(n-i//3)+y*(i//3+1))//(n+1) for i,(x,y) in enumerate(zip(a,b)))


def chunk(f,kind,data):
    f.write(struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)))


def stitch(p,paths,output,scratch):
    require(p==plan(*(p[k] for k in ('width','height','scale','core','halo','budget'))),'PLAN','Geometry mismatch')
    tiles=p['tiles'];width,height=p['width'],p['height'];output=Path(output);scratch=Path(scratch)
    require(len(paths)==len(tiles) and not os.path.lexists(output),'OUTPUT','Wrong tile count or existing output')
    require(shutil.disk_usage(scratch).free>=sum(t['w']*t['h']*3 for t in tiles)+MIB and shutil.disk_usage(output.parent).free>=width*height*4+MIB,'DISK','Insufficient scratch or output space')
    created=False
    try:
        with tempfile.TemporaryDirectory(prefix='omega-stitch-',dir=scratch) as tmp, ExitStack() as stack:
            groups={}
            for t,path in zip(tiles,paths):
                path=Path(path);limit=max(1,(t['w']*t['h']*16+MIB-1)//MIB)*MIB
                require(path.is_file() and not path.is_symlink() and path.stat().st_size<=limit,'TILE','Invalid tile file')
                data=path.read_bytes();validate_png(data,t['w'],t['h']);del data
                raw=Path(tmp)/t['id']
                with Image.open(path) as im:
                    require(im.mode=='RGB' and im.size==(t['w'],t['h']),'TILE','Only RGB tiles supported');raw.write_bytes(im.tobytes())
                groups.setdefault(t['row'],[]).append((t,stack.enter_context(raw.open('rb'))))
            def line(group,y):
                result=b'';end=0
                for t,f in group:
                    f.seek((y-t['y'])*t['w']*3);data=f.read(t['w']*3)
                    require(len(data)==t['w']*3 and t['x']<=end,'TILE','Short raw tile or gap')
                    overlap=end-t['x'];cut=overlap*3
                    result=(result[:-cut]+blend(result[-cut:],data[:cut],overlap)+data[cut:]) if cut else result+data
                    end=t['x']+t['w']
                require(len(result)==width*3,'TILE','Invalid scanline');return result
            with output.open('xb') as f:
                created=True;f.write(b'\x89PNG\r\n\x1a\n');chunk(f,b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0));compressor=zlib.compressobj(6)
                for y in range(height):
                    active=[g for g in groups.values() if g[0][0]['y']<=y<g[0][0]['y']+g[0][0]['h']]
                    require(1<=len(active)<=2,'PLAN','Invalid vertical coverage');row=line(active[0],y)
                    if len(active)==2:
                        a,b=active[0][0][0],active[1][0][0];row=blend(row,line(active[1],y),a['y']+a['h']-b['y'],y-b['y'])
                    data=compressor.compress(b'\0'+row)
                    if data:chunk(f,b'IDAT',data)
                chunk(f,b'IDAT',compressor.flush());chunk(f,b'IEND',b'');f.flush();os.fsync(f.fileno())
    except BaseException:
        if created:output.unlink(missing_ok=True)
        raise


class TiledJob:
    def __init__(self,root,backend):
        self.journal=RenderJob(root,backend);self.root=self.journal.root;self.backend=backend
    def check_source(self,source,digest):
        data=self.journal.get('/view?'+urlencode({'filename':source.name,'type':'input','subfolder':''}),source.stat().st_size)
        require(isinstance(data,bytes) and hashlib.sha256(data).hexdigest()==digest,'INPUT','Backend source digest differs')
    def clean_staging(self,state,output):
        name=state.get('staging')
        if name is None:return
        stage=Path(name)
        require(stage.parent==output.parent and re.fullmatch(r'omega-output-[A-Za-z0-9_]+',stage.name),'STATE','Invalid staging path')
        if os.path.lexists(stage):
            s=stage.lstat();require(stat.S_ISDIR(s.st_mode) and s.st_uid==os.getuid() and not s.st_mode&0o077,'STATE','Unsafe staging directory');shutil.rmtree(stage)
        state.pop('staging',None)
    def run(self,source,model,output,scale,core,halo,budget):
        source,model,output=(Path(p).absolute() for p in (source,model,output))
        require(source.is_file() and not source.is_symlink() and source.stat().st_size<=64*MIB and model.is_file() and not model.is_symlink() and 0<model.stat().st_size<=16*1024**3,'INPUT','Trusted local source and model required')
        require(output.suffix.lower()=='.png' and output.parent.is_dir() and not output.parent.is_symlink() and not output.is_relative_to(self.root),'OUTPUT','Unsafe output path')
        with Image.open(source) as im:
            require(im.format=='PNG' and im.mode=='RGB' and im.width*im.height<=16_777_216 and not im.getexif(),'INPUT','Source must be RGB PNG without EXIF');width,height=im.size
        p=choose_plan(width*scale,height*scale,scale,core,halo,budget);require(source.stat().st_size*3+4*MIB<=budget*MIB,'OOM','Source verification exceeds client budget');workflow(p['tiles'][0],scale,source.name,model.name)
        config={'source':str(source),'source_sha256':checksum(source),'model':str(model),'model_sha256':checksum(model),'output':str(output),'port':self.backend.port,'requested_core':core,'plan':p}
        with self.journal.locked():
            if os.path.lexists(self.journal.path):
                state=self.journal.load();require(all(state.get(k)==v for k,v in config.items()),'STATE','Tiled job configuration changed')
            else:
                require(not os.path.lexists(output),'OUTPUT','Output exists');state={**config,'state':'RUNNING'};self.journal.save(state)
            if os.path.lexists(output):
                require(state['state'] in ('READY','DONE') and checksum(output)==state['sha256'],'OUTPUT','Output conflicts with journal')
                if state['state']=='READY':self.clean_staging(state,output);self.journal.sync(output.parent);state['state']='DONE';self.journal.save(state)
                return state
            require(state['state'] in ('RUNNING','READY'),'STATE','Completed artifact missing or invalid state')
            self.clean_staging(state,output);self.check_source(source,config['source_sha256'])
            # Only scratch from this job may be removed under its exclusive lock.
            for stale in self.root.glob('omega-stitch-*'):
                require(stale.is_dir() and not stale.is_symlink(),'STATE','Unsafe scratch entry');shutil.rmtree(stale)
            require(shutil.disk_usage(self.root).free>=sum(max(MIB,t['w']*t['h']*19) for t in p['tiles'])+MIB,'DISK','Insufficient tile and scratch space')
            paths=[]
            for t in p['tiles']:
                tile_path=self.root/(t['id']+'.png');job=RenderJob(self.root/t['id'],self.backend);graph=workflow(t,scale,source.name,model.name)
                tile_budget=max(1,(t['w']*t['h']*16+MIB-1)//MIB)
                if job.path.exists():
                    old=job.status();expected=hashlib.sha256(json.dumps(graph,sort_keys=True,allow_nan=False).encode()).hexdigest()
                    require((old['workflow_sha256'],old['output'],old['width'],old['height'],old['budget_mib'])==(expected,str(tile_path),t['w'],t['h'],tile_budget),'STATE','Tile journal mismatch');job.resume()
                else:job.start(graph,tile_path,t['w'],t['h'],tile_budget)
                paths.append(tile_path)
            require(checksum(source)==config['source_sha256'] and checksum(model)==config['model_sha256'],'STATE','Source or model changed during execution')
            self.check_source(source,config['source_sha256'])
            stage=Path(tempfile.mkdtemp(prefix='omega-output-',dir=output.parent));temp=stage/'result.png'
            state['staging']=str(stage)
            try:
                self.journal.save(state);stitch(p,paths,temp,self.root);digest=checksum(temp)
                require(state['state']!='READY' or digest==state['sha256'],'OUTPUT','Recovered image differs')
                state.update(state='READY',sha256=digest);self.journal.save(state);os.link(temp,output,follow_symlinks=False);self.journal.sync(output.parent)
                self.clean_staging(state,output);state['state']='DONE';self.journal.save(state);return state
            finally:self.clean_staging(state,output)


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('directory');parser.add_argument('port',type=int);parser.add_argument('source');parser.add_argument('model');parser.add_argument('output');parser.add_argument('--scale',type=int,default=4);parser.add_argument('--core',type=int,default=1024);parser.add_argument('--halo',type=int,default=64);parser.add_argument('--budget-mib',type=int,default=128);a=parser.parse_args()
    try:print(json.dumps(TiledJob(a.directory,LocalBackend(a.port)).run(a.source,a.model,a.output,a.scale,a.core,a.halo,a.budget_mib),indent=2));return 0
    except (RuntimeErrorCode,OSError,ValueError) as e:parser.exit(1,str(e)+'\n')
if __name__=='__main__':raise SystemExit(main())
