import json
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
from PIL import Image
from scripts.managed_gpu import managed_tiled, cancel_queued, GpuAdmission, request_stop
from scripts.resource_broker import Broker
from scripts.runtime_control import RuntimeErrorCode, LocalBackend, MIB
from scripts.recoverable_render import RenderJob
from scripts.tiled_upscale import TiledJob

class ManagedTests(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);self.root=Path(t.name)
        self.now=[0];self.broker=Broker(self.root/'broker',clock=lambda:self.now[0],boot=lambda:'boot',alive=lambda _:True)
        self.broker.sample(10000,38000);self.calls=[];self.prompts={};self.free=4096*MIB;self.running=[];self.pending=[];self.history={};self.fail_delete=False
        self.backend=LocalBackend(8188,request=self.req,sleep=lambda _:None)
        self.source=self.root/'source.png';Image.new('RGB',(96,64),(12,34,56)).save(self.source)
        self.model=self.root/'m.pth';self.model.write_bytes(b'model');self.output=self.root/'out.png'
        self.job=TiledJob(self.root/'job',self.backend);self.hot_after_first=False;self.stop_after_first=False
    def req(self,method,path,body=None,limit=0):
        self.calls.append((method,path,body))
        if path=='/system_stats':return {'devices':[{'type':'cuda','index':0,'vram_total':8192*MIB,'vram_free':self.free}]}
        if path=='/queue':
            if method=='GET':return {'queue_running':[[0,x] for x in self.running],'queue_pending':[[0,x] for x in self.pending]}
            if self.fail_delete:raise RuntimeErrorCode('TRANSPORT','lost reply')
            self.pending=[x for x in self.pending if x not in body['delete']];return None
        if path=='/prompt':
            pid=str(len(self.prompts)+1);self.prompts[pid]=body['prompt'];return {'prompt_id':pid}
        if path.startswith('/history/'):
            pid=path.split('/')[-1]
            if pid in self.history:return {pid:self.history[pid]}
            if pid not in self.prompts:return {}
            return {pid:{'status':{'completed':True,'status_str':'success'},'outputs':{'5':{'images':[{'filename':pid+'.png','subfolder':'','type':'output'}]}}}}
        if 'type=input' in path:return self.source.read_bytes()
        from urllib.parse import parse_qs,urlsplit
        import io
        pid=parse_qs(urlsplit(path).query)['filename'][0][:-4];c=self.prompts[pid]['2']['inputs'];b=io.BytesIO();Image.new('RGB',(c['width']*4,c['height']*4),(12,34,56)).save(b,format='PNG')
        if self.hot_after_first:self.broker.sample(10000,43000)
        if self.stop_after_first:request_stop(self.job.root,self.backend)
        return b.getvalue()
    def run_job(self):return managed_tiled(self.job,self.broker,2048,'cuda',0,1024,self.source,self.model,self.output,4,128,16,64,owner='test',clock=lambda:self.now[0],sleep=lambda n:self.now.__setitem__(0,self.now[0]+n),wait=1)
    def posts(self):return [c for c in self.calls if c[:2]==('POST','/prompt')]
    def test_integrated_success(self):
        r=self.run_job();self.assertEqual(r['state'],'DONE');self.assertGreater(len(self.posts()),1);self.assertEqual(self.broker.status()['reserved_mib'],0)
        self.assertEqual(len([c for c in self.calls if c[:2]==('GET','/system_stats')]),len(self.posts()))
    def test_low_vram_before_first_prompt(self):
        self.free=5*MIB
        r=self.run_job();self.assertEqual((r['state'],r['reason']),('PAUSED','VRAM'));self.assertFalse(self.posts());self.assertFalse((self.job.root/'tile-000-000'/'state.json').exists());self.assertFalse(self.output.exists());self.assertEqual(self.broker.status()['reserved_mib'],0)
        self.free=4096*MIB;self.assertEqual(self.run_job()['state'],'DONE')
    def test_hot_between_tiles(self):
        self.hot_after_first=True
        r=self.run_job();self.assertEqual((r['state'],r['reason']),('PAUSED','ADMISSION'));self.assertEqual(len(self.posts()),1);self.assertFalse(self.output.exists());self.assertEqual(self.broker.status()['reserved_mib'],0)
        self.hot_after_first=False;self.broker.sample(10000,38000);self.assertEqual(self.run_job()['state'],'DONE');self.assertEqual(len(self.posts()),6)
    def test_stale_sample_denied(self):
        t=self.broker.enqueue(2048,'test');self.assertTrue(self.broker.admit(t,'test'));self.now[0]=11
        with self.assertRaises(RuntimeErrorCode):self.broker.check_active(t,'test')
    def test_managed_journal_not_resumable_unmanaged(self):
        self.free=5*MIB
        self.assertEqual(self.run_job()['state'],'PAUSED')
        self.free=4096*MIB
        with self.assertRaises(RuntimeErrorCode):self.job.run(self.source,self.model,self.output,4,128,16,64)
        self.assertFalse(self.posts())
    def test_stop_between_tiles(self):
        self.stop_after_first=True
        r=self.run_job();self.assertEqual((r['state'],r['reason']),('PAUSED','STOPPED'));self.assertEqual(len(self.posts()),1);self.assertFalse(self.output.exists());self.assertEqual(self.broker.status()['reserved_mib'],0)
        with self.assertRaises(RuntimeErrorCode):self.run_job()
    def test_gpu_shape_fail_closed(self):
        for value in ({'devices':[]},{'devices':[{'type':'cuda','index':0,'vram_total':100,'vram_free':101}]},{'devices':[{'type':'cuda','index':0,'vram_total':8192*MIB,'vram_free':True}]}):
            self.backend.request=lambda *a,**k:value
            with self.assertRaises(RuntimeErrorCode):GpuAdmission(self.backend,'cuda',0,1).check()
    def render_journal(self):
        r=RenderJob(self.root/'render',self.backend);r.save({'state':'ACCEPTED','port':8188,'prompt_id':'mine'});return r
    def test_cancel_only_owned_pending(self):
        r=self.render_journal();self.pending=['mine','other'];result=cancel_queued(r)
        self.assertEqual(result['state'],'CANCEL_UNCONFIRMED');self.assertEqual(self.pending,['other']);self.assertEqual([x[2] for x in self.calls if x[0]=='POST'],[{'delete':['mine']}]);cancel_queued(r);self.assertEqual(len([x for x in self.calls if x[0]=='POST']),1)
        with self.assertRaises(RuntimeErrorCode):r.resume()
    def test_cancel_running_refused(self):
        r=self.render_journal();self.running=['mine'];self.pending=['other']
        with self.assertRaises(RuntimeErrorCode):cancel_queued(r)
        self.assertFalse([x for x in self.calls if x[0]=='POST']);self.assertEqual(r.status()['state'],'ACCEPTED')
    def test_cancel_unknown_no_replay(self):
        r=self.render_journal();self.pending=['mine'];self.fail_delete=True
        with self.assertRaises(RuntimeErrorCode):cancel_queued(r)
        self.assertEqual(r.status()['state'],'CANCEL_UNKNOWN');self.fail_delete=False;cancel_queued(r);self.assertEqual(len([x for x in self.calls if x[0]=='POST']),1)
    def test_queue_malformed_refused(self):
        r=self.render_journal();self.backend.request=lambda *a,**k:{'queue_pending':[[1,'mine']]}
        with self.assertRaises(RuntimeErrorCode):cancel_queued(r)
        self.assertEqual(r.status()['state'],'ACCEPTED')
    def test_real_empty_http_queue_response(self):
        messages=[]
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                messages.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))));self.send_response(200);self.end_headers()
            def log_message(self,*a):pass
        server=HTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();self.addCleanup(server.server_close);self.addCleanup(server.shutdown)
        self.assertIsNone(LocalBackend(server.server_port).request('POST','/queue',{'delete':['mine']}));self.assertEqual(messages,[{'delete':['mine']}])
    def test_ambiguous_prompt_retains_lease(self):
        original=self.backend.request
        def fail(method,path,body=None,limit=0):
            if path=='/prompt':raise RuntimeErrorCode('TRANSPORT','uncertain POST')
            return original(method,path,body,limit)
        self.backend.request=fail
        with self.assertRaises(RuntimeErrorCode):self.run_job()
        self.assertEqual(self.broker.status()['reserved_mib'],2048);self.assertEqual(self.broker.status()['jobs'][-1]['state'],'ORPHANED');self.assertEqual(RenderJob(self.job.root/'tile-000-000',self.backend).status()['state'],'UNKNOWN')
    def test_cancel_race_to_running_never_interrupts(self):
        r=self.render_journal();self.pending=['mine','other'];original=self.backend.request
        def raced(method,path,body=None,limit=0):
            if method=='POST':self.running=['mine'];self.pending=['other']
            return original(method,path,body,limit)
        self.backend.request=raced;self.assertEqual(cancel_queued(r)['state'],'CANCEL_UNKNOWN');self.assertEqual([x[2] for x in self.calls if x[0]=='POST'],[{'delete':['mine']}]);self.assertNotIn('/interrupt',[x[1] for x in self.calls])
    def test_cancel_crash_before_result_never_replays(self):
        r=self.render_journal();self.pending=['mine'];state=r.status();state['state']='CANCELLING';r.save(state)
        self.assertEqual(cancel_queued(r)['state'],'CANCELLING');self.assertFalse(self.calls)
    def test_terminal_history_after_delete(self):
        r=self.render_journal();self.pending=['mine'];self.history['mine']={'status':{'completed':True,'status_str':'success'}}
        self.assertEqual(cancel_queued(r)['state'],'CANCEL_TERMINAL')
