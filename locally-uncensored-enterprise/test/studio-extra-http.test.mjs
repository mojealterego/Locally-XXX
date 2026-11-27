import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {handleOmegaStudioHttp} from '../apps/web/omega-studio-http.mjs';
const blend={operation:'blend',shape:[1,5],axis:1,left:[0,0,0,0,0],right:[1,1,1,1,1]};
const ast={operation:'ast-compare',left:'x = 1',right:'y = 2',dimensions:128};
test('OMS-EXTRA-HTTP real Node/Python, both operations and rejection',async()=>{
 const server=createServer(async(req,res)=>{try{if(!await handleOmegaStudioHttp(req,res,server.address().port)){res.statusCode=404;res.end()}}catch{res.statusCode=500;res.end()}});
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const base='http://127.0.0.1:'+server.address().port;
  const post=(v,origin=base)=>fetch(base+'/api/local/omega-studio/plan',{method:'POST',headers:{origin,'content-type':'application/json','x-omega-studio':'1'},body:JSON.stringify(v)});
  assert.equal((await post(blend,'https://example.invalid')).status,403);
  assert.equal((await post({...blend,shape:[1,4]})).status,400);
  assert.equal((await post({...ast,left:'if:'})).status,400);
  const a=await post(blend);assert.equal(a.status,200);assert.deepEqual((await a.json()).result.pixels,[0,0.103515625,0.5,0.896484375,1]);
  const b=await post(ast);assert.equal(b.status,200);const r=await b.json();assert.equal(r.executed,false);assert.ok(Math.abs(r.result.similarity-1)<1e-12);assert.equal(r.result.formal_proof,false);
 }finally{server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve))}
});
