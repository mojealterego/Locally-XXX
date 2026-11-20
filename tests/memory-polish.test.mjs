import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
// Compile the actual pinned scorer with the manifest overlay, real upstream cosine
// function and actual RAG helper. Only the unrelated MemoryFile type is a fixture.
const root='migration/staged/locally-uncensored';
const path='src/lib/memory-retrieval.ts';
const entry=JSON.parse(readFileSync('overlays/rag/patches.json','utf8'))[path];
let source=readFileSync(join(root,path),'utf8');
assert.equal(createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex'),entry.git_sha1);
for(const {old,new:next} of entry.replacements){assert.ok(source.includes(old));assert.equal(source.indexOf(old),source.lastIndexOf(old));source=source.replace(old,()=>next)}
const rag=readFileSync(join(root,'src/api/rag.ts'),'utf8');
const cosine=rag.match(/export function cosineSimilarity\([\s\S]*?^}/m)?.[0];assert.ok(cosine);
const dir=mkdtempSync(join(tmpdir(),'memory-polish-'));
let mod;
try {
  for(const part of ['src/api','src/lib','src/types'])mkdirSync(join(dir,part),{recursive:true});
  writeFileSync(join(dir,path),source);
  writeFileSync(join(dir,'src/api/rag.ts'),cosine+'\n');
  copyFileSync('overlays/rag/src/api/rag-documents.ts',join(dir,'src/api/rag-documents.ts'));
  writeFileSync(join(dir,'src/types/agent-mode.ts'),"export type MemoryType='user'|'feedback'|'project'|'reference'; export interface MemoryFile { id:string; type:MemoryType; title:string; description:string; content:string; tags:string[]; updatedAt:number; stale?:boolean; supersededBy?:string };\n");
  execFileSync('tsc',['--strict','--target','ES2022','--module','CommonJS','--lib','ES2022,DOM','--outDir',join(dir,'out'),join(dir,path)]);
  mod=await import(pathToFileURL(join(dir,'out/lib/memory-retrieval.js')).href);
}finally{rmSync(dir,{recursive:true,force:true})}
const candidate=(id,title,vector=null,extra={})=>({memory:{id,type:'user',title,description:'',content:'',tags:[],updatedAt:1000,...extra},vector});
const rank=(q,candidates,v=[])=>mod.scoreMemoriesBlended(v,q,candidates,{now:1000});
test('MEM-04 actual scorer rejects unrelated recent user memory',()=>assert.deepEqual(rank('karta',[candidate('x','pogoda')]),[]));
test('MEM-05 actual scorer retrieves inflected title and tag but not substring',()=>{const rows=rank('karta graficzna',[candidate('a','karcie'),candidate('b','karton',null,{tags:['graficznej']}),candidate('c','karton')]);assert.deepEqual(new Set(rows.map(r=>r.memory.id)),new Set(['a','b']));assert.ok(rows.every(r=>Number.isFinite(r.score)))});
test('MEM-06 raw cosine threshold is distinct from relative normalization',()=>{assert.deepEqual(rank('model',[candidate('weak','pogoda',[0.49,Math.sqrt(1-0.49**2)])],[1,0]),[]);assert.equal(rank('model',[candidate('strong','pogoda',[0.51,Math.sqrt(1-0.51**2)])],[1,0])[0].memory.id,'strong')});
test('MEM-07 stale excluded and empty query preview retained',()=>{assert.deepEqual(rank('model',[candidate('old','model',null,{stale:true})]),[]);assert.equal(rank('',[candidate('preview','pogoda')])[0].memory.id,'preview')});
test('MEM-08 bounded query and invalid embeddings cannot inject memory',()=>{assert.deepEqual(rank('x'.repeat(8193),[candidate('x','x')]),[]);assert.deepEqual(rank('rakieta',[candidate('x','pogoda',[NaN,0])],[1,0]),[])});
