import pytest
from oxa_ref.router import Backend, Request, RouteError, choose_backend

LOCAL=Backend('llama-android','local','android-arm64',frozenset({'gguf'}),2500,grammar=True,price_micro_usd=0,ttft_p95_ms=500)
SERVER=Backend('vllm-hpc','remote','cuda',frozenset({'safetensors','gguf'}),24000,grammar=True,price_micro_usd=500,ttft_p95_ms=350)
NOGR=Backend('server-bad','remote','cuda',frozenset({'gguf'}),24000,grammar=False,price_micro_usd=200,ttft_p95_ms=100)

def test_offline_cannot_route_to_remote():
    assert choose_backend(Request(mode='OFFLINE',format='gguf',required_mib=2000,tenant='t'),[SERVER,LOCAL]).id=='llama-android'

def test_offline_rejects_if_local_cannot_fit():
    with pytest.raises(RouteError,match='no eligible'):
        choose_backend(Request(mode='OFFLINE',format='gguf',required_mib=4000,tenant='t'),[SERVER,LOCAL])

def test_remote_requires_explicit_consent():
    with pytest.raises(RouteError,match='no eligible'):
        choose_backend(Request(mode='HYBRID',format='safetensors',required_mib=2000,tenant='t'),[SERVER])

def test_remote_consent_enables():
    r=Request(mode='HYBRID',format='safetensors',required_mib=2000,tenant='t',cloud_consent=True)
    assert choose_backend(r,[SERVER]).id=='vllm-hpc'

def test_confidential_data_cannot_leave_local_even_with_consent():
    r=Request(mode='HYBRID',format='safetensors',required_mib=2000,tenant='t',cloud_consent=True,classification='secret')
    with pytest.raises(RouteError):choose_backend(r,[SERVER])

def test_grammar_requirement():
    r=Request(mode='CLOUD_HPC',format='gguf',required_mib=2000,tenant='t',cloud_consent=True,requires_grammar=True)
    assert choose_backend(r,[NOGR,SERVER]).id=='vllm-hpc'

def test_tenant_policy():
    only=Backend('restricted','remote','cuda',frozenset({'gguf'}),24000,True,1,10,frozenset({'x'}))
    with pytest.raises(RouteError):choose_backend(Request('HYBRID','gguf',10,'y',cloud_consent=True),[only])

def test_deterministic_tiebreak():
    x=Backend('z','local','cpu',frozenset({'gguf'}),2500,True,0,300)
    y=Backend('a','local','cpu',frozenset({'gguf'}),2500,True,0,300)
    assert choose_backend(Request('OFFLINE','gguf',100,'t'),[x,y]).id=='a'

def test_rejects_invalid_modes_and_negative_budget():
    with pytest.raises(ValueError):Request('MAGIC','gguf',100,'t')
    with pytest.raises(ValueError):Request('OFFLINE','gguf',-100,'t')

def test_budget_and_latency_limits():
    r=Request('HYBRID','safetensors',2000,'t',cloud_consent=True,max_price_micro_usd=200)
    with pytest.raises(RouteError):choose_backend(r,[SERVER])
    r=Request('HYBRID','safetensors',2000,'t',cloud_consent=True,max_ttft_p95_ms=300)
    with pytest.raises(RouteError):choose_backend(r,[SERVER])

def test_cloud_hpc_mode_requires_remote_backend():
    r=Request('CLOUD_HPC','gguf',100,'t',cloud_consent=True)
    assert choose_backend(r,[LOCAL,SERVER]).id=='vllm-hpc'
    with pytest.raises(RouteError):choose_backend(r,[LOCAL])
