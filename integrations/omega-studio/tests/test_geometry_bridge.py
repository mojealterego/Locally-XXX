import copy
import json
import math
from pathlib import Path
import subprocess
import sys
import unittest

BRIDGE = Path(__file__).resolve().parents[1] / 'locally_bridge.py'
REQUEST = {'operation': 'geometry', 'camera': {'fx': 100, 'fy': 100, 'cx': 49.5, 'cy': 49.5, 'width': 100, 'height': 100, 'skew': 0}, 'crop': None, 'point': {'u': 79.5, 'v': 89.5, 'depth': 10, 'kind': 'optical_z'}}


def invoke(value):
    return subprocess.run([sys.executable, '-I', '-B', str(BRIDGE)], input=json.dumps(value), text=True, capture_output=True, timeout=5)


class GeometryBridgeTests(unittest.TestCase):
    def result(self, request):
        p = invoke(request)
        self.assertEqual(p.returncode, 0, p.stderr)
        result = json.loads(p.stdout)
        self.assertFalse(result['executed'])
        return result['result']

    def test_geo01_optical_z(self):
        r = self.result(REQUEST)
        self.assertEqual(r['xyz'], [3.0, 4.0, 10.0])
        self.assertFalse(r['measurement_verified'])
        self.assertEqual(r['unit'], 'arbitrary_scale')

    def test_geo02_range(self):
        v = copy.deepcopy(REQUEST)
        v['point']['kind'] = 'ray_range_rho'
        r = self.result(v)
        self.assertAlmostEqual(math.hypot(*r['xyz']), 10)
        self.assertLess(r['xyz'][2], 10)

    def test_geo03_crop_preserves_ray(self):
        v = copy.deepcopy(REQUEST)
        v['crop'] = dict(x=20, y=30, width=80, height=70, outWidth=160, outHeight=140)
        v['point'].update(u=119.5, v=119.5)
        r = self.result(v)
        self.assertEqual(r['xyz'], [3.0, 4.0, 10.0])
        self.assertEqual(r['camera']['fx'], 200)

    def test_geo04_reject_bad_requests(self):
        for section, key, value in [('camera','fx',0),('camera','fy',True),('camera','width',32769),('point','u',100),('point','depth',-1),('point','kind','meters'),('point','depth',float('nan')),('point','depth',1e100)]:
            v=copy.deepcopy(REQUEST);v[section][key]=value
            with self.subTest(section=section,key=key,value=value): self.assertEqual(invoke(v).returncode,2)
        v=copy.deepcopy(REQUEST);v['crop']=dict(x=99,y=0,width=2,height=20,outWidth=20,outHeight=20)
        self.assertEqual(invoke(v).returncode,2)
        self.assertEqual(invoke({**REQUEST,'unit':'meters'}).returncode,2)

    def test_geo05_existing_operations(self):
        self.assertEqual(self.result({'operation':'dag','tasks':[{'id':'a','capability':'analyze','dependencies':[],'cost':2}]}),{'levels':[['a']],'total_cost':2})
        self.assertEqual(self.result({'operation':'timeline','numerator':30000,'denominator':1001,'frame':1000,'sampleRate':48000})['startSample'],1601600)
        self.assertEqual(self.result({'operation':'tiles','width':1024,'height':768,'tileSize':512,'halo':8,'ramMiB':4096,'reservedMiB':1024,'capMiB':32})['count'],4)


if __name__ == '__main__':
    unittest.main()
