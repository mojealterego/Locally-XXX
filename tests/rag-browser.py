#!/usr/bin/env python3
"""Real Chromium tests of the browser parser, without model or network services."""
import base64, io, os, pathlib, subprocess, tempfile, unittest, zipfile
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]
NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'

def workbook(sheet=None, extras=(), shared=None, target='worksheets/sheet1.xml'):
    sheet = sheet or f'<worksheet xmlns="{NS}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Łódź &amp; Śląsk</t></is></c><c r="D1"><v>42.5</v></c><c r="E1"><f>SUM(A1)</f><v>99</v></c></row></sheetData></worksheet>'
    shared = shared or f'<sst xmlns="{NS}"><si><r><t>Zażółć </t></r><r><t>gęślą jaźń</t></r></si></sst>'
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('xl/workbook.xml', f'<workbook xmlns="{NS}" xmlns:r="{REL}"><sheets><sheet name="Dane Łódź" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels', f'<Relationships xmlns="{PKG}"><Relationship Id="rId1" Type="{REL}/worksheet" Target="{target}"/></Relationships>')
        z.writestr('xl/worksheets/sheet1.xml', sheet)
        z.writestr('xl/sharedStrings.xml', shared)
        for path, data in extras: z.writestr(path, data)
    return b.getvalue()

