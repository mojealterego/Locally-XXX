import hashlib
import unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from analysis_bridge import analyze, validate_registry


def code(source, mode='leak'):
    return {'operation':'code-review','source':source,'mode':mode}


def registry(*entries):
    return {'operation':'mcp-validate','servers':list(entries)}


class AnalysisTests(unittest.TestCase):
    def test_sw01_real_findings_no_execution(self):
        source = 'API_KEY = "example-only-not-a-real-secret"\neval("1+1")\nimport subprocess\nsubprocess.run("x", shell=True)\nimport pickle\npickle.loads(b"x")\nraise RuntimeError("never execute")\n'
        r = analyze(code(source))
        self.assertEqual(r['sha256'], hashlib.sha256(source.encode()).hexdigest())
        self.assertEqual(r['analyzers'], 4)
        self.assertEqual({f['rule'] for f in r['findings']}, {'hardcoded_secret','unsafe_eval','shell_execution','unsafe_deserialization'})
        self.assertNotIn('example-only-not-a-real-secret', str(r))
        self.assertFalse(r['source_executed'])
        self.assertFalse(r['security_verified'])

    def test_sw02_comments_valid(self):
        r = analyze(code('# only a comment\n', 'duo'))
        self.assertTrue(r['syntax_valid'])
        self.assertTrue(r['ast_reparsed'])
        self.assertEqual(r['findings'], [])

    def test_sw03_invalid_syntax_and_bounds(self):
        r = analyze(code('if:'))
        self.assertFalse(r['syntax_valid'])
        self.assertEqual(r['findings'][0]['rule'], 'syntax_error')
        for v in [code(''),code('x'*12001),code('x=1','unknown'),{**code('x=1'),'execute':True},code('x\0')]:
            with self.subTest(v=str(v)[:100]), self.assertRaises(ValueError): analyze(v)

    def test_sw04_determinism_and_output_cap(self):
        v = code('eval("1")\n'*200)
        a,b = analyze(v),analyze(v)
        self.assertEqual(a,b)
        self.assertEqual(a['finding_count'],200)
        self.assertEqual(len(a['findings']),128)
        self.assertTrue(a['findings_truncated'])

    def test_mcp01_original_registry_roundtrip(self):
        r = validate_registry(registry({'name':'z','transport':'stdio','command':['python','-m','example'],'url':''},{'name':'a','transport':'streamable-http','command':[],'url':'https://example.com/mcp'}))
        self.assertEqual(r['servers'],[{'name':'a','transport':'streamable-http'},{'name':'z','transport':'stdio'}])
        self.assertFalse(r['connected'])
        self.assertFalse(r['persisted'])
        self.assertNotIn('python',str(r))

    def test_mcp02_invalid_records(self):
        valid={'name':'a','transport':'stdio','command':['python'],'url':''}
        for v in [registry(valid,valid),registry({**valid,'command':'python'}),registry({**valid,'command':['x\n']}),registry({**valid,'name':'../a'}),registry({**valid,'env':{}}),registry({**valid,'url':'https://example.com'}),registry({'name':'a','transport':'streamable-http','command':[],'url':'https://127.0.0.1/mcp'}),registry({'name':'a','transport':'streamable-http','command':[],'url':'https://example.com/mcp?token=secret'}),registry(*[dict(valid,name=f'x{i}') for i in range(33)])]:
            with self.subTest(v=str(v)[:100]), self.assertRaises(ValueError): validate_registry(v)

    def test_mcp03_no_command_execution(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            marker=Path(d)/'executed'
            r=validate_registry(registry({'name':'a','transport':'stdio','command':[sys.executable,'-c',f'open({str(marker)!r},"w").close()'],'url':''}))
            self.assertFalse(marker.exists())
            self.assertFalse(r['connected'])


if __name__=='__main__': unittest.main()
