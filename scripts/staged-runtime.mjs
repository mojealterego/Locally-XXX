import {createHash} from 'node:crypto';
import {constants,openSync,closeSync,fstatSync,readSync,lstatSync,readdirSync,realpathSync,mkdirSync,mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PINNED_UPSTREAM_SHA} from './upstream-gate.mjs';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const DOCS=new Set(['docs/demo.gif','docs/social-preview.png']);
const MAX_FILES=20000, MAX_BYTES=2*1024**3, MAX_FILE=64*1024**2;
function safePath(path){
  if(typeof path!=='string'||!path||/[\\:\x00-\x1f\x7f]/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'||p.toLowerCase()==='.git'))throw Error('Unsafe index path: '+path);
  return path;
}
function realDir(path){const s=lstatSync(path);if(!s.isDirectory()||s.isSymbolicLink())throw Error('Unsafe directory or symlink: '+path);return path;}
function beneath(root,parts){let path=root;for(const part of parts)path=realDir(join(path,part));return path;}
function readBounded(path,limit,entry){
  const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink())throw Error('Unsafe file or symlink: '+path);
  const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
    const before=fstatSync(fd);
    if(!before.isFile()||before.dev!==s.dev||before.ino!==s.ino||before.size>limit||(entry&&before.size!==entry.bytes))throw Error('File size or identity mismatch: '+path);
    if(entry&&process.platform!=='win32'&&Boolean(before.mode&0o111)!==(entry.mode==='100755'))throw Error('Executable mode mismatch: '+path);
    const b=Buffer.alloc(before.size);let n=0;
    while(n<b.length){const got=readSync(fd,b,n,b.length-n,n);if(!got)throw Error('Truncated file: '+path);n+=got;}
    const after=fstatSync(fd);if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw Error('File mutated during read: '+path);
    if(entry&&createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex')!==entry.git_sha1)throw Error('Git checksum mismatch: '+entry.path);
    return b;
  }finally{closeSync(fd);}
}
function loadIndex(root,expectedSha){
  if(!/^[a-f0-9]{40}$/.test(expectedSha))throw Error('Invalid expected SHA');
  const data=JSON.parse(readBounded(join(beneath(root,['docs']),'UPSTREAM_FILE_INDEX.json'),8*1024**2).toString('utf8'));
  if(data.schema!==1||data.source_commit!==expectedSha||!Array.isArray(data.files)||data.file_count!==data.files.length||!data.files.length||data.files.length>MAX_FILES)throw Error('Invalid source index');
  const map=new Map();let total=0;
  for(const e of data.files){const p=safePath(e?.path);if(map.has(p))throw Error('Duplicate index path: '+p);
    if(!['100644','100755'].includes(e.mode)||!Number.isSafeInteger(e.bytes)||e.bytes<0||e.bytes>MAX_FILE||!(/^[a-f0-9]{40}$/.test(e.git_sha1)))throw Error('Invalid index metadata: '+p);
    total+=e.bytes;if(total>MAX_BYTES)throw Error('Index byte budget exceeded');map.set(p,e);
  }
  if(total!==data.total_bytes)throw Error('Index total bytes mismatch');return map;
}
function scan(stage,index){
  const seen=new Set(),stack=[['',stage]];let count=0;
  while(stack.length){const [prefix,dir]=stack.pop();realDir(dir);
    for(const item of readdirSync(dir)){if(++count>2*MAX_FILES)throw Error('Entry budget exceeded');const rel=prefix?prefix+'/'+item:item;const path=join(dir,item);const s=lstatSync(path);
      if(s.isSymbolicLink())throw Error('Unsafe symlink: '+rel);
      if(s.isDirectory()){stack.push([rel,path]);continue;}
      if(!s.isFile()||!index.has(rel))throw Error('Unexpected file: '+rel);seen.add(rel);
    }
  }return seen;
}
function readEntry(stage,e){const parts=e.path.split('/');const name=parts.pop();return readBounded(join(beneath(stage,parts),name),MAX_FILE,e);}
export function prepareStage({root=ROOT,expectedSha=PINNED_UPSTREAM_SHA,allowMissingDocs=false,apply=false}={}){
  const project=realDir(realpathSync(resolve(root)));const stage=beneath(project,['migration','staged','locally-uncensored']);const index=loadIndex(project,expectedSha);const seen=scan(stage,index);
  const missing=[...index.keys()].filter(p=>!seen.has(p)).sort();
  if(missing.some(p=>!allowMissingDocs||!DOCS.has(p)))throw Error('Missing indexed files: '+missing.join(', '));
  let bytes=0;for(const p of seen)bytes+=readEntry(stage,index.get(p)).length;
  const result={sourceCommit:expectedSha,status:missing.length?'documentation-incomplete':'complete',files:seen.size,bytes,missing,output:null};
  if(!apply)return result;
  const parent=join(project,'runtime');try{mkdirSync(parent,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}realDir(parent);
  const output=mkdtempSync(join(parent,'locally-uncensored-'));
  try{
    for(const p of seen){const e=index.get(p),b=readEntry(stage,e),dest=join(output,...p.split('/'));mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,b,{flag:'wx',mode:e.mode==='100755'?0o755:0o644});chmodSync(dest,e.mode==='100755'?0o755:0o644);}
    const copied=scan(output,index);if(copied.size!==seen.size||[...seen].some(p=>!copied.has(p)))throw Error('Copy inventory mismatch');
    for(const p of copied)readEntry(output,index.get(p));
    return {...result,output};
  }catch(e){rmSync(output,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [action,...flags]=process.argv.slice(2);
  if(!['check','prepare'].includes(action)||flags.length>1||flags.some(f=>f!=='--allow-missing-doc-assets')){console.error('Usage: node scripts/staged-runtime.mjs check|prepare [--allow-missing-doc-assets]');process.exitCode=2;}
  else try{console.log(JSON.stringify(prepareStage({apply:action==='prepare',allowMissingDocs:flags.length===1}),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
