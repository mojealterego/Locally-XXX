import pytest
from oxa_ref.kv_cache import KVPageManager,KVError

def test_prefix_reuse_within_same_tenant():
    m=KVPageManager(3)
    a=m.acquire('tenant','model','tok',[1,2,3],page_count=2)
    b=m.acquire('tenant','model','tok',[1,2,3],page_count=2)
    assert a==b and m.used_pages==2
    m.release(a);assert m.used_pages==2
    m.release(b);assert m.used_pages==0

def test_prefix_not_shared_cross_tenant():
    m=KVPageManager(4)
    a=m.acquire('t1','model','tok',[1],page_count=2)
    b=m.acquire('t2','model','tok',[1],page_count=2)
    assert a!=b and m.used_pages==4

def test_prefix_model_vocab_separation():
    m=KVPageManager(6)
    vals=[m.acquire('t',x,y,[1,2],1) for x,y in [('a','tok1'),('b','tok1'),('a','tok2')]]
    assert len(set(vals))==3

def test_allocation_is_atomic_on_capacity_failure():
    m=KVPageManager(3)
    m.acquire('a','a','a',[1],2)
    with pytest.raises(KVError):m.acquire('b','a','a',[1],2)
    assert m.used_pages==2

def test_invalid_tokens_or_page_count_are_rejected():
    m=KVPageManager(3)
    for tokens,pages in [([-1],1),([2**33],1),([1],0)]:
        with pytest.raises((KVError,ValueError)):m.acquire('t','m','tok',tokens,pages)

def test_release_unknown_raises():
    with pytest.raises(KVError):KVPageManager(1).release('missing')

def test_reference_count_overflow_rejected():
    m=KVPageManager(4);a=m.acquire('t','m','tok',[1],2)
    m._entries[a].references=(2**31-1)
    with pytest.raises(KVError,match='reference'):m.acquire('t','m','tok',[1],2)

def test_empty_identity_rejected():
    m=KVPageManager(3)
    with pytest.raises(KVError):m.acquire('','m','tok',[1],1)
