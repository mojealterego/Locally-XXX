import os
from pathlib import Path
import socket
import sys
import tempfile
import unittest
from scripts.native_acceptance import verify_signer, validate_manifest, lifecycle_check
from scripts.backend_supervisor import OwnedBackend
from scripts.runtime_control import RuntimeErrorCode, build_runtime
import test_runtime_control as runtime_fixture

PIN='ab'*32

class NativeAcceptance(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);self.root=Path(t.name)
    def test_signer_matches_only_pinned_cert(self):
        self.assertEqual(verify_signer('Signer #1 certificate SHA-256 digest: '+PIN+'\n',PIN),PIN)
        for value in ('', 'Signer #1 certificate SHA-256 digest: '+'ef'*32, 'Signer #1 certificate SHA-256 digest: '+PIN+'\nSigner #2 certificate SHA-256 digest: '+PIN):
            with self.assertRaises(RuntimeErrorCode):verify_signer(value,PIN)
    def manifest(self,extra='',activity='android:exported="true"'):
        return '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.app"><uses-permission android:name="android.permission.INTERNET"/>'+extra+'<application android:debuggable="false"><activity android:name=".MainActivity" '+activity+'><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>'
    def test_manifest_pinned_component(self):
        self.assertEqual(validate_manifest(self.manifest(),'com.example.app'),'com.example.app/.MainActivity')
        with self.assertRaises(RuntimeErrorCode):validate_manifest(self.manifest(),'com.other.app')
    def test_manifest_unsafe(self):
        for value in (self.manifest('<uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE"/>'),self.manifest().replace('debuggable="false"','debuggable="true"'),self.manifest(activity='android:exported="false"'), '<!DOCTYPE manifest [<!ENTITY x "bad">]>'+self.manifest(),self.manifest().replace('</application>','<provider android:name=".X" android:exported="true"/></application>')):
            with self.assertRaises(RuntimeErrorCode):validate_manifest(value,'com.example.app')
    def test_lifecycle_kills_only_target_then_restarts(self):
        calls=[];pids=iter(['101','','102','']);
        def adb(args):
            calls.append(args)
            if args==['shell','getprop','ro.product.cpu.abi']:return 0,'arm64-v8a'
            if args[:2]==['shell','pidof']:
                v=next(pids);return (0 if v else 1),v
            if args[:3]==['shell','am','start']:return 0,'Status: ok\nActivity: com.example.app/.MainActivity\n'
            return 0,''
        result=lifecycle_check(adb,'com.example.app/.MainActivity',sleep=lambda _:None)
        self.assertEqual(result['state'],'PASS');self.assertEqual(result['pids'],[[101],[102]])
        self.assertEqual(sum(a[:3]==['shell','am','force-stop'] for a in calls),2)
    def test_lifecycle_refuses_foreign_or_failed_launch(self):
        calls=[]
        with self.assertRaises(RuntimeErrorCode):lifecycle_check(lambda args:(calls.append(args) or (0,'x86_64')),'com.example.app/.MainActivity')
        self.assertEqual(len(calls),1)
        with self.assertRaises(RuntimeErrorCode):lifecycle_check(lambda args:(0,'arm64-v8a' if args[1]=='getprop' else 'Error: permission denied'),'com.example.app/.MainActivity')
    def test_android_init_and_signature_integrate_existing_builder(self):
        helper=runtime_fixture.Runtime();helper.root=self.root
        w=helper.workspace();calls,runner=helper.runner(android=True)
        def run(args,cwd,log,timeout,env):
            if args[:6]==['npm','run','tauri','--','android','init']:
                calls.append(args);(cwd/'src-tauri/gen/android').mkdir(parents=True);log.write_text('fixture init')
            elif args[0]=='apksigner':
                calls.append(args);log.write_text('Signer #1 certificate SHA-256 digest: '+PIN+'\n')
            elif args[0]=='apkanalyzer':
                calls.append(args);log.write_text(self.manifest())
            else:runner(args,cwd,log,timeout,env)
        result=build_runtime(w,self.root,'android',runner=run,initialize_android=True,signer_sha256=PIN,package_id='com.example.app')
        self.assertEqual(result['signer_sha256'],PIN);self.assertEqual(result['launcher'],'com.example.app/.MainActivity');self.assertIn('--print-certs',calls[-2]);self.assertEqual(calls[-1][0],'apkanalyzer')

