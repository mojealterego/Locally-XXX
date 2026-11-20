import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogIndex, searchCatalog} from '../integrations/src/catalog-index.mjs';
import {allocateHistoricalTokens, historicalWeight} from '../backend/src/optimization/token-budget.mjs';
import {viewportScale,viewportLayout} from '../ide-studio/workspace.mjs';

const models=[
{id:'m1',name:'Qwen 3.5 VL',description:'local vision',category:'vision',tags:['gguf','multimodal'],year:2026,updatedAt:'2026-11-01'},
{id:'m2',name:'Llama.cpp',description:'local inference runtime',category:'inference',tags:['gguf'],year:2024,updatedAt:'2025-12-12'},
{id:'m3',name:'Ollama',description:'inference',category:'inference',tags:['local'],year:2023,updatedAt:'2025-01-01'},
{id:'m4',name:'Polish Agent',description:'Programowanie i kod',category:'agent',tags:['kod'],year:2025,updatedAt:'2026-04-01'}
];
test('CAT-01 token-AND searching, polish accents, semantic categories and years',()=>{
 const index=createCatalogIndex(models);
 assert.deepEqual(searchCatalog(index,{query:'QWEN vision'}).items.map(x=>x.id),['m1']);
 assert.deepEqual(searchCatalog(index,{query:'programowanie KOD'}).items.map(x=>x.id),['m4']);
 assert.deepEqual(searchCatalog(index,{query:'POLISH'}).items.map(x=>x.id),['m4']);
 assert.deepEqual(searchCatalog(index,{category:'inference',yearFrom:2024}).items.map(x=>x.id),['m2']);
 assert.equal(searchCatalog(index,{query:'nonexistent'}).total,0);
});
test('CAT-02 multi-column stable sorting and pagination',()=>{
 const index=createCatalogIndex(models);
 const q=searchCatalog(index,{sort:'name',direction:'asc',offset:1,limit:2});
 assert.equal(q.total,4);assert.equal(q.items.length,2);assert.ok(q.hasMore);
 const names=searchCatalog(index,{sort:'year',direction:'desc'}).items;
 assert.equal(names[0].id,'m1');assert.equal(names.at(-1).id,'m3');
 assert.deepEqual(searchCatalog(index,{tag:'gguf'}).items.map(x=>x.id).sort(),['m1','m2']);
});
test('CAT-03 validation rejects unsafe prototype keys, duplicate ids, invalid pagination, big rows',()=>{
 assert.throws(()=>createCatalogIndex([...models,models[0]]));
 assert.throws(()=>createCatalogIndex([{id:'bad',name:'a',description:'b',category:'x',tags:['x'],year:2024,updatedAt:'2024-01-01',__proto__:null}]));
 assert.throws(()=>createCatalogIndex([{...models[0],description:'a'.repeat(5000)}]));
 const index=createCatalogIndex(models);for(const q of [{limit:1000},{offset:-1},{sort:'constructor'},{direction:'up'},{yearFrom:2027,yearTo:2024}])assert.throws(()=>searchCatalog(index,q));
});
test('CAT-04 index is snapshot, never accesses arbitrary fields, cannot mutate returned data',()=>{
 const original=structuredClone(models),index=createCatalogIndex(models);models[0].name='changed';
 assert.equal(searchCatalog(index,{query:'qwen'}).items[0].name,original[0].name);
 const result=searchCatalog(index);assert.ok(Object.isFrozen(result.items[0]));
 assert.throws(()=>{result.items[0].name='attack'});
});
test('CTX-06 normalized weights decaying with age, strict integer budget',()=>{
 const weights=[historicalWeight(3,0.5),historicalWeight(2,0.5),historicalWeight(1,0.5),historicalWeight(0,0.5)];
 assert.ok(weights.every((w,i)=>i===0||w>=weights[i-1]));
 const quotas=allocateHistoricalTokens(137,weights);
 assert.equal(quotas.reduce((a,b)=>a+b,0),137);
 assert.ok(quotas.every((v,i)=>i===0||v>=quotas[i-1]));
 assert.deepEqual(allocateHistoricalTokens(0,weights),[0,0,0,0]);
 assert.deepEqual(allocateHistoricalTokens(10,[1,1,1]),[4,3,3]);
});
test('CTX-07 allocation deterministic and hostile data fail closed',()=>{
 assert.deepEqual(allocateHistoricalTokens(19,[1,1]),[10,9]);
 for(const bad of [[0,0],[1,NaN],[1,Infinity],[],[-1,2]])assert.throws(()=>allocateHistoricalTokens(12,bad));
 for(const b of [-1,1.3,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>allocateHistoricalTokens(b,[1]));
 assert.throws(()=>historicalWeight(-1,0.5));assert.throws(()=>historicalWeight(1,0));
});
test('VIEW-06 full viewport bounds; screenshot height corresponds to unscaled coordinates',()=>{
 const l=viewportLayout(393,852,300,450);
 assert.equal(l.scale,Math.min(1,300/393,450/852));
 assert.equal(l.renderedWidth,393*l.scale);assert.equal(l.renderedHeight,852*l.scale);
 assert.equal(l.unscaledVisibleHeight,450/l.scale);
 assert.ok(l.renderedWidth<=300&&l.renderedHeight<=450);
 assert.equal(viewportScale(393,852,300,450),l.scale);
});
test('VIEW-07 no overzoom; invalid dimensions denied',()=>{
 assert.equal(viewportLayout(393,852,800,2000).scale,1);
 for(const bad of [[0,852,400,500],[393,852,Infinity,450],[393,-2,300,450]])assert.throws(()=>viewportLayout(...bad));
});

import {mountCatalog} from '../integrations/src/catalog-browser.mjs';
test('CAT-05 DOM adapter filters available modules and does not enable planned capabilities',()=>{
 class E{constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.value='';this.dataset={};this.textContent='';this.disabled=false;this.attributes={};}append(...els){this.children.push(...els)}replaceChildren(...els){this.children=els}setAttribute(k,v){this.attributes[k]=v}addEventListener(k,v){this.listeners[k]=v}removeEventListener(k){delete this.listeners[k]}}
 const old=globalThis.document;globalThis.document={createElement:t=>new E(t)};
 try{const root=new E('root'),opened=[],c=mountCatalog(root,[{id:'m1',label:'Vision',available:true},{id:'m2',label:'Planned',available:false}],id=>opened.push(id));const [input,filter,info,grid]=root.children;assert.equal(grid.children.length,2);input.value='VISION';input.listeners.input();assert.equal(grid.children.length,1);grid.children[0].onclick();assert.deepEqual(opened,['m1']);input.value='';filter.value='planned';filter.listeners.change();assert.equal(grid.children.length,1);assert.equal(grid.children[0].disabled,true);c.dispose();assert.equal(Object.keys(input.listeners).length,0)}finally{globalThis.document=old}
});
import {compressContext} from '../backend/src/optimization/context-compressor.mjs';
test('CTX-08 compressor obeys global weighted allocation while protecting system and recent',async()=>{
 const history=[{id:'old',role:'user',content:'A'.repeat(800)},{id:'mid',role:'assistant',content:'B'.repeat(800)},{id:'latest',role:'user',content:'Keep literal'}];
 const count=async messages=>messages.reduce((n,m)=>n+new TextEncoder().encode(m.content).byteLength+2,0);
 const r=await compressContext({system:'Do not discard this',messages:history,maxTokens:550,outputReserve:50,recent:1,decay:0.5,count,summarize:async()=> 'summary'});
 assert.equal(r.messages[0].content,'Do not discard this');assert.equal(r.messages.at(-1).content,'Keep literal');assert.ok(r.tokens+50<=550);assert.equal(r.archive.length,2);assert.ok(r.archive[1].target>=r.archive[0].target);
 const p=await compressContext({system:'base',messages:history,maxTokens:950,outputReserve:50,recent:1,pinned:['old'],count,summarize:async()=> 'summ'});
 assert.equal(p.messages[1].content,history[0].content);assert.deepEqual(p.archive.map(x=>x.id),['mid']);
});
test('CTX-09 protected overflow fails rather than truncate recent',async()=>{
 await assert.rejects(compressContext({system:'S'.repeat(300),messages:[{id:'new',role:'user',content:'X'.repeat(300)}],maxTokens:400,outputReserve:50,recent:1,count:async m=>m.reduce((s,x)=>s+x.content.length,0),summarize:async()=>''}),/Protected/);
});
test('CAT-06 index internals are private, diacritic matching and stable metadata',()=>{
 const source=[{id:'pl',name:'Łódź',description:'Miasto',category:'places',tags:[],year:2025,updatedAt:'2025-11-21'}];
 const index=createCatalogIndex(source);
 assert.equal(Object.hasOwn(index,'entries'),false);assert.equal(index.size,1);
 assert.deepEqual(searchCatalog(index,{query:'Lodz'}).items.map(x=>x.id),['pl']);
 assert.deepEqual(searchCatalog(index,{query:'łódź'}).items.map(x=>x.id),['pl']);
 assert.throws(()=>searchCatalog({...index},{}));
});
