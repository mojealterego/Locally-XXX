import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {handleOmegaStudioHttp} from '../apps/web/omega-studio-http.mjs';
const input={operation:'checkpoint-audit',name:'adapter.safetensors',mode:'lora',hash:true};
test('CKPT-07 actual HTTP to original safetensors parser and LoRA audit',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'omega-checkpoint-'));const previous=process.env.OMEGA_STUDIO_MODEL_DIR;
 const server=createServer(async(req,res)=>{try{if(!await handleOmegaStudioHttp(req,res,server.address().port)){res.statusCode=404;res.end()}}catch{res.statusCode=500;res.end()}});
 try{
  let header=Buffer.from(JSON.stringify({'__metadata__':{base_model_sha256:'a'.repeat(64),lora_alpha:'4'},'layer.lora_A.weight':{dtype:'F32',shape:[2,3],data_offsets:[0,24]},'layer.lora_B.weight':{dtype:'F32',shape:[4,2],data_offsets:[24,56]}}));
  header=Buffer.concat([header,Buffer.alloc((8-header.length%8)%8,32)]);const prefix=Buffer.alloc(8);prefix.writeBigUInt64LE(BigInt(header.length));const data=Buffer.concat([prefix,header,Buffer.alloc(56)]);await writeFile(join(dir,input.name),data,{mode:0o600});await symlink(join(dir,input.name),join(dir,'link.safetensors'));
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});const base='http://127.0.0.1:'+server.address().port;
  const post=(v,origin=base)=>fetch(base+'/api/local/omega-studio/plan',{method:'POST',headers:{origin,'content-type':'application/json','x-omega-studio':'1'},body:JSON.stringify(v)});
  delete process.env.OMEGA_STUDIO_MODEL_DIR;assert.equal((await post(input)).status,400);
  process.env.OMEGA_STUDIO_MODEL_DIR=dir;
  assert.equal((await post(input,'https://example.invalid')).status,403);
  for(const v of [{...input,name:'../adapter.safetensors'},{...input,name:'link.safetensors'},{...input,mode:'merge'},{...input,path:dir}])assert.equal((await post(v)).status,400);
  const r=await post(input);assert.equal(r.status,200);const x=await r.json();assert.equal(x.executed,false);assert.equal(x.result.sha256,createHash('sha256').update(data).digest('hex'));assert.equal(x.result.lora.pair_count,1);assert.equal(x.result.lora.eligible_for_automatic_merge,false);assert.equal(x.result.weights_modified,false);
  const t=await post({operation:'timeline',numerator:30000,denominator:1001,frame:1000,sampleRate:48000});assert.equal(t.status,200);assert.equal((await t.json()).result.startSample,1601600);
 }finally{if(previous===undefined)delete process.env.OMEGA_STUDIO_MODEL_DIR;else process.env.OMEGA_STUDIO_MODEL_DIR=previous;server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})}
});