class RAG(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        directory = pathlib.Path(cls.tmp.name)
        source = ROOT/'overlays/rag/src/api/rag-documents.ts'
        subprocess.run(['tsc', str(source), '--target','ES2023','--module','ESNext','--lib','ES2023,DOM,DOM.Iterable','--strict','--noUnusedLocals','--noUnusedParameters','--outDir',str(directory)], check=True)
        cls.module = 'data:text/javascript;base64,' + base64.b64encode((directory/'rag-documents.js').read_bytes()).decode()
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
        cls.page = cls.browser.new_page()
        cls.page.set_content('<!doctype html><meta charset=utf-8>')
    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.tmp.cleanup()
    def call(self, operation, data=b'', name='test.xlsx'):
        return self.page.evaluate('''async ([op,bytes,name,uri]) => {const m=await import(uri);const file=new File([new Uint8Array(bytes)],name);try {let value; if(op==='xlsx')value=await m.extractXlsx(file);else if(op==='zip')value=await m.validateOffice(file);else if(op==='text')value=await m.extractPlainText(file);else if(op==='type')value=m.documentType(file);else if(op==='limit')value=m.boundedText('x'.repeat(m.LIMITS.textChars+1));else if(op==='tokens')value=m.searchTokens('ŁÓDŹ, zażółć gęślą jaźń!');else if(op==='batch'){let counts=[];let vectors=await m.embedBatches(Array.from({length:35},(_,i)=>String(i)),async b=>{counts.push(b.length);return b.map(x=>[Number(x),1])});value={counts,vectors};}else if(op==='bad-batch')value=await m.embedBatches(['x'],async()=>[]);else if(op==='bad-vector')value=await m.embedBatches(['x'],async()=>[[NaN]]);else if(op==='size')value=m.documentType(new File([new Uint8Array(m.LIMITS.fileBytes+1)],'x.pdf'));return {value};}catch(e){return {error:String(e.message)}}}''',[operation,list(data),name,self.module])
    def error(self,result,pattern): self.assertRegex(result.get('error',''),pattern)
    def test_01_polish_shared_inline_cached(self):
        r=self.call('xlsx',workbook()); self.assertIn('Zażółć gęślą jaźń',r['value']);self.assertIn('C1=Łódź & Śląsk',r['value']);self.assertIn('D1=42.5',r['value']);self.assertIn('E1=99',r['value']);self.assertIn('Dane Łódź',r['value'])
    def test_02_zip_traversal(self): self.error(self.call('xlsx',workbook(extras=[('../bad.xml',b'x')])),r'path|Path')
    def test_03_external_sheet(self): self.error(self.call('xlsx',workbook(target='https://example.invalid/x')),r'target|Target')
    def test_04_xml_entities(self): self.error(self.call('xlsx',workbook(shared='<!DOCTYPE sst [<!ENTITY x SYSTEM "file:///etc/passwd">]><sst><si><t>&x;</t></si></sst>')),r'DTD|entity|XML')
    def test_05_missing_shared_string(self): self.error(self.call('xlsx',workbook(shared=f'<sst xmlns="{NS}"/>')),r'shared string|Shared string')
    def test_06_malformed_zip(self): self.error(self.call('xlsx',b'PK\x03\x04garbage'),r'ZIP')
    def test_07_invalid_utf8(self): self.error(self.call('text',b'abc\xff','x.txt'),r'UTF|encoded')
    def test_08_utf16_polish(self): self.assertEqual(self.call('text','Łódź i żółć'.encode('utf-16'),'x.txt')['value'],'Łódź i żółć')
    def test_09_type_rejects(self): self.error(self.call('type',b'','a.xlsm'),r'Unsupported')
    def test_10_size_budget(self): self.error(self.call('size'),r'size|Size')
    def test_11_text_budget(self): self.error(self.call('limit'),r'limit|Limit')
    def test_12_search_polish(self): self.assertEqual(self.call('tokens')['value'],['lodz','zazolc','gesla','jazn'])
    def test_13_office_crc(self):
        b=bytearray(workbook()); offset=b.find(b'PK\x01\x02'); b[offset+16]^=1;self.error(self.call('zip',b),r'CRC|checksum|header')
    def test_14_missing_sheet(self): self.error(self.call('xlsx',workbook(target='worksheets/missing.xml')),r'Missing')
    def test_15_duplicate_names(self): self.error(self.call('xlsx',workbook(extras=[('XL/workbook.xml',b'evil')])),r'Duplicate')
    def test_16_cell_coordinates(self):
        sheet=f'<worksheet xmlns="{NS}"><sheetData><row r="2"><c r="A2" t="b"><v>1</v></c><c r="B2" t="str"><v>Żółć</v></c><c r="C2"><f>NOW()</f></c></row></sheetData></worksheet>'
        r=self.call('xlsx',workbook(sheet=sheet));self.assertIn('A2=TRUE',r['value']);self.assertIn('B2=Żółć',r['value']);self.assertNotIn('NOW',r['value'])
    def test_17_office_expansion_limit(self):
        # Patch central-directory declared size; parser must reject before decompression.
        b=bytearray(workbook()); i=b.find(b'PK\x01\x02'); b[i+24:i+28]=(32*1024*1024).to_bytes(4,'little'); self.error(self.call('zip',b),r'limit|budget|size|header')
    def test_18_docx_preflight(self):
        b=io.BytesIO()
        with zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z: z.writestr('word/document.xml','<w:document xmlns:w="urn:test"><w:p>Żółć</w:p></w:document>')
        self.assertNotIn('error',self.call('zip',b.getvalue(),'x.docx'))
    def test_19_docx_external_entity(self):
        b=io.BytesIO()
        with zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z: z.writestr('word/document.xml','<!DOCTYPE doc [<!ENTITY x SYSTEM "file:///etc/passwd">]><doc>&x;</doc>')
        self.error(self.call('zip',b.getvalue(),'x.docx'),r'DTD|entity')
    def test_20_real_workbook(self):
        from openpyxl import Workbook
        b=io.BytesIO(); w=Workbook(); w.active.title='Zażółć';w.active['B2']='Łódź';w.active['C2']=123;w.create_sheet('Śląsk')['A1']='gęślą';w.save(b)
        r=self.call('xlsx',b.getvalue());self.assertIn('B2=Łódź',r['value']);self.assertIn('C2=123',r['value']);self.assertIn('A1=gęślą',r['value'])
    def test_21_embedding_batch(self):
        r=self.call('batch')['value'];self.assertEqual(r['counts'],[16,16,3]);self.assertEqual(r['vectors'][-1],[34,1])
    def test_22_embedding_count(self): self.error(self.call('bad-batch'),r'count')
    def test_23_embedding_finite(self): self.error(self.call('bad-vector'),r'vector')
if __name__ == '__main__': unittest.main(verbosity=2)
