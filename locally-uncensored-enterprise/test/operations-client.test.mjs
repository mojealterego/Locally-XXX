import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {fetchAuditPage} from '../apps/web/operations-browser.mjs';
const request={token:'test.token',agent:'agent-a',since:0,limit:2};
const row={seq:1,tenant:'tenant-a',agent:'agent-a',runId:'run-a',kind:'run_started',node:null,timeMs:1000};
async function fixture(handler,fn){
 const s=createServer(handler);await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
 const transport=(path,options)=>{assert.equal(path,'/api/audit/list');return fetch('http://127.0.0.1:'+s.address().port+path,options)};
 try{await fn(transport)}finally{s.closeAllConnections();await new Promise(resolve=>s.close(resolve))}
}
test('OPWEB-01: actual HTTP page request with bearer token, no tenant supplied by client',()=>fixture(async(req,res)=>{
 assert.equal(req.method,'POST');assert.equal(req.headers.authorization,'Bearer test.token');let body='';for await(const c of req)body+=c;assert.deepEqual(JSON.parse(body),{agent:'agent-a',since:0,limit:2});res.setHeader('content-type','application/json');res.end(JSON.stringify({entries:[row],nextCursor:1}));
},async transport=>assert.deepEqual(await fetchAuditPage(request,transport),{entries:[row],nextCursor:1})));
test('OPWEB-02: invalid requests fail before any HTTP call',async()=>{
 for(const bad of [{...request,token:'a\nb'},{...request,agent:'../x'},{...request,since:-1},{...request,limit:201},{...request,tenant:'other'}])await assert.rejects(fetchAuditPage(bad,()=>assert.fail('network call')));
});
test('OPWEB-03: rejects wrong agent, unordered sequence, mixed tenant and forged cursor',async()=>{
 for(const data of [{entries:[{...row,agent:'other'}],nextCursor:1},{entries:[row,row],nextCursor:1},{entries:[row,{...row,seq:2,tenant:'other'}],nextCursor:2},{entries:[row],nextCursor:99}])await assert.rejects(fetchAuditPage(request,async()=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}})));
});
test('OPWEB-04: denied status, oversized body and invalid JSON are errors',async()=>{
 for(const response of [new Response('Denied',{status:403}),new Response('x'.repeat(1048577),{headers:{'content-type':'application/json'}}),new Response('{',{headers:{'content-type':'application/json'}})])await assert.rejects(fetchAuditPage(request,async()=>response));
});