class SupervisorTests(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);self.root=Path(t.name)
        with socket.socket() as s:s.bind(('127.0.0.1',0));self.port=s.getsockname()[1]
        self.fixture=self.root/'server.py';self.fixture.write_text('import http.server,sys\nclass H(http.server.BaseHTTPRequestHandler):\n def do_GET(self):\n  self.send_response(200);self.end_headers();self.wfile.write(b\'{"devices":[]}\')\n def log_message(self,*a):pass\nhttp.server.HTTPServer(("127.0.0.1",int(sys.argv[1])),H).serve_forever()\n')
        self.argv=[sys.executable,str(self.fixture),str(self.port)]
    def supervisor(self,**kw):return OwnedBackend(self.root/'private', self.port,self.argv,self.root,deadline=3,**kw)
    def test_real_backend_owned_restart_and_cleanup(self):
        with self.supervisor(restarts=1) as b:
            b.ensure_ready();first=b.child.pid;b.child.kill();b.child.wait();b.ensure_ready();self.assertNotEqual(b.child.pid,first);self.assertEqual(b.restarts_used,1);pid=b.child.pid
        self.assertIsNotNone(b.child.poll())
    def test_foreign_listener_never_touched(self):
        with socket.socket() as s:
            s.bind(('127.0.0.1',self.port));s.listen()
            with self.assertRaises(RuntimeErrorCode):
                with self.supervisor() as b:b.ensure_ready()
            self.assertEqual(s.getsockname()[1],self.port)
    def test_restart_limit_and_ambiguous_submission(self):
        with self.supervisor(restarts=0) as b:
            b.ensure_ready();b.child.kill();b.child.wait()
            with self.assertRaises(RuntimeErrorCode):b.ensure_ready()
        with self.supervisor(restarts=1) as b:
            b.ensure_ready();b.child.kill();b.child.wait()
            with self.assertRaises(RuntimeErrorCode):b.ensure_ready(quiescent=False)
            self.assertEqual(b.restarts_used,0)
    def test_exclusive_lock(self):
        with self.supervisor() as b:
            with self.assertRaises(RuntimeErrorCode):
                with self.supervisor():pass
    def test_bad_health_and_cleanup(self):
        argv=[sys.executable,'-c','import sys;sys.exit(4)']
        with self.assertRaises(RuntimeErrorCode):
            with OwnedBackend(self.root/'private',self.port,argv,self.root,deadline=1,restarts=0) as b:b.ensure_ready()
        self.assertIsNotNone(b.child.poll())

