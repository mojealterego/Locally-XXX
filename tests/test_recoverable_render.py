import tempfile
import unittest
from pathlib import Path
from scripts.runtime_control import LocalBackend, RuntimeErrorCode
from scripts.recoverable_render import RenderJob
from test_runtime_control import png


class RenderTests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);self.root=Path(tmp.name)
        self.calls=[];self.failures=0;self.polls=0;self.payload=png(8,8)
        self.backend=LocalBackend(8188,request=self.request,sleep=lambda _:None)
        self.job=RenderJob(self.root/'job',self.backend)
        self.output=self.root/'image.png'
    def request(self,method,path,body=None,limit=0):
        self.calls.append((method,path))
        if path=='/prompt':return {'prompt_id':'abc'}
        if path=='/history/abc':
            self.polls+=1
            if self.failures:self.failures-=1;raise RuntimeErrorCode('TRANSPORT','offline')
            return {'abc':{'status':{'completed':True,'status_str':'success'},'outputs':{'9':{'images':[{'filename':'out.png','subfolder':'','type':'output'}]}}}}
        return self.payload
    def start(self):return self.job.start({'1':{}},self.output,8,8,32,polls=2)
    def test_safe_get_retry(self):
        self.failures=2;result=self.start();self.assertEqual(result['state'],'DONE');self.assertEqual(self.output.read_bytes(),self.payload);self.assertEqual(self.polls,3)
        self.assertEqual(sum(path=='/prompt' for _,path in self.calls),1)
    def test_recover_known_id(self):
        self.failures=5
        with self.assertRaises(RuntimeErrorCode):self.start()
        self.assertEqual(self.job.status()['state'],'ACCEPTED');self.assertFalse(self.output.exists())
        self.failures=0;result=RenderJob(self.root/'job',self.backend).resume(polls=1)
        self.assertEqual(result['state'],'DONE');self.assertEqual(sum(path=='/prompt' for _,path in self.calls),1)
    def test_unknown_submission_never_reposted(self):
        def failure(method,path,body=None,limit=0):self.calls.append((method,path));raise RuntimeErrorCode('TRANSPORT','unknown')
        self.job.backend.request=failure
        with self.assertRaises(RuntimeErrorCode):self.start()
        self.assertEqual(self.job.status()['state'],'UNKNOWN')
        self.job.backend.request=self.request
        with self.assertRaises(RuntimeErrorCode):self.job.resume()
        with self.assertRaises(RuntimeErrorCode):self.start()
        self.assertEqual(self.calls,[('POST','/prompt')])
    def test_corrupt_image_no_publication(self):
        self.payload=b'broken'
        with self.assertRaises(RuntimeErrorCode):self.start()
        self.assertFalse(self.output.exists());self.assertEqual(self.job.status()['state'],'ACCEPTED')
    def test_output_conflict(self):
        self.failures=4
        with self.assertRaises(RuntimeErrorCode):self.start()
        self.output.write_bytes(b'do not overwrite');self.failures=0
        with self.assertRaises(RuntimeErrorCode):self.job.resume()
        self.assertEqual(self.output.read_bytes(),b'do not overwrite')
    def test_done_is_idempotent(self):
        result=self.start();calls=list(self.calls);self.assertEqual(self.job.resume(),result);self.assertEqual(self.calls,calls)
        self.output.write_bytes(b'tampered')
        with self.assertRaises(RuntimeErrorCode):self.job.resume()
    def test_recover_after_link(self):
        from unittest.mock import patch
        original=self.job.save
        def crash(state):
            if state['state']=='DONE':raise KeyboardInterrupt()
            original(state)
        with patch.object(self.job,'save',side_effect=crash):
            with self.assertRaises(KeyboardInterrupt):self.start()
        self.assertTrue(self.output.exists());self.assertEqual(self.job.status()['state'],'READY')
        calls=list(self.calls);self.assertEqual(self.job.resume()['state'],'DONE');self.assertEqual(self.calls,calls)
    def test_wrong_backend_port(self):
        self.failures=4
        with self.assertRaises(RuntimeErrorCode):self.start()
        with self.assertRaises(RuntimeErrorCode):RenderJob(self.root/'job',LocalBackend(9000,request=self.request)).resume()
    def test_unsafe_path(self):
        self.output.symlink_to(self.root/'elsewhere')
        with self.assertRaises(RuntimeErrorCode):self.start()
        self.assertEqual(self.calls,[])
    def test_lock_refuses_concurrent_resume(self):
        with self.job.locked():
            with self.assertRaises(RuntimeErrorCode):RenderJob(self.root/'job',self.backend).resume()
    def test_backend_reported_failure_terminal(self):
        def fail(method,path,body=None,limit=0):
            if path=='/prompt':return {'prompt_id':'abc'}
            return {'abc':{'status':{'status_str':'error','completed':True}}}
        self.job.backend.request=fail
        with self.assertRaises(RuntimeErrorCode):self.start()
        self.assertEqual(self.job.status()['state'],'FAILED')
        with self.assertRaises(RuntimeErrorCode):self.job.resume()
        self.assertFalse(self.output.exists())
