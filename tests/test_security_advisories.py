import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from scripts.security_scan import scan_tree
from scripts.osv_offline import compare, match_snapshot

class AdvisoryTests(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);self.root=Path(t.name);self.source=self.root/'src';self.source.mkdir()
        (self.source/'package.json').write_text('{"license":"MIT"}')
        self.npm={'lockfileVersion':3,'packages':{'node_modules/demo':{'version':'1.2.3','license':'MIT','integrity':'sha512-'+'A'*86+'=='}}}
        (self.source/'package-lock.json').write_text(json.dumps(self.npm))
    def write(self,advisories):
        path=self.root/'snapshot.json';raw=json.dumps(advisories).encode();path.write_bytes(raw);return path,hashlib.sha256(raw).hexdigest()
    def record(self,events=None,versions=None,range_type='SEMVER',identifier='GHSA-test-0001-0001'):
        affected={'package':{'ecosystem':'npm','name':'demo'}}
        if events is not None:affected['ranges']=[{'type':range_type,'events':events}]
        if versions is not None:affected['versions']=versions
        return {'id':identifier,'affected':[affected]}
    def scan(self,records):
        path,digest=self.write(records);return scan_tree(self.source,advisory_path=path,advisory_sha256=digest)
    def test_version_precedence(self):
        ordered=['1.0.0-alpha','1.0.0-alpha.1','1.0.0-alpha.beta','1.0.0-beta','1.0.0-beta.2','1.0.0-beta.11','1.0.0-rc.1','1.0.0']
        for a,b in zip(ordered,ordered[1:]):self.assertLess(compare(a,b),0)
        self.assertEqual(compare('1.0.0+foo','1.0.0+bar'),0)
        for v in ('01.0.0','1.0','v1.0.0','1.0.0-01'):
            with self.assertRaises(ValueError):compare(v,'1.0.0')
    def test_affected_fixed_and_exact_versions(self):
        a=self.record([{'introduced':'0'},{'fixed':'1.2.4'}]);r=self.scan([a]);self.assertFalse(r['review_ready']);self.assertEqual(r['advisories']['matches'][0]['id'],a['id'])
        r=self.scan([self.record([{'introduced':'0'},{'fixed':'1.2.3'}])]);self.assertEqual(r['advisories']['matches'],[]);self.assertTrue(r['review_ready'])
        r=self.scan([self.record(versions=['1.2.3'])]);self.assertFalse(r['review_ready'])
    def test_last_affected_and_reintroduced(self):
        r=self.scan([self.record([{'introduced':'1.0.0'},{'last_affected':'1.2.3'}])]);self.assertFalse(r['review_ready'])
        r=self.scan([self.record([{'introduced':'0'},{'fixed':'1.0.0'},{'introduced':'1.2.3'},{'fixed':'2.0.0'}])]);self.assertFalse(r['review_ready'])
    def test_unknown_range_fails_closed(self):
        r=self.scan([self.record([{'introduced':'x'}],range_type='GIT')]);self.assertEqual(r['advisories']['reviews'][0]['id'],'GHSA-test-0001-0001');self.assertFalse(r['review_ready'])
    def test_malformed_rejects_and_withdrawn_is_reviewed(self):
        r=self.scan([self.record([{'fixed':'1.2.4'}])]);self.assertFalse(r['review_ready']);self.assertTrue(r['advisories']['reviews'])
        a=self.record(versions=['1.2.3']);a['withdrawn']='2026-10-01T00:00:00Z';r=self.scan([a]);self.assertFalse(r['review_ready']);self.assertTrue(r['advisories']['reviews'])
    def test_hash_anchor_and_duplicate(self):
        p,d=self.write([self.record(versions=['1.2.3'])]);self.assertRaises(ValueError,match_snapshot,p,'0'*64,[])
        a=self.record(versions=['1.2.3']);p,d=self.write([a,a]);self.assertRaises(ValueError,match_snapshot,p,d,[])
    def test_without_snapshot_is_explicit_not_run(self):self.assertEqual(scan_tree(self.source)['advisories']['status'],'NOT_RUN')
    def test_secret_in_metadata_and_filename_redacted(self):
        secret='ghp_'+'A'*36;self.npm['packages']['node_modules/'+secret]={'name':secret,'version':'1.0.0','license':'MIT','integrity':'sha512-'+'A'*86+'=='}
        (self.source/'package-lock.json').write_text(json.dumps(self.npm));(self.source/secret).write_text('x')
        r=scan_tree(self.source);self.assertNotIn(secret,json.dumps(r));self.assertFalse(r['review_ready']);self.assertTrue(any(x['code']=='potential-secret' for x in r['findings']))
    def test_cargo_checksum_report(self):
        (self.source/'Cargo.toml').write_text('[package]\nname="a"\nlicense="MIT"');(self.source/'Cargo.lock').write_text('version=4\n[[package]]\nname="valid"\nversion="1.0.0"\nsource="registry+https://github.com/rust-lang/crates.io-index"\nchecksum="'+'a'*64+'"\n[[package]]\nname="bad"\nversion="1.0.0"\nsource="registry+https://github.com/rust-lang/crates.io-index"\nchecksum="foo"')
        r=scan_tree(self.source);c={x['name']:x for x in r['components']};self.assertTrue(c['valid']['integrity_declared']);self.assertFalse(c['bad']['integrity_declared']);self.assertTrue(any(x['code']=='dependency-integrity-review' for x in r['findings']))
    def test_total_advisory_work_budget(self):
        from unittest.mock import patch
        p,d=self.write([self.record(versions=['1.0.0','1.0.1','1.0.2','1.0.3'])])
        with patch('scripts.osv_offline.MAX_MATCH_WORK',3,create=True):
            with self.assertRaises(ValueError):match_snapshot(p,d,[{'ecosystem':'npm','name':'demo','version':'1.2.3'}])
    def test_unsupported_limit_and_nonascending_range_review(self):
        for events in ([{'introduced':'0'},{'limit':'2.0.0'}],[{'introduced':'2.0.0'},{'fixed':'1.0.0'}]):
            r=self.scan([self.record(events)]);self.assertTrue(r['advisories']['reviews']);self.assertFalse(r['review_ready'])
    def test_empty_snapshot_not_advisory_assessment(self):
        p,d=self.write([]);self.assertRaises(ValueError,match_snapshot,p,d,[])
