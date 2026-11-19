import hashlib, io, json, os, struct, tempfile, unittest, zipfile
from pathlib import Path
from scripts.security_scan import scan_tree
from scripts.omega_import import restore
from scripts.gguf_layout import inspect

def digest(b): return hashlib.sha256(b).hexdigest()

def gguf(tensors, payload, metadata=b'', count=0):
    def string(s):
        b=s.encode(); return struct.pack('<Q',len(b))+b
    b=b'GGUF'+struct.pack('<IQQ',3,len(tensors),count)+metadata
    for name,dims,kind,offset in tensors:
        b+=string(name)+struct.pack('<I',len(dims))+struct.pack('<'+'Q'*len(dims),*dims)+struct.pack('<IQ',kind,offset)
    return b+b'\0'*(-len(b)%32)+payload

class Three(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup); self.root=Path(self.tmp.name)
    def test_sec_empty(self): self.assertFalse(scan_tree(self.root)['review_ready'])
    def test_sec_lock(self):
        (self.root/'package.json').write_text(json.dumps({'name':'demo','license':'AGPL-3.0-only','dependencies':{'dep':'1.0.0'}}))
        (self.root/'package-lock.json').write_text(json.dumps({'lockfileVersion':3,'packages':{'':{'name':'demo'},'node_modules/dep':{'version':'1.0.0','license':'MIT','integrity':'sha512-'+'A'*86+'=='}}}))
        r=scan_tree(self.root); self.assertTrue(r['review_ready']); self.assertEqual(r['components'][0]['name'],'dep')
    def test_sec_invalid_sri(self):
        (self.root/'package.json').write_text('{"license":"MIT"}')
        (self.root/'package-lock.json').write_text(json.dumps({'lockfileVersion':3,'packages':{'node_modules/dep':{'version':'1.0.0','license':'MIT','integrity':'sha512-fake'}}}))
        self.assertIn('dependency-review',[f['code'] for f in scan_tree(self.root)['findings']])
    def test_sec_sbom(self):
        (self.root/'package.json').write_text('{"license":"MIT"}')
        (self.root/'package-lock.json').write_text(json.dumps({'lockfileVersion':3,'packages':{'node_modules/dep':{'version':'1.0.0','license':'MIT','integrity':'sha512-'+'A'*86+'=='}}}))
        r=scan_tree(self.root); self.assertEqual(r['sbom']['bomFormat'],'CycloneDX'); self.assertEqual(r['sbom']['components'][0]['name'],'dep')
    def test_sec_secret_redacted(self):
        value='sk-'+'abcDEF1234567890'*4; (self.root/'config.txt').write_text('key='+value)
        r=scan_tree(self.root); self.assertIn('potential-secret',[f['code'] for f in r['findings']]); self.assertNotIn(value,json.dumps(r))
    def test_sec_symlink_and_binary(self):
        (self.root/'hidden.bin').write_bytes(b'\x00\xff'); (self.root/'shortcut').symlink_to('hidden.bin')
        codes={f['code'] for f in scan_tree(self.root)['findings']}; self.assertTrue({'symlink','opaque-binary'}<=codes)
    def test_sec_missing_lock(self):
        (self.root/'package.json').write_text('{"license":"MIT","dependencies":{"dep":"*"}}'); self.assertIn('missing-lock',[f['code'] for f in scan_tree(self.root)['findings']])
    def test_sec_unknown_license(self):
        (self.root/'package.json').write_text('{"license":"Proprietary"}'); self.assertIn('license-review',[f['code'] for f in scan_tree(self.root)['findings']])
    def test_sec_cargo(self):
        (self.root/'Cargo.toml').write_text('[package]\nname="demo"\nversion="1.0.0"\nlicense="MIT"'); (self.root/'Cargo.lock').write_text('version=4\n[[package]]\nname="dep"\nversion="1.2.3"\nsource="registry+https://example.invalid"\nchecksum="abc"')
        r=scan_tree(self.root); self.assertEqual(r['components'][0]['ecosystem'],'cargo'); self.assertFalse(r['review_ready'])
    def bundle(self, name='model.zip', member='src/model.py'):
        f=io.BytesIO()
        with zipfile.ZipFile(f,'w',zipfile.ZIP_DEFLATED) as z: z.writestr(member,'print(42)')
        b=f.getvalue(); parts=[b[:len(b)//2],b[len(b)//2:]]; box=self.root/'chunks'; box.mkdir()
        rows=[]
        for i,p in enumerate(parts):
            n=f'part-{i}.bin'; (box/n).write_bytes(p); rows.append({'name':n,'bytes':len(p),'sha256':digest(p)})
        m={'schema':'omega-chunks-v1','file_name':name,'size_bytes':len(b),'sha256':digest(b),'parts':rows}; raw=json.dumps(m).encode(); (box/'manifest.json').write_bytes(raw)
        return box,digest(raw),b
    def test_mig_restore(self):
        box,sha,b=self.bundle(); out=self.root/'out.zip'; report=restore(box,sha,out); self.assertEqual(out.read_bytes(),b); self.assertEqual(report['sha256'],digest(b)); self.assertEqual(report['zip_entries'],1)
    def test_mig_wrong_anchor(self):
        box,_,_=self.bundle(); out=self.root/'out.zip'; self.assertRaises(ValueError,restore,box,'0'*64,out); self.assertFalse(out.exists())
    def test_mig_bad_part(self):
        box,sha,_=self.bundle(); (box/'part-0.bin').write_bytes(b'evil'); out=self.root/'out.zip'; self.assertRaises(ValueError,restore,box,sha,out); self.assertFalse(out.exists())
    def test_mig_traversal(self):
        box,sha,_=self.bundle(member='../evil'); out=self.root/'out.zip'; self.assertRaises(ValueError,restore,box,sha,out); self.assertFalse(out.exists())
    def test_mig_no_overwrite(self):
        box,sha,_=self.bundle(); out=self.root/'out.zip'; out.write_bytes(b'keep'); self.assertRaises(FileExistsError,restore,box,sha,out); self.assertEqual(out.read_bytes(),b'keep')
    def test_mig_symlink(self):
        box,sha,_=self.bundle(); p=box/'part-0.bin'; p.rename(box/'other'); p.symlink_to('other'); self.assertRaises((ValueError,OSError),restore,box,sha,self.root/'out.zip')
    def layout(self,b):
        p=self.root/'test.gguf'; p.write_bytes(b); return inspect(p)
    def test_gguf_valid(self):
        r=self.layout(gguf([('a',[256],12,0),('b',[8],0,160)],b'\0'*192)); self.assertEqual(r['tensor_count'],2); self.assertEqual(r['tensor_bytes'],176)
    def test_gguf_truncated(self): self.assertRaises(ValueError,self.layout,gguf([('a',[32],8,0)],b'\0'*10))
    def test_gguf_overlap(self): self.assertRaises(ValueError,self.layout,gguf([('a',[32],0,0),('b',[32],0,32)],b'\0'*160))
    def test_gguf_block(self): self.assertRaises(ValueError,self.layout,gguf([('a',[255],12,0)],b'\0'*256))
    def test_gguf_unknown(self): self.assertRaises(ValueError,self.layout,gguf([('a',[32],999,0)],b'\0'*256))
    def test_gguf_duplicate(self): self.assertRaises(ValueError,self.layout,gguf([('a',[8],0,0),('a',[8],0,32)],b'\0'*64))
    def test_gguf_misaligned(self): self.assertRaises(ValueError,self.layout,gguf([('a',[8],0,1)],b'\0'*64))
    def test_gguf_metadata(self):
        key=b'general.alignment'; m=struct.pack('<Q',len(key))+key+struct.pack('<II',4,3); self.assertRaises(ValueError,self.layout,gguf([('a',[8],0,0)],b'\0'*32,m,1))
    def test_gguf_oversized_string(self): self.assertRaises(ValueError,self.layout,gguf([],b'',struct.pack('<Q',2**63),1))
if __name__=='__main__': unittest.main(verbosity=2)
