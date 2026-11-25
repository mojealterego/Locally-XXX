import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {once} from 'node:events';
import {handleExperimentHttp} from '../apps/web/experiment-http.mjs';
const result={status:'PLAN_ONLY_NOT_TRAINED',execution:'NO_EXECUTOR_BOUND',authorization:{cloud_plan_authorized:false,external_dataset_egress_authorized:false}};
async function server(fn,worker=async()=>result){const s=createServer(async(req,res)=>{if(!await handleExperimentHttp(req,res,s.address().port,worker)){res.statusCode=404;res.end()}});s.listen(0,'127.0.0.1');await once(s,'listening');try{await fn(s.address().port)}finally{s.close();await once(s,'close')}}
const send=(p,data={},headers={})=>fetch(`http://127.0.0.1:${p}/api/local/experiments/plan`,{method:'POST',headers:{origin:`http://127.0.0.1:${p}`,'x-omega-experiment':'1','content-type':'application/json',...headers},body:JSON.stringify(data)});
test('EXPERIMENT-HTTP-01 accepts plan only',()=>server(async port=>{const r=await send(port);assert.equal(r.status,200);assert.deepEqual(await r.json(),result)}));
test('EXPERIMENT-HTTP-02 blocks origin forgery and oversized input',()=>server(async port=>{
 assert.equal((await send(port,{}, {origin:'https://evil.example'})).status,403);
 assert.equal((await send(port,{payload:'x'.repeat(70000)})).status,413);
}));
test('EXPERIMENT-HTTP-03 denies claimed cloud authorization',()=>server(async port=>{assert.equal((await send(port)).status,502)},async()=>({...result,authorization:{cloud_plan_authorized:true,external_dataset_egress_authorized:false}})));
