import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {validateChatRequest,requestLocalChat} from '../../scripts/local-chat.mjs';
import {handleChatHttp} from '../apps/web/chat-http.mjs';
const request={model:'local:8b',messages:[{role:'user',content:'Cześć'},{role:'assistant',content:'Witaj'},{role:'user',content:'Co dalej?'}]};
const listen=async fn=>{const server=createServer(fn);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});return {server,base:`http://127.0.0.1:${server.address().port}`,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}};
test('CHAT-01: strict conversational schema and bounded content',()=>{
 assert.deepEqual(validateChatRequest(request),request);
 for(const bad of [{...request,endpoint:'http://example.invalid'},{...request,model:''},{...request,messages:[{role:'system',content:'x'}]},{...request,messages:[{role:'user',content:'x'},{role:'assistant',content:'x'}]},{...request,messages:[{role:'user',content:'x'.repeat(8193)}]},{...request,messages:[{role:'user',content:'\u0000'}]}])assert.throws(()=>validateChatRequest(bad));
});
test('CHAT-02: real loopback transport preserves context and refuses external URLs',async()=>{
 let received;const backend=await listen(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);received=JSON.parse(Buffer.concat(chunks));res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:'Odpowiedź testowa'}}]}))});
 try{assert.equal(await requestLocalChat(request,{endpoint:backend.base+'/v1/chat/completions'}),'Odpowiedź testowa');assert.deepEqual(received.messages,request.messages);assert.equal(received.model,request.model);assert.equal(received.stream,false);await assert.rejects(requestLocalChat(request,{endpoint:'http://192.0.2.1:8080/v1/chat/completions'}),/INVALID_LOCAL_ENDPOINT/)}finally{await backend.close()}
});
test('CHAT-03: redirects and invalid/oversized results fail closed',async()=>{
 let mode='redirect',hits=0;const backend=await listen((req,res)=>{hits++;if(mode==='redirect'){res.writeHead(302,{location:'/other'});res.end();return}res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:mode==='large'?'x'.repeat(9000):null}}]}))});
 try{const endpoint=backend.base+'/v1/chat/completions';await assert.rejects(requestLocalChat(request,{endpoint}));assert.equal(hits,1);mode='large';await assert.rejects(requestLocalChat(request,{endpoint}),/INVALID_MODEL_RESPONSE/);mode='invalid';await assert.rejects(requestLocalChat(request,{endpoint}),/INVALID_MODEL_RESPONSE/)}finally{await backend.close()}
});
test('CHAT-04: actual HTTP handler enforces origin, method, schema and configuration',async()=>{
 let endpoint;const backend=await listen((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:'Łódź'}}]}))});
 const web=await listen(async(req,res)=>{try{if(!await handleChatHttp(req,res,web.server.address().port,endpoint)){res.statusCode=404;res.end()}}catch{res.statusCode=500;res.end()}});
 try{const url=web.base+'/api/local/chat',headers={origin:web.base,'content-type':'application/json','x-omega-chat':'1'},post=(body=request,h=headers)=>fetch(url,{method:'POST',headers:h,body:JSON.stringify(body)});
 assert.equal((await post()).status,503);endpoint=backend.base+'/v1/chat/completions';assert.equal((await post(request,{...headers,origin:'https://example.invalid'})).status,403);assert.equal((await fetch(url)).status,405);assert.equal((await post({...request,endpoint:'http://example.invalid'})).status,400);assert.equal((await post({...request,extra:'x'.repeat(100000)})).status,413);const response=await post();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{content:'Łódź'});
 }finally{await web.close();await backend.close()}
});
