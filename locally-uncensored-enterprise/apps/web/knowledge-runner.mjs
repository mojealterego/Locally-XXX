import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SCRIPT=fileURLToPath(new URL('../../../overlays/omega-integrations/knowledge_cli.py',import.meta.url));
let active=0;

/** Pinned, ephemeral Python reconciliation process; no shell and bounded IO. */
export async function runKnowledgeReconciliation(request,{script=SCRIPT,python='python3',signal,timeoutMs=10000}={}){
 const raw=Buffer.from(JSON.stringify(request),'utf8');
 if(!raw.length||raw.length>65536)throw Error('KNOWLEDGE_INPUT_TOO_LARGE');
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)throw Error('INVALID_KNOWLEDGE_DEADLINE');
 if(signal?.aborted)throw Error('KNOWLEDGE_CANCELLED');
 if(active>=2)throw Error('KNOWLEDGE_BUSY');
 active++;
 try{return await new Promise((resolve,reject)=>{
  let settled=false,size=0,killedByTimeout=false;const chunks=[];
  const proc=spawn(python,['-I',script],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH??'/usr/bin:/bin',LANG:'C.UTF-8',PYTHONNOUSERSITE:'1',PYTHONIOENCODING:'utf-8'}});
  const timer=setTimeout(()=>{killedByTimeout=true;proc.kill('SIGKILL')},timeoutMs);
  const abort=()=>finish(Error('KNOWLEDGE_CANCELLED'));
  function finish(err,value){if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(err){proc.kill('SIGKILL');reject(err)}else resolve(value)}
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return}
  proc.once('error',()=>finish(Error('KNOWLEDGE_PROCESS_FAILED')));
  proc.stdout.on('data',part=>{size+=part.length;if(size>1048576){finish(Error('KNOWLEDGE_OUTPUT_TOO_LARGE'));return}chunks.push(part)});
  proc.stderr.on('data',()=>{});proc.stdin.on('error',()=>{});
  proc.once('close',status=>{
   if(settled)return;
   if(killedByTimeout)return finish(Error('KNOWLEDGE_TIMEOUT'));
   if(status!==0)return finish(Error('KNOWLEDGE_REJECTED'));
   let response;try{response=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return finish(Error('KNOWLEDGE_INVALID_OUTPUT'))}
   if(response?.schema_version!=='omega.knowledge.reconciliation.v1'||response.action_executed!==false||response.memory_persisted!==false||response.proof_state!=='NO_CHECKED_PROOF'||response.share_state!=='PRIVATE_ONLY')return finish(Error('KNOWLEDGE_INVALID_OUTPUT'));
   finish(null,response);
  });
  proc.stdin.end(raw);
 })}finally{active--}
}
