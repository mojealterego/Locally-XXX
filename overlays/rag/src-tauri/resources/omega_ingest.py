"""Local document extraction worker. No network, no formula execution, bounded IPC."""
import io, json, pathlib, re, stat, sys, unicodedata, zipfile
import xml.etree.ElementTree as ET

FILE_LIMIT=25*1024**2
ZIP_LIMIT=64*1024**2
TEXT_LIMIT=180_000
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def limit_process():
    import resource
    for key,limit in [(resource.RLIMIT_CPU,20),(resource.RLIMIT_AS,768*1024**2)]:
        _,hard=resource.getrlimit(key)
        cap=limit if hard==resource.RLIM_INFINITY else min(limit,hard)
        resource.setrlimit(key,(cap,hard))


def clean_text(text):
    text=unicodedata.normalize('NFC',text)
    if len(text)>TEXT_LIMIT or len(text.encode('utf-8'))>TEXT_LIMIT:
        raise ValueError('Extracted text limit exceeded')
    return text


def safe_office(path):
    with zipfile.ZipFile(path) as z:
        entries=z.infolist();seen=set();total=0
        if not entries or len(entries)>2048:raise ValueError('ZIP entry limit')
        for entry in entries:
            name=entry.filename.rstrip('/');parts=name.split('/')
            if not name or any(p in ('','.','..') for p in parts) or re.search(r'[\\:\x00-\x1f\x7f]',name):raise ValueError('Unsafe ZIP path')
            if name.casefold() in seen or stat.S_ISLNK(entry.external_attr>>16) or entry.flag_bits&1:raise ValueError('Unsafe ZIP entry')
            seen.add(name.casefold());total+=entry.file_size
            if entry.file_size>16*1024**2 or total>ZIP_LIMIT:raise ValueError('ZIP expansion limit')
            if entry.is_dir():continue
            with z.open(entry) as f:data=f.read(entry.file_size+1)
            if len(data)!=entry.file_size:raise ValueError('ZIP size mismatch')
            if name.lower().endswith(('.xml','.rels')):
                text=data.decode('utf-8-sig')
                if '\x00' in text or re.search(r'<!\s*(DOCTYPE|ENTITY)',text,re.I):raise ValueError('XML declarations forbidden')
    return seen


def extract(kind,path):
    if kind not in ('txt','docx','xlsx','pdf'):raise ValueError('Unsupported document type')
    if not path.is_file() or path.is_symlink() or path.stat().st_size>FILE_LIMIT:raise ValueError('Invalid input or file limit')
    if kind=='txt':
        raw=path.read_bytes();return clean_text(raw.decode('utf-16' if raw.startswith((b'\xff\xfe',b'\xfe\xff')) else 'utf-8-sig'))
    if kind in ('docx','xlsx'):safe_office(path)
    parts=[];size=0
    def append(text):
        nonlocal size
        size+=len(text.encode('utf-8'))+1
        if size>TEXT_LIMIT:raise ValueError('Extracted text limit exceeded')
        parts.append(text)
    if kind=='docx':
        with zipfile.ZipFile(path) as z:root=ET.fromstring(z.read('word/document.xml'))
        if root.tag!=W+'document':raise ValueError('Invalid DOCX document')
        for p in root.iter(W+'p'):append(''.join(t.text or '' for t in p.iter(W+'t')))
    elif kind=='xlsx':
        from openpyxl import load_workbook
        book=load_workbook(io.BytesIO(path.read_bytes()),read_only=True,data_only=True,keep_links=False)
        try:
            if len(book.worksheets)>128:raise ValueError('Worksheet limit')
            cells=0
            for sheet in book.worksheets:
                append('[Arkusz: '+sheet.title+']')
                if (sheet.max_row or 0)>100000 or (sheet.max_column or 0)>1024:raise ValueError('Worksheet dimensions limit')
                # Do not trust a too-small declared worksheet dimension.
                sheet.reset_dimensions()
                for row_index,row in enumerate(sheet.iter_rows(),1):
                    if row_index>100000 or len(row)>1024:raise ValueError('Worksheet dimensions limit')
                    values=[]
                    for c in row:
                        if c.value is not None:
                            cells+=1
                            if cells>100000:raise ValueError('Cell limit')
                            values.append(f'{c.coordinate}={c.value}')
                    if values:append(' | '.join(values))
        finally:book.close()
    else:
        from pypdf import PdfReader
        with path.open('rb') as f:
            reader=PdfReader(f,strict=True)
            if reader.is_encrypted or len(reader.pages)>500:raise ValueError('Encrypted PDF or page limit')
            for page in reader.pages:append(page.extract_text() or '')
    return clean_text('\n'.join(parts))


def main():
    try:
        limit_process()
        if len(sys.argv)!=3:raise ValueError('Expected kind and private input path')
        value={'text':extract(sys.argv[1],pathlib.Path(sys.argv[2]))}
        encoded=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode('utf-8')
        if len(encoded)>240_000:raise ValueError('IPC output limit')
    except Exception as e:
        encoded=json.dumps({'error':str(e)[:512]},ensure_ascii=True).encode('ascii')
    sys.stdout.buffer.write(encoded+b'\n')

if __name__=='__main__':main()
