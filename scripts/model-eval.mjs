/** Local PL/EN evaluation harness: real loopback OpenAI-compatible chat completions, no synthetic quality claims. */
import {createHash} from 'node:crypto';
import {readFile, lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const MAX_CASES=64, MAX_RESPONSE=262144;
const normalize=text=>text.normalize('NFC').trim().replace(/\s+/gu,' ');
const idPattern=/^[A-Za-z0-9_-]{1,80}$/;
export function validateEvaluationPlan(plan){
  if(!plan||typeof plan!=='object'||Array.isArray(plan)||Object.getPrototypeOf(plan)!==Object.prototype||
    Object.keys(plan).some(k=>!['schema_version','model','cases'].includes(k))||plan.schema_version!=='omega.model.eval.v1'||
    typeof plan.model!=='string'||plan.model.length>128||!idPattern.test(plan.model)||
    !Array.isArray(plan.cases)||plan.cases.length<1||plan.cases.length>MAX_CASES)throw Error('INVALID_EVALUATION_PLAN');
  const seen=new Set(),cases=[];
  for(const item of plan.cases){
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.getPrototypeOf(item)!==Object.prototype||
      Object.keys(item).some(k=>!['id','language','prompt','expected'].includes(k))||
      !idPattern.test(item.id)||seen.has(item.id)||!['pl','en'].includes(item.language)||
      typeof item.prompt!=='string'||!item.prompt.trim()||item.prompt.length>4096||
      !Array.isArray(item.expected)||item.expected.length<1||item.expected.length>8||
      item.expected.some(x=>typeof x!=='string'||!x.trim()||x.length>2048))throw Error('INVALID_EVALUATION_CASE');
    seen.add(item.id);cases.push({id:item.id,language:item.language,prompt:item.prompt,expected:[...item.expected]});
  }
  return {schema_version:plan.schema_version,model:plan.model,cases};
}
export function validateEndpoint(value){
  if(typeof value!=='string')throw Error('INVALID_LOCAL_ENDPOINT');
  let url;try{url=new URL(value)}catch{throw Error('INVALID_LOCAL_ENDPOINT')}
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.pathname!=='/v1/chat/completions'||
    !url.port||url.username||url.password||url.search||url.hash||url.origin!==`http://127.0.0.1:${url.port}`)
    throw Error('INVALID_LOCAL_ENDPOINT');
  return url.toString();
}
export async function readBounded(response){
  if(!response.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error('INVALID_MODEL_RESPONSE');
  if(!response.body)throw Error('INVALID_MODEL_RESPONSE');
  let n=0;const chunks=[];const reader=response.body.getReader();
  try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>MAX_RESPONSE)throw Error('MODEL_RESPONSE_TOO_LARGE');chunks.push(value)}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Error('INVALID_MODEL_RESPONSE')}
  const output=data?.choices?.[0]?.message?.content;
  if(typeof output!=='string'||output.length>8192)throw Error('INVALID_MODEL_RESPONSE');
  return output;
}
export async function evaluateLocalModel(source,{endpoint='http://127.0.0.1:8080/v1/chat/completions',fetchFn=fetch,signal,timeoutMs=10000}={}){
  const plan=validateEvaluationPlan(source),url=validateEndpoint(endpoint);
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw Error('INVALID_TIMEOUT');
  if(typeof fetchFn!=='function')throw Error('INVALID_FETCH_ADAPTER');
  const results=[];
  for(const item of plan.cases){
    if(signal?.aborted)throw Error('EVALUATION_CANCELLED');
    const started=performance.now();let passed=false,resultState='ERROR',outputHash=null;
    try{
      const response=await fetchFn(url,{
        method:'POST',headers:{'content-type':'application/json'},redirect:'error',cache:'no-store',
        signal:AbortSignal.any([signal??new AbortController().signal,AbortSignal.timeout(timeoutMs)]),
        body:JSON.stringify({model:plan.model,temperature:0,stream:false,max_tokens:256,messages:[{role:'user',content:item.prompt}]})
      });
      if(response.status!==200)throw Error('MODEL_HTTP_ERROR');
      const output=await readBounded(response);
      outputHash=createHash('sha256').update(output).digest('hex');
      passed=item.expected.some(x=>normalize(x)===normalize(output));resultState='OK';
    }catch(error){
      if(signal?.aborted)throw Error('EVALUATION_CANCELLED');
      resultState=error?.message==='MODEL_RESPONSE_TOO_LARGE'?'OVERSIZED_RESPONSE':'ERROR';
    }
    results.push({id:item.id,language:item.language,state:resultState,passed,latency_ms:Math.round(performance.now()-started),output_sha256:outputHash});
  }
  const summary={};for(const lang of ['pl','en']){const a=results.filter(x=>x.language===lang);summary[lang]={cases:a.length,passed:a.filter(x=>x.passed).length,transport_errors:a.filter(x=>x.state!=='OK').length,accuracy:a.length?a.filter(x=>x.passed).length/a.length:null}}
  return {schema_version:'omega.model.eval.result.v1',model:plan.model,evaluation_method:'NORMALIZED_EXACT_MATCH',execution:'REAL_LOOPBACK_RESPONSES',sample_count:results.length,summary,results,disclaimer:'Dataset-specific exact match only, not a general PL/EN quality or safety benchmark.'};
}
async function cli(){
  if(process.argv.length<3||process.argv.length>4)throw Error('Usage: node scripts/model-eval.mjs <local-cases.json> [http://127.0.0.1:PORT/v1/chat/completions]');
  const file=resolve(process.argv[2]);const stat=await lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1048576)throw Error('INVALID_CASE_FILE');
  const plan=JSON.parse(await readFile(file,'utf8'));
  const output=await evaluateLocalModel(plan,{endpoint:process.argv[3]??undefined});
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
  if(output.results.some(r=>r.state!=='OK'))process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))cli().catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1});
