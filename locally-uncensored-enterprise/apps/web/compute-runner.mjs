import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const SCRIPT=fileURLToPath(new URL('../../../overlays/omega-integrations/compute_cli.py',import.meta.url));
let active=0;
/** Offline-only, bounded policy evaluation. The worker cannot launch or route any model. */
export async function runComputePlan(request,{script=SCRIPT,python='python3',signal,timeoutMs=8000}={}){
 const data=Buffer.from(JSON.stringify(request),'utf8');
 if(!data.length||data.length>65536)throw Error('COMPUTE_REQUEST_TOO_LARGE');
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)throw Error('INVALID_COMPUTE_DEADLINE');
 if(signal?.aborted)throw Error('COMPUTE_CANCELLED');
 if(active>=2)throw Error('COMPUTE_BUSY');active++;
 try{return await new Promise((resolve,reject)=>{
  let done=false,output=[],size=0,timedOut=false;
  const child=spawn(python,['-I',script],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH??'/usr/bin:/bin',LANG:'C.UTF-8',PYTHONIOENCODING:'utf-8',PYTHONNOUSERSITE:'1'}});
  const timeout=setTimeout(()=>{timedOut=true;child.kill('SIGKILL')},timeoutMs);
  const onAbort=()=>finish(Error('COMPUTE_CANCELLED'));
  function finish(err,result){if(done)return;done=true;clearTimeout(timeout);signal?.removeEventListener('abort',onAbort);if(err){child.kill('SIGKILL');reject(err)}else resolve(result)}
  signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted){onAbort();return}
  child.once('error',()=>finish(Error('COMPUTE_PROCESS_FAILED')));
  child.stdout.on('data',x=>{size+=x.length;if(size>262144)return finish(Error('COMPUTE_OUTPUT_TOO_LARGE'));output.push(x)});
  child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
  child.once('close',status=>{
   if(done)return;
   if(timedOut)return finish(Error('COMPUTE_TIMEOUT'));
   if(status!==0)return finish(Error('COMPUTE_DENIED'));
   let result;try{result=JSON.parse(Buffer.concat(output).toString('utf8'))}catch{return finish(Error('COMPUTE_INVALID_RESPONSE'))}
   if(result?.schema_version!=='omega.compute.offline.result.v1'||result.execution_mode!=='OFFLINE'||
     !['ROUTE_PLAN_ONLY','DENIED_OR_PAUSED'].includes(result.state)||result.runtime_executed!==false||result.cloud_egress!==false||result.telemetry_verified!==false||result.inventory_verified!==false)
      return finish(Error('COMPUTE_INVALID_RESPONSE'));
   finish(null,result);
  });
  child.stdin.end(data);
 })}finally{active--}
}
