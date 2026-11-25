import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {handleLocalToolsHttp} from '../apps/web/devsuite-http.mjs';

async function withServer(run){
 const server=createServer(async(req,res)=>{
   try{if(!await handleLocalToolsHttp(req,res,server.address().port)){res.statusCode=404;res.end();}}
   catch{res.statusCode=500;res.end();}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{await run(server.address().port)}finally{server.close();await once(server,'close')}
}
const send=(port,data,headers={})=>fetch(`http://127.0.0.1:${port}/api/local/tools`,{method:'POST',headers:{origin:`http://127.0.0.1:${port}`,'content-type':'application/json','x-omega-local-tool':'1',...headers},body:data});

test('HTTP-DEV-01 loopback tool endpoint responds with verified JSON output',async()=>{
 await withServer(async port=>{
  const r=await send(port,JSON.stringify({tool:'json.format',args:{input:'{"a":1}'}}));
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal((await r.json()).result,'{\n  "a": 1\n}');
 });
});
test('HTTP-DEV-02 same origin and non-simple custom header required',async()=>{
 await withServer(async port=>{
  const b=JSON.stringify({tool:'uuid.v4'});
  assert.equal((await send(port,b,{origin:'https://untrusted.example'})).status,403);
  assert.equal((await send(port,b,{'x-omega-local-tool':'0'})).status,403);
 });
});
test('HTTP-DEV-03 rejects malformed JSON, excess size and unknown tools',async()=>{
 await withServer(async port=>{
  assert.equal((await send(port,'invalid')).status,400);
  assert.equal((await send(port,JSON.stringify({tool:'exec',args:{}}))).status,400);
  assert.equal((await send(port,JSON.stringify({tool:'base64.encode',args:{input:'x'.repeat(70000)}}))).status,413);
 });
});
