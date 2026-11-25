import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {handleModelEvalHttp} from '../apps/web/model-eval-http.mjs';
const dataset={schema_version:'omega.model.eval.v1',model:'local',cases:[{id:'p',language:'pl',prompt:'tak?',expected:['tak']}]};
const result={schema_version:'omega.model.eval.result.v1',execution:'REAL_LOOPBACK_RESPONSES',sample_count:1,summary:{pl:{passed:1}},results:[]};
async function withServer(fn,endpoint='http://127.0.0.1:8080/v1/chat/completions',evaluate=async()=>result){
 const server=createServer(async(req,res)=>{try{if(!await handleModelEvalHttp(req,res,server.address().port,evaluate,endpoint)){res.statusCode=404;res.end()}}catch{res.statusCode=500;res.end()}});
 server.listen(0,'127.0.0.1');await once(server,'listening');try{await fn(server.address().port)}finally{server.close();await once(server,'close')}
}
const send=(p,data=dataset,headers={})=>fetch(`http://127.0.0.1:${p}/api/local/models/evaluate`,{method:'POST',headers:{origin:`http://127.0.0.1:${p}`,'content-type':'application/json','x-omega-models':'1',...headers},body:JSON.stringify(data)});
test('MODEL-EVAL-HTTP-01 forwards bounded plan to trusted local evaluator',()=>withServer(async port=>{
 const r=await send(port);assert.equal(r.status,200);assert.deepEqual(await r.json(),result);
}));
test('MODEL-EVAL-HTTP-02 rejects cross-origin and missing config',async()=>{
 await withServer(async port=>{assert.equal((await send(port,dataset,{origin:'https://evil.example'})).status,403)});
 await withServer(async port=>{assert.equal((await send(port)).status,503)},null);
});
test('MODEL-EVAL-HTTP-03 enforces 12-case cap and strict plan',()=>withServer(async port=>{
 assert.equal((await send(port,{...dataset,cases:Array.from({length:13},(_,i)=>({...dataset.cases[0],id:'p'+i}))})).status,400);
 assert.equal((await send(port,{...dataset,cases:[{...dataset.cases[0],language:'de'}]})).status,400);
}));
