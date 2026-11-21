import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
const web=new URL('../../apps/web/serve.mjs',import.meta.url);
const listen=async s=>{s.listen(0,'127.0.0.1');await once(s,'listening');return s.address().port};
const freePort=async()=>{const s=createServer();const port=await listen(s);await new Promise(r=>s.close(r));return port};
async function waitReady(base){for(let i=0;i<50;i++){try{const r=await fetch(base);if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,25))}throw Error('Web unavailable')}
test('CLD-18 browser same-origin proxy does not forward unauthenticated or foreign-origin requests',async()=>{
 const cloud=createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;assert.equal(req.headers.authorization,'Bearer demo');assert.equal(req.headers.origin,`http://127.0.0.1:${port}`);res.setHeader('content-type','application/json');res.end(JSON.stringify({configured:true}))});
 const cloudPort=await listen(cloud);const port=await freePort(),reviewPort=await freePort(),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,[web.pathname],{env:{...process.env,WEB_PORT:String(port),REVIEW_PORT:String(reviewPort),CLOUD_PORT:String(cloudPort)},stdio:'ignore'});
 try{await waitReady(base);assert.equal((await fetch(base+'/modules/cloud-ui.mjs')).status,200);const request={method:'POST',headers:{authorization:'Bearer demo','content-type':'application/json',origin:base},body:JSON.stringify({provider:'openai'})};const r=await fetch(base+'/api/cloud/status',request);assert.equal(r.status,200);assert.equal((await r.json()).configured,true);assert.equal((await fetch(base+'/api/cloud/status',{...request,headers:{...request.headers,origin:'https://evil'}})).status,403);assert.equal((await fetch(base+'/api/cloud/status',{...request,headers:{...request.headers,authorization:'bad'}})).status,401);assert.equal((await fetch(base+'/api/cloud/invalid',request)).status,404)}finally{child.kill();await once(child,'exit');await new Promise(r=>cloud.close(r))}
});
test('CLD-19 SSE proxy forwards incremental chunks only with correct media type',async()=>{
 let streamCount=0;const cloud=createServer(async(req,res)=>{for await(const _ of req){}if(req.url!=='/api/cloud/stream'){res.statusCode=404;return res.end()}streamCount++;res.setHeader('content-type','text/event-stream');res.write('event: token\ndata: {"text":"hello"}\n\n');setTimeout(()=>res.end('event: done\ndata: {}\n\n'),10)});
 const cloudPort=await listen(cloud),port=await freePort(),reviewPort=await freePort(),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,[web.pathname],{env:{...process.env,WEB_PORT:String(port),REVIEW_PORT:String(reviewPort),CLOUD_PORT:String(cloudPort)},stdio:'ignore'});
 try{await waitReady(base);const r=await fetch(base+'/api/cloud/stream',{method:'POST',headers:{authorization:'Bearer demo','content-type':'application/json',origin:base},body:'{}'});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'text/event-stream; charset=utf-8');const raw=await r.text();assert.match(raw,/event: token/);assert.match(raw,/event: done/);assert.equal(streamCount,1)}finally{child.kill();await once(child,'exit');await new Promise(r=>cloud.close(r))}
});
