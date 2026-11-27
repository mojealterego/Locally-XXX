import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const SCRIPT=fileURLToPath(new URL('../../../scripts/runtime_control.py',import.meta.url));
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const plain=(v,max,required=false)=>typeof v==='string'&&v.length<=max&&!v.includes('\0')&&(!required||v.trim().length>0);
export function buildImageWorkflow(v,c){
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='height,negative,prompt,seed,steps,width'||!plain(v.prompt,4096,true)||!plain(v.negative,2048)||![v.width,v.height].every(n=>integer(n,256,1024)&&n%64===0)||!integer(v.steps,1,40)||!integer(v.seed,0,4294967295)||!c||!integer(c.port,1,65535)||typeof c.checkpoint!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}\.safetensors$/.test(c.checkpoint))throw Error('IMAGE_INVALID');
 return {'1':{class_type:'CheckpointLoaderSimple',inputs:{ckpt_name:c.checkpoint}},'2':{class_type:'CLIPTextEncode',inputs:{text:v.prompt,clip:['1',1]}},'3':{class_type:'CLIPTextEncode',inputs:{text:v.negative,clip:['1',1]}},'4':{class_type:'EmptyLatentImage',inputs:{width:v.width,height:v.height,batch_size:1}},'5':{class_type:'KSampler',inputs:{model:['1',0],positive:['2',0],negative:['3',0],latent_image:['4',0],seed:v.seed,steps:v.steps,cfg:7,sampler_name:'euler',scheduler:'normal',denoise:1}},'6':{class_type:'VAEDecode',inputs:{samples:['5',0],vae:['1',2]}},'7':{class_type:'SaveImage',inputs:{images:['6',0],filename_prefix:'omega'}}};
}
let active=false;
export async function runLocalImage(v,{port,checkpoint,script=SCRIPT,python='python3',timeoutMs=150000,signal}={}){
 const graph=buildImageWorkflow(v,{port,checkpoint});if(!integer(timeoutMs,100,180000))throw Error('IMAGE_INVALID');if(signal?.aborted)throw Error('IMAGE_CANCELLED');if(active)throw Error('IMAGE_BUSY');active=true;let dir;
 try{
  dir=await mkdtemp(join(tmpdir(),'omega-image-'));const workflow=join(dir,'workflow.json'),output=join(dir,'output.png');await writeFile(workflow,JSON.stringify(graph),{mode:0o600,flag:'wx'});
  if(signal?.aborted)throw Error('IMAGE_CANCELLED');
  const receipt=await new Promise((resolve,reject)=>{
   const child=spawn(python,['-I',script,'render',String(port),workflow,output,String(v.width),String(v.height),'64'],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH??'/usr/bin:/bin',LANG:'C.UTF-8'}});
   let size=0,parts=[],failure=null;const stop=reason=>{failure??=reason;child.kill('SIGKILL')};const abort=()=>stop('IMAGE_CANCELLED');const timer=setTimeout(()=>stop('IMAGE_TIMEOUT'),timeoutMs);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   child.stdout.on('data',b=>{size+=b.length;if(size>16384)stop('IMAGE_BACKEND_FAILED');else parts.push(b)});child.stderr.resume();child.once('error',()=>{failure??='IMAGE_BACKEND_FAILED'});
   child.once('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(failure||code!==0)return reject(Error(failure??'IMAGE_BACKEND_FAILED'));try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')))}catch{reject(Error('IMAGE_BACKEND_FAILED'))}});
  });
  const st=await lstat(output);if(!st.isFile()||st.nlink!==1||st.size<33||st.size>8*1024*1024)throw Error('IMAGE_OUTPUT_INVALID');const bytes=await readFile(output);
  if(bytes.length!==st.size||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==v.width||bytes.readUInt32BE(20)!==v.height||receipt?.width!==v.width||receipt?.height!==v.height||receipt?.sha256!==createHash('sha256').update(bytes).digest('hex'))throw Error('IMAGE_OUTPUT_INVALID');
  return bytes;
 }finally{try{if(dir)await rm(dir,{recursive:true,force:true})}finally{active=false}}
}
