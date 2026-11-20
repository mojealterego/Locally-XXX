import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'rag-retrieval-'));
let mod;
try {execFileSync('tsc',['--strict','--target','ES2022','--module','ES2022','--lib','ES2022,DOM','--outDir',dir,'overlays/rag/src/api/rag-documents.ts']);mod=await import(pathToFileURL(join(dir,'rag-documents.js')).href)} finally {rmSync(dir,{recursive:true,force:true})}
test('BM25 exact Polish tokens and no substring',()=>{const scores=mod.bm25Scores('Łódź',['Łódź Łódź','lodzianin','Śląsk']);assert.ok(scores[0]>0);assert.equal(scores[1],0);assert.equal(scores[2],0)});
test('BM25 repeated query normalized and limit',()=>{assert.deepEqual(mod.bm25Scores('Łódź ŁÓDŹ',['Łódź','Śląsk']),mod.bm25Scores('lodz',['Łódź','Śląsk']));assert.throws(()=>mod.bm25Scores('x'.repeat(8193),['x']),/limit/i)});
test('ordered indices strict and preserves order',()=>{assert.deepEqual(mod.orderedEmbeddings([{index:1,embedding:[2]},{index:0,embedding:[1]}],2),[[1],[2]]);for(const rows of [[{index:0,embedding:[1]},{index:0,embedding:[2]}],[{embedding:[1]},{index:1,embedding:[2]}],[{index:2,embedding:[1]},{index:1,embedding:[2]}]])assert.throws(()=>mod.orderedEmbeddings(rows,2),/index/i)});
test('embedding rejects sparse and nonnumeric',async()=>{await assert.rejects(mod.embedBatches(['x'],async()=>[Array(1)]),/vector/i);await assert.rejects(mod.embedBatches(['x'],async()=>[['1']]),/vector/i)});
test('embedding memory budget rejects large document',async()=>{let calls=0;await assert.rejects(mod.embedBatches(Array(1025).fill('x'),async a=>{calls++;return a.map(()=>Array(4096).fill(1))}),/budget/i);assert.ok(calls<=65)});
test('retrieval limits total corpus and unbounded token fanout',()=>{assert.throws(()=>mod.bm25Scores('x',Array(8193).fill('x')),/limit/i);assert.throws(()=>mod.bm25Scores(Array.from({length:257},(_,i)=>'a'+i).join(' '),['x']),/limit/i)});
