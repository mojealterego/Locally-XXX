import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {handleOmegaStudioHttp} from '../apps/web/omega-studio-http.mjs';
const review={operation:'code-review',source:'eval("1")\n',mode:'leak'};
const registry={operation:'mcp-validate',servers:[{name:'example',transport:'streamable-http',command:[],url:'https://example.com/mcp'}]};
test('SW-MCP-HTTP native HTTP to original Python modules and regression',async()=>{
 const server=createServer(async(req,res)=>{try{if(!await handleOmegaStudioHttp(req,res,server.address().port)){res.statusCode=404;res.end()}}catch{res.statusCode=500;res.end()}});
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const base='http://127.0.0.1:'+server.address().port;
  const post=(v,origin=base)=>fetch(base+'/api/local/omega-studio/plan',{method:'POST',headers:{origin,'content-type':'application/json','x-omega-studio':'1'},body:JSON.stringify(v)});
  assert.equal((await post(review,'https://example.invalid')).status,403);
  assert.equal((await post({...review,execute:true})).status,400);
  const a=await post(review);assert.equal(a.status,200);const r=await a.json();assert.equal(r.executed,false);assert.equal(r.result.findings[0].rule,'unsafe_eval');assert.equal(r.result.security_verified,false);
  const b=await post(registry);assert.equal(b.status,200);const m=await b.json();assert.deepEqual(m.result.servers,[{name:'example',transport:'streamable-http'}]);assert.equal(m.result.connected,false);
  assert.equal((await post({...registry,servers:[{...registry.servers[0],url:'https://127.0.0.1/mcp'}]})).status,400);
  const t=await post({operation:'timeline',numerator:30000,denominator:1001,frame:1000,sampleRate:48000});assert.equal(t.status,200);assert.equal((await t.json()).result.startSample,1601600);
 }finally{server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve))}
});
