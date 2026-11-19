/** Offline document ingestion. No network, formula execution or external XML entities. */
export const LIMITS = Object.freeze({ fileBytes: 25 * 1024 ** 2, expandedBytes: 64 * 1024 ** 2,
  entryBytes: 16 * 1024 ** 2, entries: 2048, textChars: 1_000_000, pages: 500, cells: 100_000, sheets: 128 })
export type DocumentKind = 'pdf' | 'docx' | 'txt' | 'xlsx'
export function documentType(file: File): DocumentKind {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext !== 'pdf' && ext !== 'docx' && ext !== 'txt' && ext !== 'xlsx') throw Error('Unsupported document type')
  if (file.size > LIMITS.fileBytes) throw Error('Document size limit exceeded (25 MiB)')
  return ext
}
export function boundedText(text: string): string {
  if (text.length > LIMITS.textChars) throw Error('Extracted text limit exceeded')
  const normalized = text.normalize('NFC')
  if (normalized.length > LIMITS.textChars) throw Error('Normalized text limit exceeded')
  return normalized
}
export function searchTokens(text: string): string[] {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').match(/[\p{L}\p{N}]+/gu) ?? []
}
export async function extractPlainText(file: File): Promise<string> {
  documentType(file)
  const b = new Uint8Array(await file.arrayBuffer())
  const encoding = b[0] === 255 && b[1] === 254 ? 'utf-16le' : b[0] === 254 && b[1] === 255 ? 'utf-16be' : 'utf-8'
  try { return boundedText(new TextDecoder(encoding, { fatal: true }).decode(b)) }
  catch (e) { if (e instanceof TypeError) throw Error('Invalid UTF encoded text'); throw e }
}
const decoder = new TextDecoder('utf-8', { fatal: true })
function safePath(name: string): string {
  const path = name.endsWith('/') ? name.slice(0, -1) : name
  if (!path || /[\\:\x00-\x1f\x7f]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Unsafe ZIP path')
  return path
}
const crcTable = Uint32Array.from({length: 256}, (_, i) => {
  for (let j = 0; j < 8; j++) i = (i >>> 1) ^ ((i & 1) ? 0xedb88320 : 0)
  return i >>> 0
})
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const b of data) crc = (crc >>> 8) ^ crcTable[(crc ^ b) & 255]
  return (crc ^ 0xffffffff) >>> 0
}
async function inflate(data: Uint8Array, method: number, expected: number): Promise<Uint8Array> {
  if (method === 0) { if (data.length !== expected) throw Error('ZIP size mismatch'); return data }
  const reader = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const out = new Uint8Array(expected)
  let size = 0
  try {
    for (;;) {
      const {value, done} = await reader.read(); if (done) break
      if (size + value.length > expected) throw Error('ZIP expansion exceeds declared size')
      out.set(value, size); size += value.length
    }
    if (size !== expected) throw Error('ZIP expanded size mismatch')
    return out
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
/** Strict subset: single-disk ZIP, stored/deflate, no encryption, ZIP64 or unsafe paths. */
async function readZip(file: File): Promise<Map<string, Uint8Array>> {
  documentType(file)
  const b = new Uint8Array(await file.arrayBuffer()), v = new DataView(b.buffer)
  const u16 = (p: number) => v.getUint16(p, true), u32 = (p: number) => v.getUint32(p, true)
  let end = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (u32(i) === 0x06054b50 && i + 22 + u16(i + 20) === b.length) { end = i; break }
  }
  if (end < 0) throw Error('Invalid ZIP central directory')
  const count = u16(end + 10), start = u32(end + 16), length = u32(end + 12)
  if (u16(end+4)||u16(end+6)||u16(end+8)!==count || !count || count>LIMITS.entries || start+length!==end) throw Error('ZIP directory limit or unsupported format')
  const entries: {name:string; local:number; offset:number; size:number; compressed:number; method:number; crc:number; directory:boolean}[] = []
  const seen = new Set<string>(); let total = 0, p = start
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || u32(p)!==0x02014b50) throw Error('Invalid ZIP central header')
    const flags=u16(p+8), method=u16(p+10), crc=u32(p+16), compressed=u32(p+20), size=u32(p+24)
    const n=u16(p+28), extra=u16(p+30), comment=u16(p+32), local=u32(p+42), next=p+46+n+extra+comment
    if (next>end || (flags & ~0x080e) || ![0,8].includes(method) || u16(p+34)) throw Error('Unsupported ZIP header')
    if (size>LIMITS.entryBytes || (total+=size)>LIMITS.expandedBytes) throw Error('ZIP expansion size limit exceeded')
    const raw=b.subarray(p+46,p+46+n), name=safePath(decoder.decode(raw)), directory=raw[raw.length-1]===47
    if (seen.has(name.toLowerCase())) throw Error('Duplicate ZIP path'); seen.add(name.toLowerCase())
    if (local+30>start || u32(local)!==0x04034b50 || u16(local+6)!==flags || u16(local+8)!==method) throw Error('Invalid ZIP local header')
    const localName=u16(local+26), offset=local+30+localName+u16(local+28)
    if (offset+compressed>start || localName!==n || !raw.every((x,j)=>x===b[local+30+j])) throw Error('ZIP local name or size mismatch')
    if (!(flags&8) && (u32(local+14)!==crc || u32(local+18)!==compressed || u32(local+22)!==size)) throw Error('ZIP local header checksum mismatch')
    if (directory && (size!==0 || compressed>2)) throw Error('Invalid ZIP directory entry')
    entries.push({name,local,offset,size,compressed,method,crc,directory}); p=next
  }
  if (p!==end) throw Error('ZIP central directory length mismatch')
  const intervals=[...entries].sort((a,b)=>a.local-b.local)
  for(let i=1;i<intervals.length;i++) if(intervals[i-1].offset+intervals[i-1].compressed>intervals[i].local) throw Error('Overlapping ZIP entries')
  const result=new Map<string,Uint8Array>()
  for(const e of entries) {
    const data=await inflate(b.subarray(e.offset,e.offset+e.compressed),e.method,e.size)
    if(crc32(data)!==e.crc) throw Error('ZIP CRC mismatch')
    if(!e.directory) result.set(e.name,data)
  }
  return result
}
export async function validateOffice(file: File): Promise<void> {
  const files = await readZip(file)
  if (documentType(file) === 'docx' && !files.has('word/document.xml')) throw Error('Missing DOCX document.xml')
  for (const [name, data] of files) if (/\.(xml|rels)$/i.test(name)) {
    if (/<!\s*(DOCTYPE|ENTITY)/i.test(decoder.decode(data))) throw Error('XML DTD/entity declarations forbidden')
  }
}
function xml(files: Map<string,Uint8Array>, path: string): Document {
  const data=files.get(path); if(!data) throw Error('Missing Office entry: '+path)
  const text=decoder.decode(data)
  if(/<!\s*(DOCTYPE|ENTITY)/i.test(text)) throw Error('XML DTD/entity declarations forbidden')
  const doc=new DOMParser().parseFromString(text,'application/xml')
  if(doc.getElementsByTagNameNS('*','parsererror').length) throw Error('Invalid Office XML: '+path)
  return doc
}
const els = (node: Document|Element, name: string): Element[] => Array.from(node.getElementsByTagNameNS('*',name))
const first = (node: Element,name:string) => els(node,name)[0]?.textContent ?? ''
const rich = (node:Element) => els(node,'t').filter(e=>!e.closest('rPh')).map(e=>e.textContent??'').join('')
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const STRICT_REL='http://purl.oclc.org/ooxml/officeDocument/relationships'
export async function extractXlsx(file: File): Promise<string> {
  if(documentType(file)!=='xlsx') throw Error('Expected XLSX')
  const files=await readZip(file)
  const workbook=xml(files,'xl/workbook.xml'), rels=xml(files,'xl/_rels/workbook.xml.rels')
  const targets=new Map<string,string>()
  for(const r of els(rels,'Relationship')) {
    const id=r.getAttribute('Id'), type=r.getAttribute('Type')??'', target=r.getAttribute('Target')??''
    if(!type.endsWith('/worksheet')) continue
    if(!id||targets.has(id)||r.getAttribute('TargetMode')?.toLowerCase()==='external'||/[:?#%\\]/.test(target)) throw Error('Unsafe worksheet target')
    const path=safePath(target.startsWith('/')?target.slice(1):'xl/'+target)
    if(!path.startsWith('xl/worksheets/')) throw Error('Unsafe worksheet target')
    targets.set(id,path)
  }
  const shared=files.has('xl/sharedStrings.xml')?els(xml(files,'xl/sharedStrings.xml'),'si').map(rich):[]
  if(shared.length>LIMITS.cells) throw Error('Shared string limit exceeded')
  const sheets=els(workbook,'sheet'); if(!sheets.length||sheets.length>LIMITS.sheets) throw Error('Worksheet count limit exceeded')
  const output:string[]=[]; let chars=0, cells=0
  const push=(line:string)=>{chars+=line.length+1;if(chars>LIMITS.textChars)throw Error('Extracted text limit exceeded');output.push(line)}
  for(const sheet of sheets) {
    const id=sheet.getAttributeNS(REL,'id')??sheet.getAttributeNS(STRICT_REL,'id')??'', path=targets.get(id)
    if(!path) throw Error('Missing worksheet relationship')
    push('[Arkusz: '+(sheet.getAttribute('name')??id)+']')
    for(const row of els(xml(files,path),'row')) {
      const values:string[]=[]; let rowChars=0
      for(const cell of els(row,'c')) {
        if(++cells>LIMITS.cells) throw Error('Cell count limit exceeded')
        const address=cell.getAttribute('r')??'', type=cell.getAttribute('t')??'', v=first(cell,'v')
        if(!/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(address)) throw Error('Invalid cell address')
        let value=v
        if(type==='s') { if(!/^\d+$/.test(v)||Number(v)>=shared.length) throw Error('Invalid shared string index'); value=shared[Number(v)] }
        else if(type==='inlineStr') value=rich(cell)
        else if(type==='b') { if(v!=='0'&&v!=='1') throw Error('Invalid boolean cell'); value=v==='1'?'TRUE':'FALSE' }
        if(value) {const item=address+'='+value;rowChars+=item.length+3;if(chars+rowChars>LIMITS.textChars)throw Error('Extracted text limit exceeded');values.push(item)}
      }
      if(values.length) push(values.join(' | '))
    }
  }
  return boundedText(output.join('\n'))
}

/** Bound embedding batch memory; malformed replies never reach the vector store. */
export async function embedBatches(chunks: string[], embed: (batch: string[]) => Promise<number[][]>): Promise<number[][]> {
  if (chunks.length > 4096) throw Error('Document chunk limit exceeded')
  const vectors: number[][] = []; let dimension = 0
  for (let i = 0; i < chunks.length; i += 16) {
    const batch = chunks.slice(i, i + 16), result = await embed(batch)
    if (!Array.isArray(result) || result.length !== batch.length) throw Error('Embedding response count mismatch')
    for (const vector of result) {
      if (!Array.isArray(vector) || !vector.length || vector.length > 4096 || vector.some(n => !Number.isFinite(n))) throw Error('Invalid embedding vector')
      if (dimension && dimension !== vector.length) throw Error('Embedding dimension mismatch')
      dimension = vector.length; vectors.push(vector)
    }
  }
  return vectors
}
