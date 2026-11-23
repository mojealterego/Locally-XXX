import json
from pathlib import Path
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from oxa_ref.archive import pack, verify, OxaError, MAX_MANIFEST_BYTES

@pytest.fixture
def keys():
    sk=Ed25519PrivateKey.generate()
    return sk,sk.public_key()

def test_roundtrip_multifile_and_stable_manifest(tmp_path, keys):
    a=tmp_path/'a.gguf'; a.write_bytes(b'GGUF'+bytes(range(50)))
    b=tmp_path/'b.bin'; b.write_bytes(b'payload'*12000)
    p=tmp_path/'model.oxa'; sk,pk=keys
    pack(p, {'model.gguf':a,'projector.bin':b}, sk, profile='android-arm64')
    info=verify(p,pk)
    assert info['profile']=='android-arm64'
    assert info['artifacts'][0]['name']=='model.gguf'
    assert info['artifacts'][1]['size']==b.stat().st_size

def test_signature_must_be_checked_against_external_trust_anchor(tmp_path, keys):
    f=tmp_path/'a';f.write_bytes(b'123'); sk,pk=keys
    pack(tmp_path/'x.oxa',{'weights':f},sk)
    with pytest.raises(OxaError,match='signature'):
        verify(tmp_path/'x.oxa',Ed25519PrivateKey.generate().public_key())

def test_tampered_payload_detected(tmp_path, keys):
    f=tmp_path/'a';f.write_bytes(b'payload');sk,pk=keys;p=tmp_path/'x.oxa'
    pack(p,{'weights':f},sk)
    data=bytearray(p.read_bytes());data[-65]^=1;p.write_bytes(data)
    with pytest.raises(OxaError,match='digest'):
        verify(p,pk)

def test_tampered_manifest_detected(tmp_path, keys):
    f=tmp_path/'a';f.write_bytes(b'hello');sk,pk=keys;p=tmp_path/'x.oxa'
    pack(p,{'weights':f},sk)
    data=bytearray(p.read_bytes());data[15]^=1;p.write_bytes(data)
    with pytest.raises(OxaError):verify(p,pk)

def test_truncated_and_trailing_rejected(tmp_path, keys):
    f=tmp_path/'a';f.write_bytes(b'data');sk,pk=keys;p=tmp_path/'x.oxa'
    pack(p,{'weights':f},sk);original=p.read_bytes()
    p.write_bytes(original[:-10]);
    with pytest.raises(OxaError):verify(p,pk)
    p.write_bytes(original+b'extra');
    with pytest.raises(OxaError,match='trailing'):verify(p,pk)

def test_path_traversal_and_duplicate_names_rejected(tmp_path,keys):
    f=tmp_path/'a';f.write_bytes(b'1');sk,_=keys
    for name in ['../xx','/etc/passwd','evil/name','']: 
        with pytest.raises(OxaError):pack(tmp_path/'x.oxa',{name:f},sk)
    with pytest.raises(OxaError):pack(tmp_path/'x.oxa',{'X':f,'x':f},sk)

def test_empty_artifacts_fail_closed(tmp_path,keys):
    with pytest.raises(OxaError):pack(tmp_path/'x.oxa',{},keys[0])

def test_manifest_length_limit_before_allocation(tmp_path,keys):
    p=tmp_path/'x.oxa';p.write_bytes(b'OXA1'+(MAX_MANIFEST_BYTES+1).to_bytes(4,'little'))
    with pytest.raises(OxaError,match='manifest length'):verify(p,keys[1])

def test_magic_rejects(tmp_path,keys):
    p=tmp_path/'x.oxa';p.write_bytes(b'ZIP!')
    with pytest.raises(OxaError,match='magic'):verify(p,keys[1])

def test_failed_pack_does_not_leave_destination(tmp_path,keys):
    with pytest.raises(Exception):pack(tmp_path/'x.oxa',{'weights':tmp_path/'missing'},keys[0])
    assert not (tmp_path/'x.oxa').exists()
