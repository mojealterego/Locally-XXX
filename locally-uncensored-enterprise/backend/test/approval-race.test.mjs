import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MinerGateway} from '../src/mining/control.mjs';
import {TwilioNumbers} from '../src/telecom/twilio.mjs';
const p=Object.freeze({subject:'operator',tenant:'owner'});
const deferred=()=>{let release;const promise=new Promise(r=>release=r);return {promise,release}};
const json=x=>new Response(JSON.stringify(x));
const FROM='+48123456789',TO='+48111222333';
function fixture(kind){
 let now=1000,calls=0,hold=null,allowed=true;
 const auth=async()=>{if(hold)await hold.promise;return allowed};
 const api=kind==='mine'?new MinerGateway({devices:[{id:'rig',tenant:'owner',origin:'https://rig.example/',minWatts:100,maxWatts:500}],authorize:auth,token:()=> 'test',clock:()=>now,fetchImpl:async()=>{calls++;return json({accepted:true,commandId:'cmd'})}}):new TwilioNumbers({accountSid:'AC'+'a'.repeat(32),apiKeySid:'SK'+'b'.repeat(32),apiKeySecret:'test-secret-only',tenant:'owner',authorize:auth,recipientConsent:async()=>true,clock:()=>now,maxDaily:20,fetchImpl:async(url)=>{if(url.endsWith('/Messages.json')){calls++;return json({sid:'SM'+'c'.repeat(32),status:'queued'})}return json({incoming_phone_numbers:[{phone_number:FROM,sid:'PN'+'d'.repeat(32),capabilities:{sms:true}}]})}});
 return {prepare:()=>kind==='mine'?api.prepare(p,{device:'rig',action:'pause'}):api.prepareSms(p,{from:FROM,to:TO,body:'test fixture'}),execute:q=>kind==='mine'?api.execute(p,q.challenge,'CONFIRM '+q.challenge):api.sendSms(p,q.challenge,q.approvalText),block:()=>{hold=deferred();return ()=>{hold.release();hold=null}},advance:()=>{now+=60001},deny:()=>{allowed=false},allow:()=>{allowed=true},calls:()=>calls};
}
for(const [kind,label] of [['mine','MINE'],['sms','PHONE']]){
 test(`${label}-RACE-01 concurrent confirmations submit exactly once`,async()=>{const f=fixture(kind),q=await f.prepare(),release=f.block();const a=f.execute(q),b=f.execute(q);release();const results=await Promise.allSettled([a,b]);assert.equal(f.calls(),1);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1)});
 test(`${label}-RACE-02 expiry while authorization is pending prevents submission`,async()=>{const f=fixture(kind),q=await f.prepare(),release=f.block(),a=f.execute(q);f.advance();release();const result=await Promise.allSettled([a]);assert.equal(f.calls(),0);assert.equal(result[0].status,'rejected')});
 test(`${label}-RACE-03 denied authorization does not submit and valid retry works`,async()=>{const f=fixture(kind),q=await f.prepare();f.deny();await assert.rejects(f.execute(q));assert.equal(f.calls(),0);f.allow();await f.execute(q);await assert.rejects(f.execute(q));assert.equal(f.calls(),1)});
}
