"""Offline pre-publication triage. Never prints matched secret values."""
import argparse
import base64
import json
import os
import re
import stat
import tomllib
from pathlib import Path

MAX_FILE=16*1024**2
MAX_TOTAL=256*1024**2
MAX_ENTRIES=20000
LICENSES={'MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','AGPL-3.0-only','AGPL-3.0-or-later','GPL-3.0-only','MPL-2.0','0BSD','Unlicense'}
PATTERNS=(('private-key',re.compile(r'-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----')),('github-token',re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})')),('api-token',re.compile(r'\bsk-[A-Za-z0-9_-]{32,}')),('aws-key',re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b')),('credential-assignment',re.compile(r'''(?i)\b(?:password|api[_-]?key|secret|token)\s*[:=]\s*["'][^"'\r\n]{12,}["']''')))

def read_regular(path, limit):
    if not hasattr(os,'O_NOFOLLOW'): raise OSError('O_NOFOLLOW required')
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
        before=os.fstat(f.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size>limit: raise ValueError('file limit or type')
        data=f.read(limit+1); after=os.fstat(f.fileno())
        if len(data)!=before.st_size or len(data)>limit or (before.st_mtime_ns,before.st_ctime_ns)!=(after.st_mtime_ns,after.st_ctime_ns): raise ValueError('file changed or limit')
        return data

def valid_sri(value):
    if not isinstance(value,str): return False
    try:
        algorithm,encoded=value.split('-',1); raw=base64.b64decode(encoded,validate=True)
        return algorithm in ('sha512','sha256') and len(raw)=={'sha512':64,'sha256':32}[algorithm] and base64.b64encode(raw).decode()==encoded
    except (ValueError,KeyError): return False

def make_sbom(components):
    result=[]; seen=set()
    for c in components:
        key=(c['ecosystem'],c['name'],c['version'])
        if key in seen: continue
        seen.add(key); item={'type':'library','name':c['name'],'version':c['version'],'properties':[{'name':'omega:ecosystem','value':c['ecosystem']}]}
        if c['license'] in LICENSES: item['licenses']=[{'license':{'id':c['license']}}]
        result.append(item)
    return {'bomFormat':'CycloneDX','specVersion':'1.5','version':1,'components':result}

def scan_tree(root,*,advisory_path=None,advisory_sha256=None):
    if (advisory_path is None)!=(advisory_sha256 is None):raise ValueError('Both advisory snapshot and trusted digest required')
    root=Path(os.path.abspath(root)); findings=[]; components=[]; texts={}; total=0; entries=0
    def finding(code,path,**info): findings.append({'code':code,'path':str(path),**info})
    if root.is_symlink() or not root.is_dir(): raise ValueError('invalid root')
    stack=[root]
    while stack:
        directory=stack.pop()
        if directory.is_symlink(): finding('symlink',directory.relative_to(root)); continue
        for p in sorted(directory.iterdir()):
            entries+=1
            if entries>MAX_ENTRIES: raise ValueError('entry budget exceeded')
            rel=p.relative_to(root).as_posix(); s=p.lstat()
            if any(pattern.search(rel) for _,pattern in PATTERNS):finding('potential-secret',rel,rule='path',line=0)
            if stat.S_ISLNK(s.st_mode): finding('symlink',rel); continue
            if stat.S_ISDIR(s.st_mode): stack.append(p); continue
            if not stat.S_ISREG(s.st_mode): finding('unsupported-entry',rel); continue
            try: data=read_regular(p,min(MAX_FILE,MAX_TOTAL-total))
            except (ValueError,OSError): finding('unscanned-file',rel); continue
            total+=len(data)
            if b'\x00' in data: finding('opaque-binary',rel); continue
            try: body=data.decode('utf-8-sig')
            except UnicodeError: finding('opaque-binary',rel); continue
            for rule,pattern in PATTERNS:
                for m in pattern.finditer(body): finding('potential-secret',rel,rule=rule,line=body.count('\n',0,m.start())+1); break
            if p.name in {'package.json','package-lock.json','Cargo.toml','Cargo.lock'} or p.name.lower().startswith(('license','copying')): texts[rel]=body
    licenses=[]
    for path,body in sorted(texts.items()):
        p=Path(path); name=p.name
        try:
            if name=='package.json':
                doc=json.loads(body); license=doc.get('license'); licenses.append({'path':path,'declared':license if isinstance(license,str) and license in LICENSES else 'REVIEW'})
                if license not in LICENSES: finding('license-review',path)
                if any(doc.get(k) for k in ('dependencies','devDependencies','optionalDependencies')) and str(p.with_name('package-lock.json')) not in texts: finding('missing-lock',path)
            elif name=='package-lock.json':
                doc=json.loads(body)
                if doc.get('lockfileVersion') not in (2,3) or not isinstance(doc.get('packages'),dict): raise ValueError('unsupported lock')
                for key,v in sorted(doc['packages'].items()):
                    if not key: continue
                    if not isinstance(v,dict) or not isinstance(v.get('version'),str) or v.get('link'): finding('dependency-review',path); continue
                    lic=v.get('license'); integrity=v.get('integrity'); dep=v.get('name') or key.rsplit('node_modules/',1)[-1]
                    if not isinstance(dep,str) or not dep:raise ValueError('Invalid npm package')
                    components.append({'ecosystem':'npm','name':dep,'version':v['version'],'license':lic if isinstance(lic,str) and lic in LICENSES else 'REVIEW','lock':path,'integrity_declared':valid_sri(integrity)})
                    if lic not in LICENSES or not valid_sri(integrity): finding('dependency-review',path,dependency=dep)
            elif name=='Cargo.toml':
                doc=tomllib.loads(body); lic=doc.get('package',{}).get('license'); licenses.append({'path':path,'declared':lic if isinstance(lic,str) and lic in LICENSES else 'REVIEW'})
                if lic not in LICENSES: finding('license-review',path)
                if str(p.with_name('Cargo.lock')) not in texts: finding('missing-lock',path)
            elif name=='Cargo.lock':
                for pkg in tomllib.loads(body).get('package',[]):
                    if not pkg.get('source'): continue
                    source=pkg.get('source');digest=pkg.get('checksum');valid=isinstance(source,str) and source.startswith('registry+') and isinstance(digest,str) and re.fullmatch(r'[a-f0-9]{64}',digest) is not None
                    if not isinstance(pkg.get('name'),str) or not isinstance(pkg.get('version'),str):raise ValueError('Invalid Cargo package')
                    components.append({'ecosystem':'cargo','name':pkg['name'],'version':pkg['version'],'license':'REVIEW','lock':path,'integrity_declared':valid}); finding('dependency-review',path,dependency=pkg['name'])
                    if not valid:finding('dependency-integrity-review',path,dependency=pkg['name'])
        except (ValueError,TypeError,KeyError,AttributeError): finding('malformed-metadata',path)
    if not licenses: finding('no-license-declaration','.')
    # Redact any complete report field containing a matched secret, including path and lock metadata.
    def redact(value):
        if isinstance(value,str):return '[REDACTED]' if any(pattern.search(value) for _,pattern in PATTERNS) else value
        if isinstance(value,list):return [redact(v) for v in value]
        if isinstance(value,dict):return {k:redact(v) for k,v in value.items()}
        return value
    advisory={'status':'NOT_RUN','coverage':'No trusted advisory snapshot supplied'}
    if advisory_path is not None:
        from scripts.osv_offline import match_snapshot
        advisory=match_snapshot(advisory_path,advisory_sha256,components)
        for result,code in ((advisory['matches'],'known-advisory'),(advisory['reviews'],'advisory-review')):
            for row in result:finding(code,'.',ecosystem=row['ecosystem'],dependency=row['name'],version=row['version'],advisory_id=row['id'])
    return redact({'schema':1,'scope':'heuristic offline review; not legal approval, exhaustive vulnerability audit or publication authorization','entries':entries,'bytes':total,'licenses':licenses,'components':components,'sbom':make_sbom(components),'findings':findings,'review_ready':bool(licenses) and not findings,'advisories':advisory})

def main():
    p=argparse.ArgumentParser(description=__doc__); p.add_argument('directory'); p.add_argument('--osv-snapshot'); p.add_argument('--osv-sha256'); a=p.parse_args()
    try: r=scan_tree(a.directory,advisory_path=a.osv_snapshot,advisory_sha256=a.osv_sha256); print(json.dumps(r,ensure_ascii=False,indent=2)); return 0 if r['review_ready'] else 2
    except (ValueError,OSError) as e: p.exit(1,str(e)+'\n')
if __name__=='__main__': raise SystemExit(main())
