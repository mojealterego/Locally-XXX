import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {once} from 'node:events';
import {handleKnowledgeHttp} from '../apps/web/knowledge-http.mjs';
const result={schema_version:'omega.knowledge.reconciliation.v1',action_executed:false,memory_persisted:false,proof_state:'NO_CHECKED_PROOF',share_state:'PRIVATE_ONLY',decision:'DENIED'};
async function server(fn,runner=async()=>result){const s=createServer(async(req,res)=>{if(!await handleKnowledgeHttp(req,res,s.address().port,runner)){res.statusCode=404;res.end()}});s.listen(0,'127.0.0.1');await once(s,'listening');try{await fn(s.address().port)}finally{s.close();await once(s,'close')}}
const send=(port,data={},headers={})=>fetch(`http://127.0.0.1:${port}/api/local/knowledge/reconcile`,{method:'POST',headers:{origin:`http://127.0.0.1:${port}`,'content-type':'application/json','x-omega-knowledge':'1',...headers},body:JSON.stringify(data)});
test('KNOW-HTTP-01 returns proof-denied reconciliation',()=>server(async port=>{const r=await send(port);assert.equal(r.status,200);assert.deepEqual(await r.json(),result)}));
test('KNOW-HTTP-02 forbids cross origin and oversized requests',()=>server(async port=>{
 assert.equal((await send(port,{}, {origin:'https://evil.example'})).status,403);
 assert.equal((await send(port,{a:'x'.repeat(70000)})).status,413);
}));
test('KNOW-HTTP-03 never accepts forged authorization',()=>server(async port=>{assert.equal((await send(port)).status,502)},async()=>({...result,action_executed:true})));
