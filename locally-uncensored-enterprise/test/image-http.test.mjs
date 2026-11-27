import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildImageWorkflow,runLocalImage} from '../apps/web/image-runner.mjs';
import {handleImageHttp} from '../apps/web/image-http.mjs';
const input={prompt:'Góry o świcie',negative:'blur',width:256,height:256,steps:10,seed:42};
const config={port:8188,checkpoint:'model.safetensors'};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+W9L8AAAAASUVORK5CYII=','base64');
test('IMG-01 fixed workflow, typed parameters and no arbitrary nodes/paths',()=>{
 const w=buildImageWorkflow(input,config);assert.equal(w['1'].inputs.ckpt_name,'model.safetensors');assert.equal(w['2'].inputs.text,input.prompt);assert.equal(w['4'].inputs.width,256);assert.equal(w['5'].inputs.seed,42);assert.equal(w['7'].class_type,'SaveImage');
 for(const v of [{...input,width:8192},{...input,seed:-1},{...input,steps:1000},{...input,prompt:''},{...input,workflow:{}},{...input,negative:7}])assert.throws(()=>buildImageWorkflow(v,config));
 for(const v of [{...config,checkpoint:'../model.safetensors'},{...config,port:0},{...config,checkpoint:'x\n.safetensors'}])assert.throws(()=>buildImageWorkflow(input,v));
});
test('IMG-02 actual subprocess boundary, output integrity and cleanup',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'omega-image-test-'));try{
  const script=join(dir,'fixture.py');await writeFile(script,`import sys,json,hashlib,struct,zlib\nfrom pathlib import Path\n_,action,port,wf,out,w,h,budget=sys.argv\nassert action=='render' and port=='8188' and budget=='64'\ng=json.loads(Path(wf).read_text());assert g['5']['inputs']['seed']==42\nw,h=int(w),int(h)\ndef chunk(k,v):return struct.pack('>I',len(v))+k+v+struct.pack('>I',zlib.crc32(k+v))\nb=b'\\x89PNG\\r\\n\\x1a\\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\\0'+b'\\x22\\x44\\x66'*w)*h))+chunk(b'IEND',b'')\nPath(out).write_bytes(b)\nprint(json.dumps(dict(width=w,height=h,sha256=hashlib.sha256(b).hexdigest(),prompt_id='fixture')))\n`);
  const data=await runLocalImage(input,{...config,script});assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(data.readUInt32BE(16),256);assert.equal(data.readUInt32BE(20),256);
  await writeFile(script,'import sys;sys.exit(1)\n');await assert.rejects(runLocalImage(input,{...config,script}),/IMAGE_BACKEND_FAILED/);
  await writeFile(script,'import time;time.sleep(10)\n');await assert.rejects(runLocalImage(input,{...config,script,timeoutMs:100}),/IMAGE_TIMEOUT/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('IMG-03 real HTTP route, origin/schema gates and unconfigured refusal',async()=>{
 let configured=false,calls=0;const server=createServer(async(req,res)=>{try{if(!await handleImageHttp(req,res,server.address().port,{getConfig:()=>configured?config:null,runner:async(v,c)=>{calls++;assert.deepEqual(v,input);assert.equal(c.port,config.port);assert.equal(c.checkpoint,config.checkpoint);assert.ok(c.signal instanceof AbortSignal);return png}})){res.statusCode=404;res.end()}}catch{res.statusCode=500;res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,headers={origin:base,'content-type':'application/json','x-omega-image':'1'};const post=(body=input,h=headers)=>fetch(base+'/api/local/image/render',{method:'POST',headers:h,body:JSON.stringify(body)});
 try{assert.equal((await post()).status,503);configured=true;assert.equal((await post(input,{...headers,origin:'https://example.invalid'})).status,403);assert.equal((await post({...input,workflow:{}})).status,400);assert.equal((await post({...input,prompt:'x'.repeat(17000)})).status,413);assert.equal((await fetch(base+'/api/local/image/render')).status,405);const r=await post();assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await r.arrayBuffer()),png);assert.equal(calls,1)}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
test('IMG-04 cancellation, concurrency and digest mismatch',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'omega-image-test-'));try{
  const script=join(dir,'fixture.py');await writeFile(script,'import time;time.sleep(10)\n');const ctl=new AbortController();const running=runLocalImage(input,{...config,script,signal:ctl.signal});try{await assert.rejects(runLocalImage(input,{...config,script}),/IMAGE_BUSY/)}finally{ctl.abort();await assert.rejects(running,/IMAGE_CANCELLED/)}
  await writeFile(script,`import sys,json,struct\nfrom pathlib import Path\n_,a,p,wf,out,w,h,budget=sys.argv\nb=b'\\x89PNG\\r\\n\\x1a\\n'+b'\\0'*8+struct.pack('>II',int(w),int(h))+b'\\0'*9\nPath(out).write_bytes(b)\nprint(json.dumps(dict(width=int(w),height=int(h),sha256='0'*64)))\n`);await assert.rejects(runLocalImage(input,{...config,script}),/IMAGE_OUTPUT_INVALID/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
