import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,rmSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareStage} from './staged-runtime.mjs';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const PATHS=['src/api/rag.ts','src/hooks/useRAG.ts','src/components/chat/RAGPanel.tsx','src/types/rag.ts','src/lib/memory-retrieval.ts','src/stores/memoryStore.ts'];
const MODULE='src/api/rag-documents.ts';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function patchText(input,entry){
  const bytes=Buffer.from(input,'utf8');
  if(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')!==entry.git_sha1) throw Error('Source SHA mismatch');
  let output=input;
  for(const {old,new:replacement} of entry.replacements){
    if(typeof old!=='string'||!old||typeof replacement!=='string'||!output.includes(old)||output.indexOf(old)!==output.lastIndexOf(old)) throw Error('Missing or ambiguous patch anchor');
    output=output.replace(old,()=>replacement);
  }
  return output;
}
function regular(path){const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink())throw Error('Unsafe overlay file');return readFileSync(path);}
export function prepareRag({allowMissingDocs=false}={}){
  const base=join(ROOT,'overlays','rag');
  const manifest=JSON.parse(regular(join(base,'patches.json')).toString('utf8'));
  if(Object.keys(manifest).length!==PATHS.length||PATHS.some(p=>!Object.hasOwn(manifest,p)))throw Error('Unexpected overlay manifest');
  const module=regular(join(base,MODULE));
  const result=prepareStage({allowMissingDocs,apply:true});
  try{
    const patched=PATHS.map(path=>({path,content:patchText(regular(join(result.output,path)).toString('utf8'),manifest[path])}));
    for(const {path,content} of patched)writeFileSync(join(result.output,path),content,'utf8');
    writeFileSync(join(result.output,MODULE),module,{flag:'wx',mode:0o644});
    const files=[...patched.map(x=>({path:x.path,sha256:sha(Buffer.from(x.content))})),{path:MODULE,sha256:sha(module)}];
    for(const x of files)if(sha(regular(join(result.output,x.path)))!==x.sha256)throw Error('Overlay verification failed');
    return {...result,overlay:'RAG-001',changed:files};
  }catch(e){rmSync(result.output,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const flags=process.argv.slice(2);
  if(flags.length>1||flags.some(x=>x!=='--allow-missing-doc-assets')){console.error('Usage: node scripts/rag-overlay.mjs [--allow-missing-doc-assets]');process.exitCode=2;}
  else try{console.log(JSON.stringify(prepareRag({allowMissingDocs:flags.length===1}),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
