"""Restore a privately supplied OMEGA chunk bundle without executing/extracting it."""
import argparse
import hashlib
import json
import os
import re
import stat
import tempfile
import zipfile
from pathlib import Path
from scripts.security_scan import read_regular

HEX=re.compile(r'[0-9a-f]{64}\Z')
NAME=re.compile(r'[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z')
MAX_TOTAL=20*1024**3
MAX_PART=64*1024**2

def check_zip(path):
    with zipfile.ZipFile(path) as z:
        entries=z.infolist(); seen=set(); total=0
        if not entries or len(entries)>20000: raise ValueError('ZIP entry limit')
        for e in entries:
            name=e.filename.rstrip('/'); mode=e.external_attr>>16; kind=stat.S_IFMT(mode)
            if not name or any(x in ('','.','..') for x in name.split('/')) or re.search(r'[\\:\x00-\x1f\x7f]',name) or name.casefold() in seen: raise ValueError('unsafe or duplicate ZIP path')
            seen.add(name.casefold()); total+=e.file_size
            if kind not in (0,stat.S_IFREG,stat.S_IFDIR) or e.flag_bits&1 or e.compress_type not in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED) or e.file_size>256*1024**2 or total>2*1024**3: raise ValueError('unsupported ZIP entry or expansion limit')
            if not e.is_dir():
                with z.open(e) as f:
                    n=0
                    while chunk:=f.read(1024**2):
                        n+=len(chunk)
                        if n>e.file_size: raise ValueError('ZIP expansion exceeded')
                    if n!=e.file_size: raise ValueError('ZIP size mismatch')
        return len(entries)

def restore(directory,trusted_manifest_sha256,output):
    directory=Path(os.path.abspath(directory)); output=Path(output)
    if directory.is_symlink() or not directory.is_dir() or not HEX.fullmatch(trusted_manifest_sha256): raise ValueError('invalid bundle or trusted manifest SHA')
    raw=read_regular(directory/'manifest.json',1024**2)
    if hashlib.sha256(raw).hexdigest()!=trusted_manifest_sha256: raise ValueError('manifest digest mismatch')
    m=json.loads(raw); size=m.get('size_bytes'); parts=m.get('parts'); name=m.get('file_name')
    if m.get('schema')!='omega-chunks-v1' or not isinstance(name,str) or not NAME.fullmatch(name) or type(size) is not int or not 0<size<=MAX_TOTAL or not isinstance(parts,list) or not 0<len(parts)<=4096 or not isinstance(m.get('sha256'),str) or not HEX.fullmatch(m['sha256']): raise ValueError('invalid manifest')
    seen=set(); total=0
    for p in parts:
        if not isinstance(p,dict) or not isinstance(p.get('name'),str) or not NAME.fullmatch(p['name']) or p['name'].casefold() in seen or type(p.get('bytes')) is not int or not 0<p['bytes']<=MAX_PART or not isinstance(p.get('sha256'),str) or not HEX.fullmatch(p['sha256']): raise ValueError('invalid part')
        seen.add(p['name'].casefold()); total+=p['bytes']
    if total!=size: raise ValueError('manifest size mismatch')
    if output.exists() or output.is_symlink(): raise FileExistsError(output)
    if output.parent.is_symlink() or not output.parent.is_dir(): raise ValueError('unsafe output directory')
    fd,tmp=tempfile.mkstemp(prefix='.omega-',dir=output.parent); temp=Path(tmp)
    try:
        h=hashlib.sha256()
        with os.fdopen(fd,'wb') as f:
            for p in parts:
                data=read_regular(directory/p['name'],p['bytes'])
                if len(data)!=p['bytes'] or hashlib.sha256(data).hexdigest()!=p['sha256']: raise ValueError('part digest mismatch: '+p['name'])
                h.update(data); f.write(data)
            f.flush(); os.fsync(f.fileno())
        if h.hexdigest()!=m['sha256']: raise ValueError('archive digest mismatch')
        entries=check_zip(temp) if name.lower().endswith('.zip') else None
        os.link(temp,output,follow_symlinks=False)
        return {'sha256':h.hexdigest(),'bytes':size,'parts':len(parts),'zip_entries':entries,'scope':'private local restore; no extraction, execution or publication approval'}
    finally: temp.unlink(missing_ok=True)

def main():
    p=argparse.ArgumentParser(description=__doc__); p.add_argument('directory'); p.add_argument('manifest_sha256'); p.add_argument('output'); a=p.parse_args()
    try: print(json.dumps(restore(a.directory,a.manifest_sha256,a.output),indent=2)); return 0
    except (ValueError,OSError,zipfile.BadZipFile,RuntimeError) as e: p.exit(1,str(e)+'\n')
if __name__=='__main__': raise SystemExit(main())
