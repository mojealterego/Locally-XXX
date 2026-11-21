import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {cloudServer} from '../src/cloud/http.mjs';
import {CloudQuota} from '../src/cloud/quota.mjs';
const tenant='8d7b233d-31c4-44d0-b8f7-813bdc5778fe';
const principal={subject:'alice',tenant,expires:9999999999};
const question={provider:'openai',model:'test',messages:[{role:'user',content:'public'}],maxOutputTokens:100,classification:'public'};
const vault={has:()=>true,set:()=>{},remove:()=>{},using:async(t,p,cb)=>cb('synthetic-test-key')};
const oidc={verify:async t=>t==='good'?principal:Promise.reject(Error())};
const permit={allowed:async()=>true};
async function serve(server,fn){server.listen(0,'127.0.0.1');await once(server,'listening');try{return await fn('http://127.0.0.1:'+server.address().port)}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}}
const post=(base,path,body)=>fetch(base+'/api/cloud/'+path,{method:'POST',headers:{authorization:'Bearer good','content-type':'application/json'},body:JSON.stringify(body)});
test('QTA-09 enabled gateway cannot start without durable quota',()=>{assert.throws(()=>cloudServer({oidc,permit,vault,enabled:true}),/dependencies/)});
test('QTA-10 end-to-end localhost denies third request before any provider transmission',async()=>{const dir=mkdtempSync(join(tmpdir(),'omega-quota-http-'));chmodSync(dir,0o700);const quota=new CloudQuota({directory:dir,maxRequestsPerDay:2,maxOutputTokensPerDay:200});let streams=0;const server=cloudServer({oidc,permit,vault,quota,enabled:true,stream:async function*(){streams++;yield 'ok'}});try{await serve(server,async base=>{for(let i=0;i<3;i++){const a=await post(base,'approve',{request:question});assert.equal(a.status,200);const ticket=(await a.json()).ticket;const s=await post(base,'stream',{ticket,request:question});if(i<2){assert.equal(s.status,200);assert.match(await s.text(),/event: done/)}else assert.equal(s.status,403)}const status=await post(base,'status',{provider:'openai'});assert.equal(status.status,200);assert.deepEqual((await status.json()).quota,{requestsUsed:2,tokensReserved:200,requestsRemaining:0,outputTokensRemaining:0,maxRequestsPerDay:2,maxOutputTokensPerDay:200});assert.equal(streams,2)})}finally{quota.close();rmSync(dir,{recursive:true,force:true})}});
