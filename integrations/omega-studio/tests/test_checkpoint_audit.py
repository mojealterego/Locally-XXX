import hashlib
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from checkpoint_audit import inspect_checkpoint


def container(header, payload):
    raw = json.dumps(header, separators=(',', ':')).encode()
    raw += b' ' * (-len(raw) % 8)
    return struct.pack('<Q', len(raw)) + raw + payload


class CheckpointAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.name = 'adapter.safetensors'
        self.header = {'__metadata__': {'base_model_sha256': 'a'*64, 'lora_alpha': '4'},
                       'layer.lora_A.weight': {'dtype':'F32','shape':[2,3],'data_offsets':[0,24]},
                       'layer.lora_B.weight': {'dtype':'F32','shape':[4,2],'data_offsets':[24,56]}}
        self.data = container(self.header, b'\0'*56)
        (self.root/self.name).write_bytes(self.data)

    def inspect(self, **changes):
        return inspect_checkpoint({**{'operation':'checkpoint-audit','name':self.name,'mode':'lora','hash':True}, **changes}, str(self.root))

    def test_ckpt01_real_file_and_lora(self):
        r = self.inspect()
        self.assertEqual(r['sha256'], hashlib.sha256(self.data).hexdigest())
        self.assertEqual(r['tensor_count'], 2)
        self.assertEqual(r['lora']['pair_count'], 1)
        self.assertEqual(r['lora']['rank_histogram'], {'2':1})
        self.assertEqual(r['lora']['base_compatibility'], 'UNVERIFIED')
        self.assertFalse(r['lora']['eligible_for_automatic_merge'])
        self.assertFalse(r['weights_loaded'])
        self.assertEqual((self.root/self.name).read_bytes(), self.data)

    def test_ckpt02_header_without_hash(self):
        r = self.inspect(mode='container', hash=False)
        self.assertIsNone(r['sha256'])
        self.assertEqual(r['payload_bytes'], 56)
        self.assertNotIn('lora', r)

    def test_ckpt03_invalid_offsets_and_unpaired_lora(self):
        self.header['layer.lora_B.weight']['data_offsets'] = [20,52]
        (self.root/self.name).write_bytes(container(self.header,b'\0'*56))
        with self.assertRaises(ValueError): self.inspect()
        del self.header['layer.lora_B.weight']
        (self.root/self.name).write_bytes(container(self.header,b'\0'*24))
        self.assertEqual(self.inspect(mode='container')['tensor_count'],1)
        with self.assertRaises(ValueError): self.inspect()

    def test_ckpt04_path_and_links(self):
        for name in ['../adapter.safetensors','/tmp/adapter.safetensors','x/adapter.safetensors','a\\b.safetensors','a.gguf']:
            with self.subTest(name=name), self.assertRaises(ValueError): self.inspect(name=name)
        (self.root/'link.safetensors').symlink_to(self.root/self.name)
        with self.assertRaises(ValueError): self.inspect(name='link.safetensors')
        os.link(self.root/self.name,self.root/'hard.safetensors')
        with self.assertRaises(ValueError): self.inspect()

    def test_ckpt05_configuration_and_strict_schema(self):
        for change in [dict(hash=1),dict(mode='merge'),dict(path='/tmp'),dict(name=7)]:
            with self.subTest(change=change), self.assertRaises(ValueError): self.inspect(**change)
        with self.assertRaises(ValueError): inspect_checkpoint({'operation':'checkpoint-audit','name':self.name,'mode':'container','hash':False},None)
        self.root.chmod(0o777)
        try:
            with self.assertRaises(ValueError): self.inspect()
        finally: self.root.chmod(0o700)

    def test_ckpt06_hash_limit_sparse_file(self):
        size=64*1024*1024+8
        raw=container({'large':{'dtype':'U8','shape':[size],'data_offsets':[0,size]}},b'')
        with (self.root/self.name).open('wb') as f:
            f.write(raw); f.truncate(len(raw)+size)
        self.assertEqual(self.inspect(mode='container',hash=False)['payload_bytes'],size)
        with self.assertRaises(ValueError): self.inspect(mode='container',hash=True)


if __name__=='__main__': unittest.main()
