"""Bounded GGUF v2/v3 little-endian structural verifier, not inference."""
import argparse
import json
import math
import os
import stat
import struct
from pathlib import Path

# ggml type: (elements per block, bytes per block). Unknown types fail closed.
TYPES={0:(1,4),1:(1,2),2:(32,18),3:(32,20),6:(32,22),7:(32,24),8:(32,34),9:(32,36),10:(256,84),11:(256,110),12:(256,144),13:(256,176),14:(256,210),15:(256,292),24:(1,1),25:(1,2),26:(1,4),27:(1,8),28:(1,8),30:(1,2)}
SCALARS={0:'B',1:'b',2:'H',3:'h',4:'I',5:'i',6:'f',7:'B',10:'Q',11:'q',12:'d'}
MAX_HEADER=64*1024**2
MAX_COUNT=200000
MAX_VALUES=4000000

class Reader:
    def __init__(self,f,size): self.f=f; self.size=size; self.values=0
    def read(self,n):
        if n<0 or self.f.tell()+n>min(self.size,MAX_HEADER): raise ValueError('GGUF metadata truncated or budget exceeded')
        b=self.f.read(n)
        if len(b)!=n: raise ValueError('GGUF truncated')
        return b
    def num(self,fmt): return struct.unpack('<'+fmt,self.read(struct.calcsize('<'+fmt)))[0]
    def string(self):
        n=self.num('Q')
        if n>1024**2: raise ValueError('GGUF string limit')
        try: return self.read(n).decode('utf-8')
        except UnicodeError as e: raise ValueError('invalid UTF-8') from e
    def value(self,kind,allow_array=True):
        self.values+=1
        if self.values>MAX_VALUES: raise ValueError('metadata value budget')
        if kind==8: return self.string()
        if kind in SCALARS:
            value=self.num(SCALARS[kind])
            if kind==7 and value not in (0,1): raise ValueError('invalid boolean')
            return value
        if kind==9 and allow_array:
            subtype=self.num('I'); n=self.num('Q')
            if n>MAX_VALUES-self.values or subtype==9 or subtype not in {*SCALARS,8}: raise ValueError('invalid metadata array')
            for _ in range(n): self.value(subtype,False)
            return None
        raise ValueError('unsupported metadata type')

def inspect(path):
    path=Path(path)
    if not hasattr(os,'O_NOFOLLOW'): raise OSError('O_NOFOLLOW required')
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
        before=os.fstat(f.fileno())
        if not stat.S_ISREG(before.st_mode): raise ValueError('GGUF not a regular file')
        r=Reader(f,before.st_size)
        if r.read(4)!=b'GGUF': raise ValueError('invalid GGUF magic')
        version=r.num('I'); count=r.num('Q'); meta=r.num('Q')
        if version not in (2,3) or not 0<count<=MAX_COUNT or meta>MAX_COUNT: raise ValueError('unsupported version or count')
        keys=set(); alignment=32
        for _ in range(meta):
            key=r.string(); kind=r.num('I')
            if not key or key in keys: raise ValueError('duplicate or empty metadata key')
            keys.add(key); value=r.value(kind)
            if key=='general.alignment':
                if kind!=4 or not 1<=value<=4096 or value&(value-1): raise ValueError('invalid alignment')
                alignment=value
        tensors=[]; names=set(); types={}
        for _ in range(count):
            name=r.string(); n=r.num('I')
            if not name or name in names or not 1<=n<=4: raise ValueError('invalid tensor name or dimensions')
            names.add(name); dims=[r.num('Q') for _ in range(n)]; kind=r.num('I'); offset=r.num('Q')
            if kind not in TYPES: raise ValueError('unsupported GGML tensor type '+str(kind))
            block,size=TYPES[kind]
            if not all(dims) or dims[0]%block or offset%alignment: raise ValueError('invalid tensor block or alignment')
            length=math.prod(dims)//block*size
            if length>before.st_size: raise ValueError('tensor exceeds file')
            tensors.append((offset,offset+length)); types[str(kind)]=types.get(str(kind),0)+1
        base=(f.tell()+alignment-1)//alignment*alignment; last=0
        for start,end in sorted(tensors):
            if start<last or base+end>before.st_size: raise ValueError('overlapping or truncated tensor extent')
            last=end
        after=os.fstat(f.fileno())
        if (before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_size,after.st_mtime_ns,after.st_ctime_ns): raise ValueError('GGUF changed during inspection')
        return {'version':version,'bytes':before.st_size,'tensor_count':count,'metadata_count':meta,'alignment':alignment,'data_offset':base,'tensor_bytes':sum(end-start for start,end in tensors),'types':types,'scope':'structural verification only; tensor values, model compatibility and inference untested'}

def main():
    p=argparse.ArgumentParser(description=__doc__); p.add_argument('file'); a=p.parse_args()
    try: print(json.dumps(inspect(a.file),indent=2)); return 0
    except (ValueError,OSError) as e: p.exit(1,str(e)+'\n')
if __name__=='__main__': raise SystemExit(main())
