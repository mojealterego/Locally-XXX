"""Reference implementation of signed, bounded OXA1 *data* bundles.

NOT executable binaries, GPU kernels or proof of license rights.
Production policy must verify an externally trusted Ed25519 public key.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import tempfile
from typing import Mapping
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

MAGIC=b"OXA1"
MAX_MANIFEST_BYTES=1024*1024
MAX_ARTIFACTS=64
MAX_NAME_BYTES=120
MAX_FILE_BYTES=1<<44  # policy guard, not a promise the disk has space
CHUNK=1024*1024
IDENT=re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$")
class OxaError(ValueError):
    pass

def _dump(obj:object)->bytes:
    return json.dumps(obj,ensure_ascii=True,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf-8')

def _reject_duplicate_pairs(pairs):
    result={}
    for k,v in pairs:
        if k in result:raise OxaError('duplicate JSON property')
        result[k]=v
    return result

def _validate_manifest(m):
    if not isinstance(m,dict) or set(m)!={'format','profile','artifacts'} or m['format']!='oxa.v1':
        raise OxaError('unsupported manifest format')
    if not isinstance(m['profile'],str) or not IDENT.fullmatch(m['profile']):raise OxaError('invalid profile')
    a=m['artifacts']
    if not isinstance(a,list) or not (1<=len(a)<=MAX_ARTIFACTS):raise OxaError('invalid artifact count')
    seen=set()
    for entry in a:
        if not isinstance(entry,dict) or set(entry)!={'name','size','sha256'}:raise OxaError('invalid artifact fields')
        name=entry['name']
        if not isinstance(name,str) or not IDENT.fullmatch(name):raise OxaError('invalid artifact name')
        if name.casefold() in seen:raise OxaError('duplicate artifact names')
        seen.add(name.casefold())
        s=entry['size']
        if type(s) is not int or not (0<=s<=MAX_FILE_BYTES):raise OxaError('invalid artifact size')
        h=entry['sha256']
        if not isinstance(h,str) or not re.fullmatch('[0-9a-f]{64}',h):raise OxaError('invalid SHA256 digest')
    return m

def _new_staging(dst:Path)->Path:
    fd,name=tempfile.mkstemp(prefix='.oxa-staging-',dir=str(dst.parent))
    os.close(fd)
    return Path(name)

def pack(destination:Path|str,artifacts:Mapping[str,Path|str],private_key:Ed25519PrivateKey,profile='host-cpu')->dict:
    """Atomic staging. Build manifest from staged bytes, not moving input sources."""
    dest=Path(destination)
    if dest.exists():raise OxaError('destination already exists')
    if dest.is_symlink():raise OxaError('destination symlink')
    dest.parent.mkdir(parents=True,exist_ok=True)
    if not isinstance(private_key,Ed25519PrivateKey):raise OxaError('missing private signing key')
    staged=[];target=None
    try:
        if not 1<=len(artifacts)<=MAX_ARTIFACTS:raise OxaError('invalid artifact count')
        entries=[]
        for name,path in sorted(artifacts.items(),key=lambda item:item[0]):
            staged_path=_new_staging(dest);staged.append(staged_path)
            digest=hashlib.sha256();size=0
            with Path(path).open('rb') as src, staged_path.open('wb') as out:
                while part:=src.read(CHUNK):
                    size+=len(part)
                    if size>MAX_FILE_BYTES:raise OxaError('file too large')
                    digest.update(part);out.write(part)
                out.flush();os.fsync(out.fileno())
            entries.append({'name':name,'size':size,'sha256':digest.hexdigest()})
        m=_validate_manifest({'format':'oxa.v1','profile':profile,'artifacts':entries})
        raw=_dump(m)
        if len(raw)>MAX_MANIFEST_BYTES:raise OxaError('manifest too large')
        header=MAGIC+struct.pack('<I',len(raw))+raw
        sig=private_key.sign(hashlib.sha256(header).digest())
        target=_new_staging(dest)
        with target.open('wb') as out:
            out.write(header)
            for path in staged:
                with path.open('rb') as src:shutil.copyfileobj(src,out,CHUNK)
            out.write(sig);out.flush();os.fsync(out.fileno())
        # Hard link ensures exclusive create and doesn't overwrite another writer's file.
        os.link(target,dest)
        return m
    except (OSError,ValueError) as exc:
        if isinstance(exc,OxaError):raise
        raise OxaError(f'packing failure: {type(exc).__name__}') from exc
    finally:
        for path in staged+([target] if target else []):
            try:path.unlink(missing_ok=True)
            except OSError:pass

def verify(path:Path|str,trusted_public_key:Ed25519PublicKey)->dict:
    if not isinstance(trusted_public_key,Ed25519PublicKey):raise OxaError('external trust anchor required')
    with Path(path).open('rb') as f:
        if f.read(4)!=MAGIC:raise OxaError('bad OXA magic')
        rawlen=f.read(4)
        if len(rawlen)!=4:raise OxaError('truncated header')
        size=struct.unpack('<I',rawlen)[0]
        if not 0<size<=MAX_MANIFEST_BYTES:raise OxaError('invalid manifest length')
        raw=f.read(size)
        if len(raw)!=size:raise OxaError('truncated manifest')
        try:m=_validate_manifest(json.loads(raw,object_pairs_hook=_reject_duplicate_pairs))
        except (ValueError,TypeError,UnicodeDecodeError) as e:raise OxaError('invalid manifest JSON') from e
        if raw!=_dump(m):raise OxaError('non-canonical manifest')
        # Verify signature before processing big payloads: signature is at the exact
        # offset declared by signed manifest, not the final bytes of an oversized file.
        total=sum(e['size'] for e in m['artifacts'])
        signature_offset=8+size+total
        if signature_offset+64!=Path(path).stat().st_size:
            if Path(path).stat().st_size>signature_offset+64:raise OxaError('trailing bytes after signature')
            raise OxaError('truncated payload or signature')
        f.seek(signature_offset)
        signature=f.read(64)
        try:trusted_public_key.verify(signature,hashlib.sha256(MAGIC+rawlen+raw).digest())
        except InvalidSignature as exc:raise OxaError('signature invalid') from exc
        f.seek(8+size)
        for e in m['artifacts']:
            sha=hashlib.sha256();remaining=e['size']
            while remaining:
                buf=f.read(min(CHUNK,remaining))
                if not buf:raise OxaError('truncated payload')
                sha.update(buf);remaining-=len(buf)
            if sha.hexdigest()!=e['sha256']:raise OxaError('payload digest mismatch')
        return m
