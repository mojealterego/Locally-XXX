import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const SCRIPT=fileURLToPath(new URL('../../../overlays/omega-integrations/experiment_cli.py',import.meta.url));
let active=0;
/** Fixed local experiment admission bridge. No training or GPU jobs. */
export async function runExperimentPlan(request,{script=SCRIPT,python='python3',signal,timeoutMs=10000}={}){
 const input=Buffer.from(JSON.stringify(request),'utf8');
 if(!input.length||input.length>65536)throw Error('EXPERIMENT_INPUT_TOO_LARGE');
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)throw Error('INVALID_EXPERIMENT_TIMEOUT');
 if(signal?.aborted)throw Error('EXPERIMENT_CANCELLED');
 if(active>=2)throw Error('EXPERIMENT_BUSY');active++;
 try{return await new Promise((resolve,reject)=>{
  let done=false,timedOut=false,n=0;const output=[];
  const proc=spawn(python,['-I',script],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH??'/usr/bin:/bin',LANG:'C.UTF-8',PYTHONIOENCODING:'utf-8',PYTHONNOUSERSITE:'1'}});
  const timeout=setTimeout(()=>{timedOut=true;proc.kill('SIGKILL')},timeoutMs);
  const abort=()=>finish(Error('EXPERIMENT_CANCELLED'));
  function finish(error,value){if(done)return;done=true;clearTimeout(timeout);signal?.removeEventListener('abort',abort);if(error){proc.kill('SIGKILL');reject(error)}else resolve(value)}
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return}
  proc.once('error',()=>finish(Error('EXPERIMENT_PROCESS_FAILED')));
  proc.stdout.on('data',chunk=>{n+=chunk.length;if(n>262144)return finish(Error('EXPERIMENT_OUTPUT_TOO_LARGE'));output.push(chunk)});
  proc.stderr.on('data',()=>{});proc.stdin.on('error',()=>{});
  proc.once('close',code=>{
   if(done)return;if(timedOut)return finish(Error('EXPERIMENT_TIMEOUT'));if(code!==0)return finish(Error('EXPERIMENT_REJECTED'));
   let plan;try{plan=JSON.parse(Buffer.concat(output).toString('utf8'))}catch{return finish(Error('EXPERIMENT_INVALID_RESPONSE'))}
   if(plan?.status!=='PLAN_ONLY_NOT_TRAINED'||plan.execution!=='NO_EXECUTOR_BOUND'||
      plan.authorization?.cloud_plan_authorized!==false||plan.authorization?.external_dataset_egress_authorized!==false||
      !/^[0-9a-f]{64}$/.test(plan.plan_sha256??''))return finish(Error('EXPERIMENT_INVALID_RESPONSE'));
   finish(null,plan);
  });proc.stdin.end(input);
 })}finally{active--}
}
