"""Ownership ledger for immutable KV block reservations, not a real KV engine.

Reference counting and prefix identities are process-local. Multi-process access
must be protected by a transactional store and remote cache authorization.
"""
from __future__ import annotations
from dataclasses import dataclass
import hashlib, json

class KVError(RuntimeError):pass

@dataclass
class _Entry:
    pages:int
    references:int

class KVPageManager:
    def __init__(self,capacity_pages:int):
        if capacity_pages<1:raise ValueError('capacity must be positive')
        self.capacity_pages=capacity_pages
        self._entries:dict[str,_Entry]={}
        self.used_pages=0

    def acquire(self,tenant:str,model:str,tokenizer:str,tokens:list[int],page_count:int)->str:
        if not all(isinstance(x,str) and 0<len(x)<=256 for x in (tenant,model,tokenizer)):
            raise KVError('invalid identity')
        if not isinstance(page_count,int) or page_count<1:raise KVError('invalid pages')
        if not isinstance(tokens,list) or not all(type(t) is int and 0<=t<=2**32-1 for t in tokens):
            raise KVError('invalid token sequence')
        blob=json.dumps([tenant,model,tokenizer,tokens,page_count],separators=(',',':'),ensure_ascii=True).encode()
        key=hashlib.sha256(b'OXA-KV-1\0'+blob).hexdigest()
        if key in self._entries:
            entry=self._entries[key]
            if entry.references>=2**31-1:raise KVError('reference limit exceeded')
            entry.references+=1;return key
        if page_count>self.capacity_pages-self.used_pages:raise KVError('insufficient KV capacity')
        self._entries[key]=_Entry(page_count,1)
        self.used_pages+=page_count
        return key

    def release(self,key:str):
        entry=self._entries.get(key)
        if entry is None:raise KVError('unknown KV lease')
        entry.references-=1
        if entry.references==0:
            self.used_pages-=entry.pages
            del self._entries[key]
