import {runExperimentPlan} from './experiment-runner.mjs';
const isOrigin=(o,p)=>o===`http://127.0.0.1:${p}`||o===`http://localhost:${p}`;
/** Local planning only: no cloud, training, GPU or promotion permissions. */
export async function handleExperimentHttp(req,res,port,worker=runExperimentPlan){
 if(req.url!=='/api/local/experiments/plan')return false;
 const fail=code=>{res.statusCode=code;res.setHeader('cache-control','no-store');res.end('Request unavailable')};
 if(req.method!=='POST'){fail(405);return true}
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!isOrigin(req.headers.origin,port)||req.headers['content-type']!=='application/json'||req.headers['x-omega-experiment']!=='1'){
  fail(403);return true;
 }
 let n=0;const parts=[];
 for await(const chunk of req){n+=chunk.length;if(n>65536){fail(413);return true}parts.push(chunk)}
 let request;try{request=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!request||Array.isArray(request)||typeof request!=='object')throw Error('Invalid')}catch{fail(400);return true}
 const c=new AbortController();const close=()=>c.abort();res.once('close',close);
 try{
  const output=await worker(request,{signal:c.signal});
  if(output?.status!=='PLAN_ONLY_NOT_TRAINED'||output.execution!=='NO_EXECUTOR_BOUND'||output.authorization?.cloud_plan_authorized!==false||output.authorization?.external_dataset_egress_authorized!==false)throw Error('Untrusted result');
  const data=JSON.stringify(output);
  if(Buffer.byteLength(data,'utf8')>262144){fail(502);return true}
  if(!res.destroyed){res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(data)}
 }catch(e){if(!res.destroyed)fail(e.message==='EXPERIMENT_BUSY'?429:e.message==='EXPERIMENT_REJECTED'?400:e.message==='EXPERIMENT_TIMEOUT'?504:502)}finally{res.off('close',close)}
 return true;
}
