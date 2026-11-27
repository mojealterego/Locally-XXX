import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const SCRIPT=fileURLToPath(new URL('../../../integrations/omega-studio/locally_bridge.py',import.meta.url));
let active=false;
export async function runOmegaStudio(request,{signal}={}){
 const bytes=Buffer.from(JSON.stringify(request));if(bytes.length>32768)throw Error('STUDIO_INVALID');if(signal?.aborted)throw Error('STUDIO_CANCELLED');if(active)throw Error('STUDIO_BUSY');active=true;
 try{return await new Promise((resolve,reject)=>{
  const child=spawn('python3',['-I','-B',SCRIPT],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH??'/usr/bin:/bin',LANG:'C.UTF-8'}});let failure=null,n=0,parts=[];
  const stop=reason=>{failure??=reason;child.kill('SIGKILL')};const abort=()=>stop('STUDIO_CANCELLED');const timer=setTimeout(()=>stop('STUDIO_TIMEOUT'),5000);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  child.stdout.on('data',b=>{n+=b.length;if(n>65536)stop('STUDIO_INVALID');else parts.push(b)});child.stderr.resume();child.stdin.on('error',()=>{});child.once('error',()=>{failure??='STUDIO_UNAVAILABLE'});
  child.once('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(failure||code!==0)return reject(Error(failure??(code===2?'STUDIO_INVALID':'STUDIO_UNAVAILABLE')));try{const v=JSON.parse(Buffer.concat(parts).toString('utf8'));if(v?.schema!=='omega.studio.bridge.v1'||v.operation!==request.operation||v.executed!==false||!v.result||typeof v.result!=='object')throw Error();resolve(v)}catch{reject(Error('STUDIO_UNAVAILABLE'))}});child.stdin.end(bytes);
 })}finally{active=false}
}
