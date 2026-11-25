import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {once} from 'node:events';
import {handleComputeHttp} from '../apps/web/compute-http.mjs';
const result={schema_version:'omega.compute.offline.result.v1',execution_mode:'OFFLINE',state:'ROUTE_PLAN_ONLY',runtime_executed:false,cloud_egress:false,telemetry_verified:false,inventory_verified:false};
async function server(fn,worker=async()=>result){const s=createServer(async(req,res)=>{if(!await handleComputeHttp(req,res,s.address().port,worker)){res.statusCode=404;res.end()}});s.listen(0,'127.0.0.1');await once(s,'listening');try{await fn(s.address().port)}finally{s.close();await once(s,'close')}}
const send=(p,data={},headers={})=>fetch(`http://127.0.0.1:${p}/api/local/compute/plan`,{method:'POST',headers:{origin:`http://127.0.0.1:${p}`,'x-omega-compute':'1','content-type':'application/json',...headers},body:JSON.stringify(data)});
test('COMPUTE-HTTP-01 returns offline plan through HTTP',()=>server(async port=>{const r=await send(port);assert.equal(r.status,200);assert.deepEqual(await r.json(),result)}));
test('COMPUTE-HTTP-02 enforces origin and request size',()=>server(async port=>{
 assert.equal((await send(port,{}, {origin:'https://evil.example'})).status,403);
 assert.equal((await send(port,{x:'x'.repeat(70000)})).status,413);
}));
test('COMPUTE-HTTP-03 blocks forged cloud or runtime execution',()=>server(async port=>{assert.equal((await send(port)).status,502)},async()=>({...result,cloud_egress:true})));
