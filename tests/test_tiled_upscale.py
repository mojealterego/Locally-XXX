import hashlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from scripts.runtime_control import LocalBackend, RuntimeErrorCode
from scripts.tiled_upscale import plan, workflow, stitch, TiledJob


class TiledTests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);self.root=Path(tmp.name)
        self.source=self.root/'source.png';Image.new('RGB',(128,96),(10,20,30)).save(self.source)
        self.model=self.root/'model.pth';self.model.write_bytes(b'fixture model')
        self.calls=[];self.prompts={};self.fail=False;self.wrong_source=False
        self.backend=LocalBackend(8188,request=self.request,sleep=lambda _:None)
        self.job=TiledJob(self.root/'job',self.backend)
        self.output=self.root/'out.png'
    def request(self,method,path,body=None,limit=0):
        self.calls.append((method,path))
        if path=='/prompt':
            pid=str(len(self.prompts)+1);self.prompts[pid]=body['prompt'];return {'prompt_id':pid}
        if path.startswith('/history/'):
            if self.fail:raise RuntimeErrorCode('TRANSPORT','fixture offline')
            pid=path.rsplit('/',1)[1];return {pid:{'status':{'completed':True,'status_str':'success'},'outputs':{'5':{'images':[{'filename':pid+'.png','subfolder':'','type':'output'}]}}}}
        from urllib.parse import parse_qs,urlsplit
        query=parse_qs(urlsplit(path).query)
        if query.get('type')==['input']:return b'wrong' if self.wrong_source else self.source.read_bytes()
        pid=query['filename'][0][:-4];c=self.prompts[pid]['2']['inputs']
        b=io.BytesIO();Image.new('RGB',(c['width']*4,c['height']*4),(10,20,30)).save(b,format='PNG');return b.getvalue()
    def run_job(self):return self.job.run(self.source,self.model,self.output,4,256,32,64)
    def test_plan_full_8k_and_bounded(self):
        p=plan(7680,4320,4,1024,64,64);self.assertEqual((p['width'],p['height']),(7680,4320));self.assertLessEqual(p['estimated_client_bytes'],64*1024**2)
        self.assertEqual(p['tiles'][0]['x'],0);self.assertEqual(max(t['x']+t['w'] for t in p['tiles']),7680);self.assertEqual(max(t['y']+t['h'] for t in p['tiles']),4320)
        self.assertTrue(all(t['w']%4==t['h']%4==0 for t in p['tiles']))
    def test_budget_rejected(self):
        with self.assertRaises(RuntimeErrorCode):plan(7680,4320,4,1024,64,1)
    def test_invalid_geometry(self):
        for args in [(7681,4320,4,1024,64,64),(7680,4320,4,1024,300,64),(7680,4320,4,128,32,64)]:
            with self.assertRaises(RuntimeErrorCode):plan(*args)
    def test_workflow_coordinates(self):
        t={'x':128,'y':64,'w':288,'h':256};g=workflow(t,4,'source.png','model.pth')
        self.assertEqual(g['2']['inputs'],{'image':['1',0],'x':32,'y':16,'width':72,'height':64});self.assertEqual(g['4']['class_type'],'ImageUpscaleWithModel')
    def test_unsafe_backend_filename(self):
        with self.assertRaises(RuntimeErrorCode):workflow({'x':0,'y':0,'w':128,'h':128},4,'../source.png','model.pth')
    def test_end_to_end_and_idempotence(self):
        r=self.run_job();self.assertEqual(r['state'],'DONE');self.assertEqual(r['sha256'],hashlib.sha256(self.output.read_bytes()).hexdigest())
        with Image.open(self.output) as im:self.assertEqual(im.size,(512,384));self.assertEqual(im.getpixel((511,383)),(10,20,30))
        calls=list(self.calls);self.assertEqual(self.run_job(),r);self.assertEqual(self.calls,calls)
    def test_resume_no_duplicate_posts(self):
        self.fail=True
        with self.assertRaises(RuntimeErrorCode):self.run_job()
        self.assertFalse(self.output.exists());self.fail=False;r=self.run_job()
        self.assertEqual(r['state'],'DONE');self.assertEqual(len(self.prompts),len(r['plan']['tiles']))
    def test_input_change_refused(self):
        self.fail=True
        with self.assertRaises(RuntimeErrorCode):self.run_job()
        self.model.write_bytes(b'changed');calls=list(self.calls);self.fail=False
        with self.assertRaises(RuntimeErrorCode):self.run_job()
        self.assertEqual(calls,self.calls)
    def test_no_overwrite(self):
        self.output.write_bytes(b'original')
        with self.assertRaises(RuntimeErrorCode):self.run_job()
        self.assertEqual(self.output.read_bytes(),b'original');self.assertFalse(self.calls)
    def test_crash_after_publish(self):
        original=self.job.journal.save
        def crash(state):
            if state['state']=='DONE':raise KeyboardInterrupt()
            original(state)
        with patch.object(self.job.journal,'save',side_effect=crash):
            with self.assertRaises(KeyboardInterrupt):self.run_job()
        self.assertTrue(self.output.exists());calls=list(self.calls);self.assertEqual(self.run_job()['state'],'DONE');self.assertEqual(self.calls,calls)
    def test_real_8k_stitch_and_overlap(self):
        p=plan(7680,4320,4,1024,64,64);paths=[]
        for t in p['tiles']:
            f=self.root/(t['id']+'.png');Image.new('RGB',(t['w'],t['h']),(0 if t['col']==0 else 200,50,70)).save(f);paths.append(f)
        out=self.root/'8k.png';stitch(p,paths,out,self.root)
        with Image.open(out) as im:
            self.assertEqual(im.size,(7680,4320));self.assertEqual(im.getpixel((0,0)),(0,50,70));self.assertEqual(im.getpixel((7679,4319)),(200,50,70))
            edge=p['tiles'][1]['x'];self.assertLess(im.getpixel((edge+1,0))[0],im.getpixel((edge+100,0))[0])
    def test_bad_tile_cleans_scratch(self):
        p=plan(512,384,4,256,32,64);paths=[]
        for t in p['tiles']:
            f=self.root/(t['id']+'.png');Image.new('RGB',(t['w'],t['h'])).save(f);paths.append(f)
        paths[-1].write_bytes(b'bad');out=self.root/'broken.png'
        with self.assertRaises((RuntimeErrorCode,OSError)):stitch(p,paths,out,self.root)
        self.assertFalse(out.exists());self.assertFalse(list(self.root.glob('omega-stitch-*')))
    def test_remote_source_mismatch_denied_before_submit(self):
        self.wrong_source=True
        with self.assertRaises(RuntimeErrorCode):self.run_job()
        self.assertFalse(self.prompts);self.assertFalse(self.output.exists())
    def test_existing_unrelated_temp_is_preserved(self):
        temp=self.output.parent/('.omega-'+hashlib.sha256(str(self.job.root).encode()).hexdigest()+'.tmp');temp.write_bytes(b'keep')
        self.run_job();self.assertEqual(temp.read_bytes(),b'keep')
    def test_auto_smaller_tile(self):
        from scripts.tiled_upscale import choose_plan
        p=choose_plan(7680,4320,4,1024,64,32);self.assertLess(p['core'],1024);self.assertLessEqual(p['estimated_client_bytes'],32*1024**2)
    def test_vertical_seam_and_uneven_tiles(self):
        p=plan(516,388,4,256,32,64);paths=[]
        for t in p['tiles']:
            f=self.root/(t['id']+'.png');Image.new('RGB',(t['w'],t['h']),(0,0 if t['row']==0 else 200,30)).save(f);paths.append(f)
        out=self.root/'vertical.png';stitch(p,paths,out,self.root)
        with Image.open(out) as im:
            self.assertEqual(im.size,(516,388));edge=next(t['y'] for t in p['tiles'] if t['row']==1)
            self.assertLess(im.getpixel((0,edge+1))[1],im.getpixel((0,edge+50))[1]);self.assertEqual(im.getpixel((515,387)),(0,200,30))
    def test_ambiguous_tile_never_reposted(self):
        def failure(method,path,body=None,limit=0):
            if path=='/prompt':self.calls.append((method,path));raise RuntimeErrorCode('TRANSPORT','unknown acceptance')
            return self.request(method,path,body,limit)
        self.backend.request=failure
        with self.assertRaises(RuntimeErrorCode):self.run_job()
        self.backend.request=self.request
        with self.assertRaises(RuntimeErrorCode):self.run_job()
        self.assertEqual(sum(path=='/prompt' for _,path in self.calls),1);self.assertFalse(self.output.exists())
    def test_wrong_model_scale_rejected(self):
        original=self.backend.request
        def wrong(method,path,body=None,limit=0):
            if path.startswith('/view?') and 'type=output' in path:
                b=io.BytesIO();Image.new('RGB',(16,16)).save(b,format='PNG');return b.getvalue()
            return original(method,path,body,limit)
        self.backend.request=wrong
        with self.assertRaises(RuntimeErrorCode):self.run_job()
        self.assertFalse(self.output.exists())
    def test_deterministic_layout_properties(self):
        import random
        rng=random.Random(3108)
        for _ in range(100):
            w,h=rng.randrange(32,2049)*4,rng.randrange(32,2049)*4
            p=plan(w,h,4,1024,64,64)
            for axis,size,lo,span in [('row',h,'y','h'),('col',w,'x','w')]:
                intervals=sorted({(t[axis],t[lo],t[lo]+t[span]) for t in p['tiles']})
                self.assertEqual(intervals[0][1],0);self.assertEqual(intervals[-1][2],size)
                self.assertTrue(all(a[2]>=b[1] for a,b in zip(intervals,intervals[1:])))
                self.assertTrue(all(a[2]<=c[1] for a,_,c in zip(intervals,intervals[1:],intervals[2:])))
    def test_full_8k_controller_reference_coordinates(self):
        im=Image.new('RGB',(1920,1080),(10,20,30));im.paste((120,130,140),(960,0,1920,1080));im.save(self.source);im.close()
        original=self.backend.request
        def pixels(method,path,body=None,limit=0):
            if path.startswith('/view?') and 'type=output' in path:
                from urllib.parse import parse_qs,urlsplit
                pid=parse_qs(urlsplit(path).query)['filename'][0][:-4];c=self.prompts[pid]['2']['inputs'];x,y,w,h=(c[k] for k in ('x','y','width','height'))
                with Image.open(self.source) as src:
                    tile=src.crop((x,y,x+w,y+h)).resize((w*4,h*4),Image.Resampling.NEAREST);b=io.BytesIO();tile.save(b,format='PNG');tile.close();return b.getvalue()
            return original(method,path,body,limit)
        self.backend.request=pixels
        r=self.job.run(self.source,self.model,self.output,4,1024,64,64);self.assertEqual(len(self.prompts),40);self.assertEqual(r['state'],'DONE')
        with Image.open(self.output) as out:
            self.assertEqual(out.size,(7680,4320));self.assertEqual(out.getpixel((3839,2000)),(10,20,30));self.assertEqual(out.getpixel((3840,2000)),(120,130,140))
            self.assertEqual(out.getpixel((7679,4319)),(120,130,140))
