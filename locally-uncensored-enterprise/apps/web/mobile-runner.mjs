import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const SCRIPT=fileURLToPath(new URL('../../../scripts/runtime_control.py',import.meta.url));
export function validateMobileStatus(v){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='abi,available_mib'||v.abi!=='arm64-v8a'||!Number.isSafeInteger(v.available_mib)||v.available_mib<1||v.available_mib>1048576)throw Error('MOBILE_INVALID');return {abi:v.abi,available_mib:v.available_mib}}
let active=false;
export async function runAndroidProbe({script=SCRIPT,python='python3',signal,timeoutMs=5000}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)throw Error('MOBILE_INVALID');if(signal?.aborted)throw Error('MOBILE_CANCELLED');if(active)throw Error('MOBILE_BUSY');active=true;
 try{return await new Promise((resolve,reject)=>{
 const child=spawn(python,['-I',script,'android-probe'],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH??'/usr/bin:/bin',LANG:'C.UTF-8'}});let failure=null,size=0,parts=[];const stop=reason=>{failure??=reason;child.kill('SIGKILL')};const abort=()=>stop('MOBILE_CANCELLED');const timer=setTimeout(()=>stop('MOBILE_TIMEOUT'),timeoutMs);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();child.stdout.on('data',b=>{size+=b.length;if(size>4096)stop('MOBILE_INVALID');else parts.push(b)});child.stderr.resume();child.once('error',()=>{failure??='MOBILE_UNAVAILABLE'});child.once('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(failure||code!==0)return reject(Error(failure??'MOBILE_UNAVAILABLE'));try{resolve(validateMobileStatus(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)))))}catch{reject(Error('MOBILE_INVALID'))}});
 })}finally{active=false}
}
