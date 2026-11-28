import base64
import hashlib
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from memory_bridge import memory_operation
from omega_actions.ultimate.streamer import WindowedReader


class MemoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'memory.bin'
        self.data = bytes(range(251)) * 800
        self.source.write_bytes(self.data)
        self.source.chmod(0o600)

    def index(self):
        return memory_operation({'operation':'memory-index','approved':True},str(self.root))

    def read(self, offset=65530, length=32):
        return memory_operation({'operation':'memory-read','approved':True,'offset':offset,'length':length},str(self.root))

    def test_mem01_index_and_cross_block_read(self):
        r = self.index()
        self.assertEqual(r['blocks'],4)
        self.assertEqual(r['sha256'],hashlib.sha256(self.data).hexdigest())
        b = self.read()
        self.assertEqual(base64.b64decode(b['base64']),self.data[65530:65562])
        self.assertEqual(b['sha256'],hashlib.sha256(self.data[65530:65562]).hexdigest())
        self.assertEqual(self.source.read_bytes(),self.data)
        with sqlite3.connect(self.root/'memory.sqlite') as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM blocks').fetchone()[0],4)

    def test_mem02_missing_index_and_changed_content(self):
        with self.assertRaises(ValueError): self.read()
        self.index()
        s = self.source.stat()
        with self.source.open('r+b') as f:
            f.seek(65531); f.write(b'X')
        os.utime(self.source, ns=(s.st_atime_ns,s.st_mtime_ns))
        with self.assertRaises(ValueError): self.read()
        self.index()
        self.assertEqual(base64.b64decode(self.read()['base64'])[1:2],b'X')

    def test_mem03_invalid_schema_and_limits(self):
        for v in [{'operation':'memory-index','approved':False}, {'operation':'memory-index','approved':True,'path':'/etc/passwd'}, {'operation':'memory-read','approved':True,'offset':0,'length':4097}, {'operation':'memory-read','approved':True,'offset':True,'length':1}]:
            with self.subTest(v=v),self.assertRaises(ValueError): memory_operation(v,str(self.root))
        with self.assertRaises(ValueError): memory_operation({'operation':'memory-index','approved':True},None)
        self.index()
        with self.assertRaises(ValueError): self.read(len(self.data),1)

    def test_mem04_links_and_permissions(self):
        other = self.root/'other.bin'
        self.source.rename(other)
        self.source.symlink_to(other)
        with self.assertRaises(ValueError): self.index()
        self.source.unlink(); other.rename(self.source)
        self.root.chmod(0o755)
        try:
            with self.assertRaises(ValueError): self.index()
        finally: self.root.chmod(0o700)
        (self.root/'memory.sqlite').symlink_to(self.source)
        with self.assertRaises(ValueError): self.index()

    def test_mem05_truncation_safe(self):
        with WindowedReader(self.source,window_size=4096) as r:
            self.source.write_bytes(b'')
            with self.assertRaises(ValueError): r.read_at(0,4096)

    def test_mem07_lock_contention(self):
        import fcntl
        with (self.root/'memory.lock').open('wb') as lock:
            os.chmod(lock.name,0o600)
            fcntl.flock(lock,fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(ValueError): self.index()
        self.assertEqual(self.index()['blocks'],4)

    def test_mem06_quota_and_index_tamper(self):
        self.index()
        with sqlite3.connect(self.root/'memory.sqlite') as db:
            db.execute("UPDATE blocks SET sha256=? WHERE number=1",('0'*64,))
        with self.assertRaises(ValueError): self.read()
        with self.source.open('wb') as f: f.truncate(64*1024*1024+1)
        with self.assertRaises(ValueError): self.index()


if __name__=='__main__': unittest.main()
