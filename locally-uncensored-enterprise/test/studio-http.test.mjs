import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {handleStudioHttp} from '../apps/web/studio-http.mjs';
const compile=request=>({status:'PLAN_ONLY_NOT_BUILT',engine_adapter:'NOT_CONNECTED',project_id:request.project_id});
async function withServer(fn){
 const server=createServer(async(req,res)=>{if(!await handleStudioHttp(req,res,server.address().port,compile)){res.statusCode=404;res.end();}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{await fn(server.address().port)}finally{server.close();await once(server,'close')}
}
const send=(port,body,headers={})=>fetch(`http://127.0.0.1:${port}/api/local/studio/plan`,{method:'POST',headers:{'content-type':'application/json','x-omega-plan':'1',origin:`http://127.0.0.1:${port}`,...headers},body});
test('STUDIO-HTTP-01 returns a planning manifest without a connected engine',async()=>withServer(async port=>{
 const r=await send(port,JSON.stringify({project_id:'project-1'}));assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{status:'PLAN_ONLY_NOT_BUILT',engine_adapter:'NOT_CONNECTED',project_id:'project-1'});
}));
test('STUDIO-HTTP-02 forbids cross-origin and missing custom header',async()=>withServer(async port=>{
 const data=JSON.stringify({project_id:'p'});
 assert.equal((await send(port,data,{origin:'https://untrusted.example'})).status,403);
 assert.equal((await send(port,data,{'x-omega-plan':'0'})).status,403);
}));
test('STUDIO-HTTP-03 bounds input and denies bad requests',async()=>withServer(async port=>{
 assert.equal((await send(port,'{')).status,400);
 assert.equal((await send(port,JSON.stringify({payload:'x'.repeat(300000)}))).status,413);
}));
test('STUDIO-HTTP-04 denies adapters claiming a completed build',async()=>{
 const req={url:'/api/local/studio/plan',method:'POST',headers:{host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173','x-omega-plan':'1','content-type':'application/json'},async *[Symbol.asyncIterator](){yield Buffer.from('{}')}};
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(x){this.body=x}};
 await handleStudioHttp(req,res,4173,()=>({status:'BUILT_AND_VERIFIED',engine_adapter:'REAL'}));
 assert.equal(res.statusCode,400);
});
