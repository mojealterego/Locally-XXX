"""Temporary in-memory demo key. Never store demo keys in production repositories."""
from pathlib import Path
from tempfile import TemporaryDirectory
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from oxa_ref.archive import pack,verify

with TemporaryDirectory() as d:
    root=Path(d)
    weights=root/'example-small-weights.bin'
    weights.write_bytes(b'OXA-DEMO-NOT-A-REAL-MODEL\n')
    sk=Ed25519PrivateKey.generate()
    created=pack(root/'demo.oxa',{'weights.bin':weights},sk,profile='test-host')
    trusted=sk.public_key()   # obtained out-of-band in an actual deployment
    verified=verify(root/'demo.oxa',trusted)
    assert created==verified
    print('OXA1 signature, manifest and payload verified:',verified['profile'])
