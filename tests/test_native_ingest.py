import importlib.util, io, pathlib, subprocess, sys, tempfile, unittest, zipfile, json
from docx import Document
from openpyxl import Workbook
from reportlab.pdfgen.canvas import Canvas
SCRIPT=pathlib.Path('overlays/rag/src-tauri/resources/omega_ingest.py').resolve()

def run(kind,data):
    with tempfile.TemporaryDirectory() as d:
        p=pathlib.Path(d)/'input';p.write_bytes(data)
        r=subprocess.run([sys.executable,'-I',str(SCRIPT),kind,str(p)],capture_output=True,timeout=20,check=True)
        return json.loads(r.stdout)

class Ingest(unittest.TestCase):
    def test_txt_utf8_and_utf16(self):
        for data in ['Zażółć gęślą jaźń'.encode(),'Zażółć gęślą jaźń'.encode('utf-16')]:self.assertEqual(run('txt',data)['text'],'Zażółć gęślą jaźń')
    def test_docx_real(self):
        d=Document();d.add_paragraph('Polski dokument');d.add_table(rows=1,cols=1).cell(0,0).text='Wartość';b=io.BytesIO();d.save(b);text=run('docx',b.getvalue())['text'];self.assertIn('Polski dokument',text);self.assertIn('Wartość',text)
    def test_xlsx_actual_values_and_no_formula_execution(self):
        w=Workbook();w.active.title='Koszty';w.active['A1']='Budżet';w.active['B1']=123;w.active['C1']='=1+2';b=io.BytesIO();w.save(b);text=run('xlsx',b.getvalue())['text'];self.assertIn('Koszty',text);self.assertIn('A1=Budżet',text);self.assertIn('B1=123',text);self.assertNotIn('=1+2',text)
    def test_pdf_real(self):
        b=io.BytesIO();c=Canvas(b);c.drawString(10,700,'Local PDF 123');c.save();self.assertIn('Local PDF 123',run('pdf',b.getvalue())['text'])
    def test_traversal_and_xml_dtd(self):
        for name,xml in [('../secret','x'),('word/document.xml','<!DOCTYPE x [<!ENTITY y "evil">]><x>&y;</x>')]:
            b=io.BytesIO();with_zip=zipfile.ZipFile(b,'w');with_zip.writestr(name,xml);with_zip.close();self.assertIn('error',run('docx',b.getvalue()))
    def test_invalid_utf_and_output_limit(self):
        self.assertIn('error',run('txt',b'\xff'));self.assertIn('error',run('txt',b'x'*200001))
    def test_unsupported_and_corrupt(self):
        self.assertIn('error',run('html',b'<h1>test</h1>'));self.assertIn('error',run('pdf',b'no pdf'))
if __name__=='__main__':unittest.main()
