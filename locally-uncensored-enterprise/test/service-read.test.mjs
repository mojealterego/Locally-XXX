import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {MinerGateway} from '../backend/src/mining/control.mjs';
import {TwilioNumbers} from '../backend/src/telecom/twilio.mjs';
import {createServiceReadHandler} from '../apps/web/service-read-http.mjs';
const p={subject:'operator',tenant:'tenant-a',expires:200};
const json=x=>new Response(JSON.stringify(x));
async function fixture(fn){
 let calls=0,allowed=true,enabled=true,now=100;
 const auth=async(q)=>allowed&&q===p&&q.expires>now;
 const miner=new MinerGateway({devices:[{id:'rig',tenant:'tenant-a',origin:'https://rig.example/',minWatts:100,maxWatts:500}],authorize:auth,token:()=> 'fixture',fetchImpl:async(url,opts)=>{calls++;assert.equal(opts.method,'GET');return json({id:'rig',state:'online',watts:200,hashrateHs:1000})}});
 const phone=new TwilioNumbers({accountSid:'AC'+'a'.repeat(32),apiKeySid:'SK'+'b'.repeat(32),apiKeySecret:'fixture-secret',tenant:'tenant-a',authorize:auth,recipientConsent:async()=>false,fetchImpl:async(url,opts)=>{calls++;assert.equal(opts.method,'GET');return url.includes('IncomingPhoneNumbers')?json({incoming_phone_numbers:[{phone_number:'+48123456789',sid:'PN'+'c'.repeat(32),capabilities:{sms:true}}]}):json({available_phone_numbers:[{phone_number:'+48123456789',capabilities:{sms:true}}]})}});
 const handler=createServiceReadHandler({runtime:()=>enabled?{oidc:{verify:async token=>{if(token!=='fixture')throw Error();return p}},miner,phone}:null,clock:()=>now});
 const s=createServer(async(req,res)=>{try{if(!await handler(req,res,s.address().port)){res.statusCode=404;res.end()}}catch{res.statusCode=500;res.end()}});await new Promise(r=>s.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+s.address().port,headers={origin:base,authorization:'Bearer fixture','content-type':'application/json','x-omega-service-read':'1'},post=(path,body,h=headers)=>fetch(base+path,{method:'POST',headers:h,body:JSON.stringify(body)});
 try{await fn({post,headers,base,calls:()=>calls,deny:()=>{allowed=false},disable:()=>{enabled=false},expire:()=>{now=200}})}finally{s.closeAllConnections();await new Promise(r=>s.close(r))}
}
test('SREAD-01 actual HTTP dispatch to read-only mining and phone adapters',()=>fixture(async({post,calls})=>{const a=await post('/api/local/mining/status',{device:'rig'});assert.equal(a.status,200);assert.deepEqual(await a.json(),{id:'rig',state:'online',watts:200,hashrateHs:1000});const b=await post('/api/local/phone/owned',{});assert.equal(b.status,200);assert.equal((await b.json()).items[0].number,'+48123456789');const c=await post('/api/local/phone/available',{country:'PL',type:'Local'});assert.equal(c.status,200);assert.equal((await c.json()).items[0].capabilities.sms,true);assert.equal(calls(),3)}));
test('SREAD-02 foreign origin, token, policy and expiry reject without provider calls',()=>fixture(async({post,headers,calls,deny,expire})=>{assert.equal((await post('/api/local/mining/status',{device:'rig'},{...headers,origin:'https://example.invalid'})).status,403);assert.equal((await post('/api/local/phone/owned',{},{...headers,authorization:'Bearer wrong'})).status,401);deny();assert.equal((await post('/api/local/mining/status',{device:'rig'})).status,403);expire();assert.equal((await post('/api/local/phone/owned',{})).status,401);assert.equal(calls(),0)}));
test('SREAD-03 rejects mutation routes, extra parameters, body limits and unconfigured runtime',()=>fixture(async({post,base,calls,disable})=>{assert.equal((await post('/api/local/mining/execute',{})).status,404);assert.equal((await post('/api/local/phone/send',{})).status,404);assert.equal((await post('/api/local/mining/status',{device:'rig',tenant:'tenant-b'})).status,400);assert.equal((await post('/api/local/phone/available',{country:'../x',type:'Local'})).status,400);assert.equal((await post('/api/local/phone/owned',{x:'x'.repeat(5000)})).status,413);assert.equal((await fetch(base+'/api/local/phone/owned')).status,405);disable();assert.equal((await post('/api/local/phone/owned',{})).status,503);assert.equal(calls(),0)}));
