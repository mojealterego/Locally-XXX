import copy
import json
import math
from pathlib import Path
import subprocess
import sys
import unittest

BRIDGE = Path(__file__).resolve().parents[1] / 'locally_bridge.py'
BLEND = {'operation':'blend','shape':[1,5],'axis':1,'left':[0]*5,'right':[1]*5}
AST = {'operation':'ast-compare','left':'def f(x):\n    return x + 1\n','right':'def g(y):\n    return y + 99\n','dimensions':128}


def invoke(value):
    return subprocess.run([sys.executable,'-I','-B',str(BRIDGE)],input=json.dumps(value),text=True,capture_output=True,timeout=5)


class ExtraBridgeTests(unittest.TestCase):
    def result(self, value):
        p = invoke(value)
        self.assertEqual(p.returncode,0,p.stderr)
        data=json.loads(p.stdout)
        self.assertFalse(data['executed'])
        return data['result']

    def test_c2_01_quintic_values(self):
        r=self.result(BLEND)
        self.assertEqual(r['pixels'],[0,0.103515625,0.5,0.896484375,1])
        self.assertEqual(r['shape'],[1,5])

    def test_c2_02_vertical_rgb(self):
        v=dict(operation='blend',shape=[3,1,3],axis=0,left=[0,2,4]*3,right=[2,4,6]*3)
        self.assertEqual(self.result(v)['pixels'],[0,2,4,1,3,5,2,4,6])

    def test_c2_03_invalid(self):
        for change in [dict(shape=[1,1]),dict(axis=True),dict(axis=0),dict(left=[0]*4),dict(right=[True]*5),dict(right=[float('nan')]*5),dict(shape=[64,64,3]),dict(path='/etc/passwd')]:
            with self.subTest(change=change): self.assertEqual(invoke({**BLEND,**change}).returncode,2)

    def test_ast_01_structural_not_semantic(self):
        r=self.result(AST)
        self.assertAlmostEqual(r['similarity'],1)
        self.assertAlmostEqual(r['projection'],1)
        self.assertFalse(r['semantic_equivalence_verified'])
        self.assertFalse(r['formal_proof'])

    def test_ast_02_different_and_symmetric(self):
        v={**AST,'right':'for x in range(10):\n    print(x)\n'}
        a=self.result(v);b=self.result({**v,'left':v['right'],'right':v['left']})
        self.assertGreaterEqual(a['similarity'],0)
        self.assertLess(a['similarity'],1)
        self.assertAlmostEqual(a['similarity'],b['similarity'])
        self.assertAlmostEqual(a['projection'],a['similarity']**2)

    def test_ast_03_invalid_and_no_execution(self):
        for change in [dict(left='if:'),dict(dimensions=12),dict(dimensions=True),dict(right='x'*12001),dict(left=[]),dict(exec=True)]:
            with self.subTest(change=change): self.assertEqual(invoke({**AST,**change}).returncode,2)
        r=self.result({**AST,'left':'raise RuntimeError("must not execute")'})
        self.assertFalse(r['semantic_equivalence_verified'])

    def test_regression_geometry_and_timeline(self):
        self.assertEqual(self.result({'operation':'timeline','numerator':30000,'denominator':1001,'frame':1000,'sampleRate':48000})['startSample'],1601600)
        self.assertEqual(self.result({'operation':'geometry','camera':{'fx':100,'fy':100,'cx':49.5,'cy':49.5,'width':100,'height':100,'skew':0},'crop':None,'point':{'u':79.5,'v':89.5,'depth':10,'kind':'optical_z'}})['xyz'],[3,4,10])


if __name__=='__main__': unittest.main()
