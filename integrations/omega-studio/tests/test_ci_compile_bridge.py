import hashlib
import tempfile
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ci_compile_bridge import compile_snapshot


def request(files=None, **changes):
    return {'operation':'ci-compile','approved':True,'files':files if files is not None else [{'name':'main.py','source':'def f():\n    return 42\n'}], **changes}


class CICompileTests(unittest.TestCase):
    def test_ci01_native_compile_and_receipt(self):
        r = compile_snapshot(request())
        self.assertEqual(r['status'],'PASS')
        self.assertEqual(r['returncode'],0)
        self.assertTrue(r['approval_verified'])
        self.assertEqual(r['files'][0]['sha256'],hashlib.sha256(b'def f():\n    return 42\n').hexdigest())
        self.assertFalse(r['source_executed'])
        self.assertFalse(r['tests_executed'])

    def test_ci02_syntax_failure(self):
        r = compile_snapshot(request([{'name':'bad.py','source':'if:\n'}]))
        self.assertEqual(r['status'],'FAIL')
        self.assertNotEqual(r['returncode'],0)
        self.assertIn('SyntaxError',r['stdout']+r['stderr'])

    def test_ci03_no_module_shadowing_or_source_execution(self):
        with tempfile.TemporaryDirectory() as d:
            marker = str(Path(d)/'executed')
            payload = f'from pathlib import Path\nPath({marker!r}).touch()\nraise RuntimeError("never execute")\n'
            r = compile_snapshot(request([{'name':'compileall.py','source':payload},{'name':'sitecustomize.py','source':payload},{'name':'main.py','source':payload}]))
            self.assertEqual(r['status'],'PASS')
            self.assertFalse(Path(marker).exists())

    def test_ci04_strict_approval_and_names(self):
        for v in [request(approved=False),request(approved=1),request(command=['python','-c','x']),request([{'name':'../a.py','source':'x=1'}]),request([{'name':'a.py','source':'x=1'},{'name':'A.py','source':'x=2'}]),request([{'name':'CON.py','source':'x=1'}]),request([]),request([{'name':'a.py','source':'x'*24577}])]:
            with self.subTest(v=str(v)[:120]),self.assertRaises(ValueError): compile_snapshot(v)

    def test_ci05_ephemeral_snapshot_and_deterministic_source_manifest(self):
        a={'name':'b.py','source':'b=2'};b={'name':'a.py','source':'a=1'}
        x=compile_snapshot(request([a,b]));y=compile_snapshot(request([b,a]))
        self.assertEqual(x['snapshot_sha256'],y['snapshot_sha256'])
        self.assertEqual(x['files'],y['files'])
        self.assertNotEqual(x['snapshot_sha256'],compile_snapshot(request([a,{**b,'source':'a=3'}]))['snapshot_sha256'])
        self.assertFalse(x['persistent_approval'])


if __name__=='__main__': unittest.main()
