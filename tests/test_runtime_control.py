import io
import json
import os
import struct
import tempfile
import threading
import unittest
import zipfile
import zlib
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from scripts.runtime_control import build_runtime, run_process, check_apk, ResourceGate, android_probe, LocalBackend, RuntimeErrorCode, image_budget, android_execute


def png(w, h):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    # Valid deterministic RGB pixels; not an AI-generated image.
    compressor=zlib.compressobj(); row=b'\0'*(w*3+1)
    pixels=b''.join(compressor.compress(row) for _ in range(h))+compressor.flush()
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', pixels) + chunk(b'IEND', b'')


class Runtime(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
    def workspace(self, android=False):
        w = self.root / 'work'; w.mkdir(); (w/'src-tauri').mkdir()
        for name in ('package.json','package-lock.json','src-tauri/Cargo.toml','src-tauri/Cargo.lock'):
            (w/name).write_text('{}')
        if android: (w/'src-tauri/gen/android').mkdir(parents=True)
        return w
    def runner(self, fail='', android=False):
        calls=[]
        def run(args, cwd, log, timeout, env):
            calls.append(args); log.write_text('fixture: '+args[0])
            if fail and fail in args: raise RuntimeErrorCode('PROCESS_FAILED', 'fixture failure')
            if args == ['npm','run','build']:
                (cwd/'dist').mkdir(); (cwd/'dist/index.html').write_text('<html>fixture</html>')
            if args[:3] == ['npm','run','tauri:build']:
                binary=Path(env['CARGO_TARGET_DIR'])/'release/locally-uncensored'; binary.parent.mkdir(parents=True); binary.write_bytes(b'fixture binary'); binary.chmod(0o755)
            if android and args[:4] == ['npm','run','tauri','--']:
                dest=cwd/'src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk'; dest.parent.mkdir(parents=True)
                self.apk(dest)
        return calls, run
    def apk(self,path,machine=183,abi='arm64-v8a'):
        elf=bytearray(64); elf[:6]=b'\x7fELF\x02\x01'; struct.pack_into('<H',elf,18,machine)
        with zipfile.ZipFile(path,'w') as z:
            z.writestr('AndroidManifest.xml',b'fixture');z.writestr('lib/'+abi+'/libapp.so',elf)
    def test_run_01_build_sequence(self):
        w=self.workspace(); calls,run=self.runner(); result=build_runtime(w,self.root,'desktop',runner=run)
        self.assertEqual([x[0] for x in calls],['npm','npm','cargo','npm']);self.assertEqual(result['status'],'BUILT');self.assertEqual(len(result['sha256']),64)
    def test_run_02_short_circuit(self):
        calls,run=self.runner(fail='ci'); w=self.workspace()
        with self.assertRaisesRegex(RuntimeErrorCode,'fixture failure'): build_runtime(w,self.root,'desktop',runner=run)
        self.assertEqual(len(calls),1); self.assertEqual(json.loads(next(self.root.glob('omega-build-*/report.json')).read_text())['status'],'FAIL')
    def test_run_03_no_stale_artifact(self):
        w=self.workspace(); (w/'dist').mkdir(); calls,run=self.runner()
        with self.assertRaises(RuntimeErrorCode): build_runtime(w,self.root,'desktop',runner=run)
        self.assertEqual(calls,[])
    def test_run_04_actual_process_and_timeout(self):
        import sys
        run_process([sys.executable,'-c','print(42)'],self.root,self.root/'ok.log',3,os.environ.copy())
        self.assertEqual((self.root/'ok.log').read_text().strip(),'42')
        with self.assertRaises(RuntimeErrorCode) as cm: run_process([sys.executable,'-c','import time; time.sleep(30)'],self.root,self.root/'timeout.log',0.1,os.environ.copy())
        self.assertEqual(cm.exception.code,'TIMEOUT')
    def test_run_05_missing_artifact(self):
        w=self.workspace(); calls,run=self.runner()
        def no_artifact(args,*rest):
            if args[:3]!=['npm','run','tauri:build']: run(args,*rest)
        with self.assertRaises(RuntimeErrorCode): build_runtime(w,self.root,'desktop',runner=no_artifact)
    def test_and_01_arm64_build_and_signature_contract(self):
        w=self.workspace(True);calls,run=self.runner(android=True);r=build_runtime(w,self.root,'android',runner=run)
        self.assertEqual(calls[-1][0],'apksigner'); self.assertIn('aarch64',calls[-2]);self.assertEqual(r['status'],'BUILT')
    def test_and_02_wrong_abi(self):
        p=self.root/'wrong.apk'; self.apk(p,machine=62)
        with self.assertRaises(RuntimeErrorCode): check_apk(p)
    def test_and_03_wrong_directory_abi(self):
        p=self.root/'wrong.apk'; self.apk(p,abi='x86_64')
        with self.assertRaises(RuntimeErrorCode): check_apk(p)
    def test_and_04_android_project_missing(self):
        w=self.workspace(); calls,run=self.runner()
        with self.assertRaises(RuntimeErrorCode):build_runtime(w,self.root,'android',runner=run)
        self.assertEqual(calls,[])
    def test_and_05_probe_permissions_and_abi(self):
        p=android_probe(lambda: 'arm64-v8a',lambda: 4096)
        self.assertEqual(p['available_mib'],4096)
        with self.assertRaises(RuntimeErrorCode): android_probe(lambda:'x86',lambda:4096)
        def denied(): raise PermissionError('denied')
        with self.assertRaises(RuntimeErrorCode):android_probe(lambda:'arm64-v8a',denied)
    def test_and_06_resource_hysteresis_and_release(self):
        g=ResourceGate(reserve=1024); g.sample(6000,43000)
        with self.assertRaises(RuntimeErrorCode):g.acquire(1)
        g.sample(6000,40000)
        with self.assertRaises(RuntimeErrorCode):g.acquire(1)
        g.sample(6000,39500)
        with self.assertRaises(ValueError):
            with g.lease(4000):
                with self.assertRaises(RuntimeErrorCode):g.acquire(1000)
                raise ValueError('work failed')
        self.assertEqual(g.used,0)
        with g.lease(4000): self.assertEqual(g.used,4000)
    def test_and_07_stale_resource_probe(self):
        now=[0];g=ResourceGate(clock=lambda:now[0]);g.sample(6000,37000);now[0]=11
        with self.assertRaises(RuntimeErrorCode):g.acquire(1)
    def test_run_06_restart_preserves_failure_evidence(self):
        w=self.workspace(); calls,run=self.runner(fail='ci')
        with self.assertRaises(RuntimeErrorCode):build_runtime(w,self.root,'desktop',runner=run)
        failure=next(self.root.glob('omega-build-*/report.json')); original=failure.read_bytes()
        _,run=self.runner(); self.assertEqual(build_runtime(w,self.root,'desktop',runner=run)['status'],'BUILT')
        self.assertEqual(failure.read_bytes(),original);self.assertFalse((w/'.omega-build.lock').exists())
    def test_and_08_guarded_backend_refusal_and_recovery(self):
        gate=ResourceGate();calls=[];probe=lambda:{'abi':'arm64-v8a','available_mib':4000}
        def work(): calls.append(1); raise RuntimeErrorCode('BACKEND','fixture')
        with self.assertRaises(RuntimeErrorCode):android_execute(work,1000,43000,probe,gate)
        self.assertEqual(calls,[])
        with self.assertRaises(RuntimeErrorCode):android_execute(work,1000,39500,probe,gate)
        self.assertEqual(calls,[1]);self.assertEqual(gate.used,0)
        self.assertEqual(android_execute(lambda:'ok',1000,39000,probe,gate),'ok');self.assertEqual(gate.used,0)
    def test_gpu_09_crc_rejection(self):
        bad=bytearray(png(8,8));bad[-1]^=1
        def req(method,path,body=None,limit=0):
            if path=='/prompt':return {'prompt_id':'abc'}
            if path.startswith('/history'):return {'abc':{'status':{'completed':True,'status_str':'success'},'outputs':{'9':{'images':[{'filename':'a.png','subfolder':'','type':'output'}]}}}}
            return bytes(bad)
        with self.assertRaises(RuntimeErrorCode):LocalBackend(8188,request=req).render({},self.root/'bad.png',8,8,256)
        self.assertFalse((self.root/'bad.png').exists())
    def test_gpu_01_text_route(self):
        calls=[]
        def req(method,path,body=None,limit=0):
            calls.append((method,path,body));return {'choices':[{'message':{'content':'Żółć'}}]}
        self.assertEqual(LocalBackend(8127,request=req).chat('model','pytanie'),'Żółć'); self.assertEqual(calls[0][1],'/v1/chat/completions')
    def test_gpu_02_no_implicit_retry_of_submit(self):
        calls=[]
        def req(method,path,body=None,limit=0): calls.append(path);raise RuntimeErrorCode('TIMEOUT','timeout')
        with self.assertRaises(RuntimeErrorCode):LocalBackend(8188,request=req).render({},self.root/'x.png',8,8,256)
        self.assertEqual(calls,['/prompt']);self.assertFalse((self.root/'x.png').exists())
    def test_gpu_03_8k_contract_and_atomic_output(self):
        calls=[]; out=self.root/'image.png'; data=png(7680,4320)
        def req(method,path,body=None,limit=0):
            calls.append(path)
            if path=='/prompt':return {'prompt_id':'abc'}
            if path=='/history/abc': return {'abc':{'status':{'completed':True,'status_str':'success'},'outputs':{'9':{'images':[{'filename':'a.png','subfolder':'','type':'output'}]}}}}
            return data
        r=LocalBackend(8188,request=req).render({},out,7680,4320,1024)
        self.assertEqual(out.read_bytes(),data);self.assertEqual(r['width'],7680);self.assertEqual(len(calls),3)
        with self.assertRaises(RuntimeErrorCode):LocalBackend(8188,request=req).render({},out,7680,4320,1024)
    def test_gpu_04_bad_image_and_budget(self):
        with self.assertRaises(RuntimeErrorCode):image_budget(7680,4320,16)
        out=self.root/'bad.png'
        def req(method,path,body=None,limit=0):
            if path=='/prompt':return {'prompt_id':'abc'}
            if path.startswith('/history'):return {'abc':{'status':{'completed':True,'status_str':'success'},'outputs':{'9':{'images':[{'filename':'a.png','subfolder':'','type':'output'}]}}}}
            return png(1,1)
        with self.assertRaises(RuntimeErrorCode):LocalBackend(8188,request=req).render({},out,8,8,256)
        self.assertFalse(out.exists())
    def test_gpu_05_bounded_poll(self):
        ticks=[]
        def req(method,path,body=None,limit=0):
            if path=='/prompt':return {'prompt_id':'abc'}
            ticks.append(path);return {}
        with self.assertRaises(RuntimeErrorCode):LocalBackend(8188,request=req,sleep=lambda _:None).render({},self.root/'x.png',8,8,256,polls=3)
        self.assertEqual(len(ticks),3)
    def test_gpu_06_real_loopback_http(self):
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                payload=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                self.assert_path=self.path
                data=json.dumps({'choices':[{'message':{'content':payload['messages'][0]['content']}}]}).encode()
                self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
            def log_message(self,*args): pass
        server=HTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        self.addCleanup(server.server_close);self.addCleanup(server.shutdown)
        self.assertEqual(LocalBackend(server.server_port).chat('local','test'),'test')
    def test_gpu_07_malformed_response(self):
        with self.assertRaises(RuntimeErrorCode):LocalBackend(8127,request=lambda *a,**k:{'choices':[]}).chat('model','prompt')
    def test_gpu_08_unsafe_output_path(self):
        def req(method,path,body=None,limit=0):
            if path=='/prompt':return {'prompt_id':'abc'}
            return {'abc':{'status':{'completed':True,'status_str':'success'},'outputs':{'9':{'images':[{'filename':'../a.png','subfolder':'','type':'output'}]}}}}
        with self.assertRaises(RuntimeErrorCode):LocalBackend(8188,request=req).render({},self.root/'x.png',8,8,256)

if __name__=='__main__': unittest.main(verbosity=2)
