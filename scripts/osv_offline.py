"""Pinned offline OSV records. No network or false clean verdict on unsupported ranges."""
import hashlib
import json
import re

SEMVER=re.compile(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?\Z')
ID=re.compile(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\Z')
HEX=re.compile(r'[a-f0-9]{64}\Z')
ECOSYSTEM={'npm':'npm','cargo':'crates.io'}
MAX_RECORDS=100000
MAX_ROWS=500000
MAX_MATCH_WORK=2000000

def semver(value):
    m=SEMVER.fullmatch(value) if isinstance(value,str) and len(value)<=256 else None
    if not m:raise ValueError('Not strict semantic version')
    pre=m[4].split('.') if m[4] else []
    if any(x.isdigit() and len(x)>1 and x.startswith('0') for x in pre):raise ValueError('Invalid numeric prerelease')
    ids=tuple((0,int(x)) if x.isdigit() else (1,x) for x in pre)
    return (int(m[1]),int(m[2]),int(m[3]),not pre,ids)

def compare(a,b):
    x,y=semver(a),semver(b);return (x>y)-(x<y)

def affected_by_range(version,entry):
    if not isinstance(entry,dict) or entry.get('type')!='SEMVER':raise ValueError('Unsupported range ordering')
    events=entry.get('events')
    if not isinstance(events,list) or not 1<=len(events)<=4096:raise ValueError('Invalid events')
    target=semver(version);last=None;active=False;start=None;hit=False;closed=set()
    for e in events:
        if not isinstance(e,dict) or len(e)!=1:raise ValueError('Invalid event')
        kind,value=next(iter(e.items()));point=(-1,0,0,False,()) if kind=='introduced' and value=='0' else semver(value)
        if last is not None and point<=last:raise ValueError('Unordered or duplicate events')
        last=point
        if kind=='introduced':
            if active:raise ValueError('Overlapping range')
            start=point;active=True
        elif kind in ('fixed','last_affected'):
            if not active:raise ValueError('Close without introduced')
            closed.add(kind)
            if len(closed)>1:raise ValueError('Mixed closing events')
            hit|=start<=target and (target<point if kind=='fixed' else target<=point);active=False
        else:raise ValueError('Unsupported event semantics')
    return hit or (active and start<=target)

def matches(version,entry):
    versions=entry.get('versions',[]);ranges=entry.get('ranges',[])
    if not isinstance(versions,list) or len(versions)>100000 or not all(isinstance(v,str) and len(v)<=256 for v in versions) or not isinstance(ranges,list) or len(ranges)>4096 or not (versions or ranges):raise ValueError('Invalid affected descriptor')
    if version in versions:return True
    # For an explicit list consider SemVer-equivalent build metadata potentially affected.
    if versions:
        try:
            if any(compare(version,v)==0 for v in versions):return True
        except ValueError:raise ValueError('Unsupported enumerated version') from None
    hit=False;unknown=False
    for r in ranges:
        try:hit|=affected_by_range(version,r)
        except ValueError:unknown=True
    if hit:return True
    if unknown:raise ValueError('Range requires review')
    return False

def match_snapshot(path,trusted_sha256,components):
    from scripts.security_scan import read_regular
    if not isinstance(trusted_sha256,str) or not HEX.fullmatch(trusted_sha256):raise ValueError('Trusted advisory SHA-256 required')
    raw=read_regular(path,32*1024**2)
    if hashlib.sha256(raw).hexdigest()!=trusted_sha256:raise ValueError('Advisory snapshot digest mismatch')
    def unique_pairs(pairs):
        result={}
        for k,v in pairs:
            if k in result:raise ValueError('Duplicate JSON key')
            result[k]=v
        return result
    def invalid_constant(_):raise ValueError('Non-finite JSON constant')
    records=json.loads(raw,object_pairs_hook=unique_pairs,parse_constant=invalid_constant)
    if not isinstance(records,list) or not 1<=len(records)<=MAX_RECORDS:raise ValueError('Invalid advisory snapshot')
    index={};seen=set();rows=0
    for record in records:
        if not isinstance(record,dict) or not isinstance(record.get('id'),str) or not ID.fullmatch(record['id']) or record['id'] in seen or not isinstance(record.get('affected'),list) or not record['affected']:raise ValueError('Malformed or duplicate advisory')
        rid=record['id'];seen.add(rid)
        for entry in record['affected']:
            rows+=1
            if rows>MAX_ROWS:raise ValueError('Advisory entry budget')
            if not isinstance(entry,dict) or not isinstance(entry.get('package'),dict):raise ValueError('Advisory package missing')
            pkg=entry['package'];eco,name=pkg.get('ecosystem'),pkg.get('name')
            if not isinstance(eco,str) or not isinstance(name,str) or not name or len(name)>256:raise ValueError('Malformed advisory package')
            index.setdefault((eco,name),[]).append((rid,record.get('withdrawn'),entry))
    hit=set();review=set();checked=set();operations=0;work=0
    for c in components:
        key=(c['ecosystem'],c['name'],c['version'])
        if key in checked:continue
        checked.add(key)
        try:semver(c['version'])
        except ValueError:review.add((*key,'VERSION_UNSUPPORTED'));continue
        for rid,withdrawn,entry in index.get((ECOSYSTEM.get(c['ecosystem']),c['name']),[]):
            operations+=1
            if operations>MAX_ROWS:raise ValueError('Advisory match budget')
            versions=entry.get('versions',[]);ranges=entry.get('ranges',[])
            work+=1+(len(versions) if isinstance(versions,list) else 1)
            if isinstance(ranges,list):
                work+=len(ranges)+sum(len(r['events']) for r in ranges if isinstance(r,dict) and isinstance(r.get('events'),list))
            if work>MAX_MATCH_WORK:raise ValueError('Advisory evaluation work budget')
            evidence=(*key,rid)
            if withdrawn:review.add(evidence);continue
            try:
                if matches(c['version'],entry):hit.add(evidence)
            except ValueError:review.add(evidence)
    def rows_of(s):return [dict(zip(('ecosystem','name','version','id'),r)) for r in sorted(s)]
    return {'status':'MATCHED_SNAPSHOT','sha256':trusted_sha256,'records':len(records),'checked_components':len(checked),'matches':rows_of(hit),'reviews':rows_of(review-hit),'coverage':'Only supplied pinned records; completeness and freshness are not established by the digest'}