class ManagedOwnedTests(unittest.TestCase):
    def setUp(self):
        from PIL import Image
        from scripts.resource_broker import Broker
        from scripts.runtime_control import LocalBackend
        from scripts.tiled_upscale import TiledJob
        t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);self.root=Path(t.name)
        with socket.socket() as s:s.bind(('127.0.0.1',0));self.port=s.getsockname()[1]
        self.source=self.root/'source.png';Image.new('RGB',(96,64),(12,34,56)).save(self.source)
        self.model=self.root/'model.pth';self.model.write_bytes(b'model');self.output=self.root/'out.png'
        self.broker=Broker(self.root/'broker');self.broker.sample(10000,38000)
        self.backend=LocalBackend(self.port);self.job=TiledJob(self.root/'job',self.backend)
        self.fixture=self.root/'server.py';self.fixture.write_text('''import http.server,sys,json,io
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from PIL import Image
root=Path(sys.argv[2]);prompts={}
class Handler(http.server.BaseHTTPRequestHandler):
 def out(self,value):
  data=value if isinstance(value,bytes) else json.dumps(value).encode()
  self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_POST(self):
  graph=json.loads(self.rfile.read(int(self.headers['Content-Length'])))['prompt'];pid=str(len(prompts)+1);prompts[pid]=graph
  with (root/'posts.log').open('a') as f:f.write(str(graph['2']['inputs'])+'\\n')
  self.out({'prompt_id':pid})
 def do_GET(self):
  p=urlsplit(self.path);q=parse_qs(p.query)
  if p.path=='/system_stats':self.out({'devices':[{'type':'cuda','index':0,'vram_free':4*1024**3,'vram_total':8*1024**3}]});return
  if p.path.startswith('/history/'):
   pid=p.path.split('/')[-1];self.out({pid:{'status':{'completed':True,'status_str':'success'},'outputs':{'5':{'images':[{'filename':pid+'.png','subfolder':'','type':'output'}]}}}} if pid in prompts else {});return
  if q['type'][0]=='input':self.out((root/'source.png').read_bytes());return
  pid=q['filename'][0].split('.')[0];c=prompts[pid]['2']['inputs'];b=io.BytesIO();Image.new('RGB',(c['width']*4,c['height']*4),(12,34,56)).save(b,format='PNG');self.out(b.getvalue())
 def log_message(self,*a):pass
http.server.HTTPServer(('127.0.0.1',int(sys.argv[1])),Handler).serve_forever()
''')
        self.supervisor=OwnedBackend(self.root/'private', self.port,[sys.executable,str(self.fixture),str(self.port),str(self.root)],self.root,deadline=3,restarts=1)
    def run_job(self):
        from scripts.managed_gpu import managed_tiled
        return managed_tiled(self.job,self.broker,2048,'cuda',0,1024,self.source,self.model,self.output,4,128,16,64,supervisor=self.supervisor,wait=3)
    def test_integrated_restart_after_collected_tile(self):
        original=self.backend.request;killed=[]
        def broken(method,path,*args,**kwargs):
            data=original(method,path,*args,**kwargs)
            if path.startswith('/view?') and 'type=output' in path and not killed:
                self.supervisor.child.kill();self.supervisor.child.wait();killed.append(True)
            return data
        self.backend.request=broken
        self.assertEqual(self.run_job()['state'],'DONE');self.assertEqual(self.supervisor.restarts_used,1);self.assertEqual(len((self.root/'posts.log').read_text().splitlines()),6);self.assertEqual(self.broker.status()['reserved_mib'],0)
        self.assertIsNotNone(self.supervisor.child.poll())
    def test_active_stop_owned_process_and_quarantine(self):
        from scripts.managed_gpu import request_stop
        original=self.backend.request
        def stop(method,path,*args,**kwargs):
            data=original(method,path,*args,**kwargs)
            if method=='POST' and path=='/prompt':request_stop(self.job.root,self.backend)
            return data
        self.backend.request=stop
        with self.assertRaises(RuntimeErrorCode):self.run_job()
        self.assertIsNotNone(self.supervisor.child.poll());self.assertFalse(self.output.exists());self.assertEqual(self.broker.status()['jobs'][-1]['state'],'ORPHANED');self.assertEqual(len((self.root/'posts.log').read_text().splitlines()),1)
    def test_unresolved_journal_never_starts_backend(self):
        from scripts.recoverable_render import RenderJob
        r=RenderJob(self.job.root/'tile-000-000',self.backend);r.save({'state':'ACCEPTED','prompt_id':'maybe'})
        with self.assertRaises(RuntimeErrorCode):self.run_job()
        self.assertIsNone(self.supervisor.child);self.assertFalse((self.root/'posts.log').exists())
