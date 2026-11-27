import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {handleOmegaStudioHttp} from '../apps/web/omega-studio-http.mjs';
const input={operation:'ci-compile',approved:true,files:[{name:'main.py',source:'def f():\n    return 42\n'}]};
test('CI-06 native HTTP through original CI components: approval, compile, failure and regression',async()=>{
 const server=createServer(async(req,res)=>{try{if(!await handleOmegaStudioHttp(req,res,server.address().port)){res.statusCode=404;res.end()}}catch{res.statusCode=500;res.end()}});
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const base='http://127.0.0.1:'+server.address().port;
  const post=(v,origin=base)=>fetch(base+'/api/local/omega-studio/plan',{method:'POST',headers:{origin,'content-type':'application/json','x-omega-studio':'1'},body:JSON.stringify(v)});
  assert.equal((await post(input,'https://example.invalid')).status,403);
  for(const v of [{...input,approved:false},{...input,command:['python']},{...input,files:[{name:'../main.py',source:'x=1'}]}])assert.equal((await post(v)).status,400);
  const r=await post(input);assert.equal(r.status,200);const data=await r.json();assert.equal(data.executed,false);assert.equal(data.result.status,'PASS');assert.equal(data.result.compiler_executed,true);assert.equal(data.result.source_executed,false);assert.equal(data.result.approval_verified,true);
  const b=await post({...input,files:[{name:'bad.py',source:'if:\n'}]});assert.equal(b.status,200);assert.equal((await b.json()).result.status,'FAIL');
  const t=await post({operation:'timeline',numerator:30000,denominator:1001,frame:1000,sampleRate:48000});assert.equal(t.status,200);assert.equal((await t.json()).result.startSample,1601600);
 }finally{server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve))}
});
