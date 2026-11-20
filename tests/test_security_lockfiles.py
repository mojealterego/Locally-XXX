import json,tempfile,unittest
from pathlib import Path
from scripts.security_scan import scan_tree

class LockTests(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);self.root=Path(t.name)
        (self.root/'package.json').write_text(json.dumps({'license':'MIT','dependencies':{'demo':'1.0.0'}}))
        self.lock={'lockfileVersion':3,'packages':{'':{'dependencies':{'demo':'1.0.0'}},'node_modules/demo':{'version':'1.0.0','license':'MIT','integrity':'sha512-'+'A'*86+'==','resolved':'https://registry.npmjs.org/demo/-/demo-1.0.0.tgz'}}}
    def scan(self):
        (self.root/'package-lock.json').write_text(json.dumps(self.lock));return scan_tree(self.root)
    def codes(self,r):return {x['code'] for x in r['findings']}
    def test_valid(self):self.assertTrue(self.scan()['review_ready'])
    def test_missing_direct(self):
        del self.lock['packages']['node_modules/demo'];self.assertIn('lock-dependency-missing',self.codes(self.scan()))
    def test_outdated_root(self):
        self.lock['packages']['']['dependencies']['demo']='2.0.0';self.assertIn('lock-root-mismatch',self.codes(self.scan()))
    def test_nonregistry_source(self):
        self.lock['packages']['node_modules/demo']['resolved']='file:../../evil';self.assertIn('dependency-source-review',self.codes(self.scan()))
    def test_wrong_exact_version(self):
        self.lock['packages']['node_modules/demo']['version']='2.0.0';self.assertIn('lock-version-mismatch',self.codes(self.scan()))
    def test_duplicate_json_key(self):
        (self.root/'package-lock.json').write_text('{"lockfileVersion":3,"packages":{},"packages":{}}');self.assertIn('malformed-metadata',self.codes(scan_tree(self.root)))
    def test_nonfinite_json(self):
        (self.root/'package-lock.json').write_text('{"lockfileVersion":3,"packages":{},"value":NaN}');self.assertIn('malformed-metadata',self.codes(scan_tree(self.root)))
    def test_missing_root_declaration(self):
        del self.lock['packages']['']['dependencies'];self.assertIn('lock-root-mismatch',self.codes(self.scan()))
