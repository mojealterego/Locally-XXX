from __future__ import annotations
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from media_bridge import compile_media_stage, MediaIntegrationError


def request():
    return {'schema_version':'omega.media.integration.v1','tenant_id':'studio','project_id':'film-01','owner':'artist',
            'element':{'kind':'CHARACTER','name':'Paula-Synthetic','references':[{'uri':'asset://ref-01','sha256':'a'*64,'rights_confirmed':True}]},
            'prompt':'Scena @Paula-Synthetic w świetle neonów',
            'mesh':{'vertices':[[0.,0.,0.],[1.,0.,0.]],
                    'emitters':[{'kind':'attractor','center':[1.,0.,0.],'strength':.5,'radius':2.,'direction':[0.,0.,1.],'frequency_hz':0.}]},
            'time_s':.2}

class MediaBridgeTests(unittest.TestCase):
    def test_valid_pipeline_runs_both_real_engines(self):
        p=request(); original=json.dumps(p)
        r=compile_media_stage(p)
        self.assertEqual(r['status'],'CPU_REFERENCE_PREVIEW_NO_VIDEO_RENDER')
        self.assertEqual(r['video_prompt']['prompt'],p['prompt'])
        self.assertEqual(r['video_prompt']['mentions'][0]['text'],'@Paula-Synthetic')
        self.assertEqual(r['video_prompt']['elementReferences'][0]['elementId'],r['element_id'])
        self.assertGreater(r['deformed_vertices'][0][0],0)
        self.assertFalse(r['persistent'])
        self.assertFalse(r['generated_video'])
        self.assertEqual(len(r['manifest_sha256']),64)
        self.assertEqual(json.dumps(p),original)
    def test_unknown_fields_rejected(self):
        p=request();p['unknown']=5
        with self.assertRaisesRegex(MediaIntegrationError,'INVALID_REQUEST_FIELDS'):compile_media_stage(p)
    def test_foreign_reference_without_rights_denied(self):
        p=request();p['element']['references'][0]['rights_confirmed']=False
        with self.assertRaises(ValueError):compile_media_stage(p)
    def test_malformed_asset_uri_is_denied_without_traceback(self):
        p=request();p["element"]["references"][0]["uri"]=None
        with self.assertRaisesRegex(MediaIntegrationError,"INVALID_ASSET_URI"):compile_media_stage(p)

    def test_reference_count(self):
        p=request();p['element']['references']=[]
        with self.assertRaisesRegex(MediaIntegrationError,'INVALID_REFERENCE_COUNT'):compile_media_stage(p)
    def test_unresolved_mention_denied(self):
        p=request();p['prompt']='@Unknown'
        with self.assertRaises(ValueError):compile_media_stage(p)
    def test_missing_mention_denied(self):
        p=request();p['prompt']='Brak elementu'
        with self.assertRaisesRegex(MediaIntegrationError,'MISSING_ELEMENT_MENTION'):compile_media_stage(p)
    def test_nan_denied(self):
        p=request();p['mesh']['vertices'][0][0]=float('nan')
        with self.assertRaisesRegex(MediaIntegrationError,'INVALID_COORDINATE'):compile_media_stage(p)
    def test_boolean_is_not_coordinate(self):
        p=request();p['mesh']['vertices'][0][0]=True
        with self.assertRaisesRegex(MediaIntegrationError,'INVALID_COORDINATE'):compile_media_stage(p)
    def test_time_budget(self):
        p=request();p['time_s']=7
        with self.assertRaisesRegex(MediaIntegrationError,'INVALID_TIME'):compile_media_stage(p)
    def test_vertex_budget(self):
        p=request();p['mesh']['vertices']=[[0,0,0]]*1001
        with self.assertRaisesRegex(MediaIntegrationError,'INVALID_VERTEX_COUNT'):compile_media_stage(p)
    def test_emitter_budget(self):
        p=request();p['mesh']['emitters']=p['mesh']['emitters']*65
        with self.assertRaisesRegex(MediaIntegrationError,'INVALID_EMITTER_COUNT'):compile_media_stage(p)
    def test_cli_offline_json_roundtrip(self):
        p=request()
        r=subprocess.run([sys.executable,str(ROOT/'media_bridge.py')],input=json.dumps(p),capture_output=True,text=True,timeout=5)
        self.assertEqual(r.returncode,0,r.stderr)
        result=json.loads(r.stdout)
        self.assertEqual(result['status'],'CPU_REFERENCE_PREVIEW_NO_VIDEO_RENDER')
    def test_cli_rejects_untrusted_fields(self):
        p=request();p['command']='exec'
        r=subprocess.run([sys.executable,str(ROOT/'media_bridge.py')],input=json.dumps(p),capture_output=True,text=True,timeout=5)
        self.assertEqual(r.returncode,2)
        self.assertEqual(json.loads(r.stderr)['status'],'DENIED')
    def test_cli_rejects_bomb(self):
        r=subprocess.run([sys.executable,str(ROOT/'media_bridge.py')],input='x'*512001,capture_output=True,text=True,timeout=5)
        self.assertEqual(r.returncode,2)
        self.assertEqual(json.loads(r.stderr)['error'],'INPUT_TOO_LARGE')

if __name__=='__main__':unittest.main()
