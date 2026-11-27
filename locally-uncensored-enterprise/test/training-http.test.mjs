import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {handleTrainingHttp} from '../apps/web/training-http.mjs';
import {prepareExamples} from '../backend/src/training/dataset.mjs';
const jsonl=Array.from({length:60},(_,i)=>JSON.stringify({instruction:'Pytanie '+i,output:'Odpowiedź '+i,source:'fixture',license:'MIT'})).join('\n');
const body={jsonl,evalPercent:20};
const sha=s=>createHash('sha256').update(s).digest('hex');
async function withServer(fn){
 const server=createServer(async(req,res)=>{try{if(!await handleTrainingHttp(req,res,server.address().port)){res.statusCode=404;res.end()}}catch{res.statusCode=500;res.end()}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const base='http://127.0.0.1:'+server.address().port;
 const headers={origin:base,'content-type':'application/json','x-omega-training':'1'};
 const post=(value=body,h=headers)=>fetch(base+'/api/local/training/prepare',{method:'POST',headers:h,body:JSON.stringify(value)});
 try{await fn({base,headers,post})}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
test('TRWEB-01: real dataset split, disjoint records and matching hashes',()=>withServer(async({post})=>{
 const res=await post();assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');const data=await res.json();assert.deepEqual(data,prepareExamples(jsonl,{evalPercent:20}));assert.equal(data.manifest.train+data.manifest.eval,60);assert.equal(sha(data.trainText),data.manifest.trainSha256);assert.equal(sha(data.evalText),data.manifest.evalSha256);const train=new Set(data.trainText.trim().split('\n'));assert.ok(data.evalText.trim().split('\n').every(x=>!train.has(x)));assert.deepEqual(await (await post()).json(),data);
}));
test('TRWEB-02: cross-origin and missing header denied, GET rejected',()=>withServer(async({post,headers,base})=>{
 assert.equal((await post(body,{...headers,origin:'https://example.invalid'})).status,403);assert.equal((await post(body,{...headers,'x-omega-training':'0'})).status,403);assert.equal((await fetch(base+'/api/local/training/prepare')).status,405);assert.equal((await fetch(base+'/not-found')).status,404);
}));
test('TRWEB-03: rejects invalid data, extra fields and execution requests',()=>withServer(async({post})=>{
 for(const bad of [{...body,execute:true},{...body,outputDir:'/tmp/x'},{...body,evalPercent:99},{...body,jsonl:'not JSONL'},{...body,jsonl:JSON.stringify({instruction:'x',output:'y'})}])assert.equal((await post(bad)).status,400);
}));
test('TRWEB-04: bounded body before parsing',()=>withServer(async({post})=>{
 assert.equal((await post({jsonl:'x'.repeat(1100000),evalPercent:20})).status,413);
}));
