import {runComputePlan} from './compute-runner.mjs';
const originValid=(origin,p)=>origin===`http://127.0.0.1:${p}`||origin===`http://localhost:${p}`;
/** Local offline-only admission plans; remote resources and automatic model loading forbidden. */
export async function handleComputeHttp(req,res,port,runner=runComputePlan){
 if(req.url!=='/api/local/compute/plan')return false;
 const fail=code=>{res.statusCode=code;res.setHeader('cache-control','no-store');res.end('Request unavailable')};
 if(req.method!=='POST'){fail(405);return true}
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!originValid(req.headers.origin,port)||req.headers['content-type']!=='application/json'||req.headers['x-omega-compute']!=='1'){
  fail(403);return true;
 }
 let length=0;const parts=[];
 for await(const chunk of req){length+=chunk.length;if(length>65536){fail(413);return true}parts.push(chunk)}
 let request;try{request=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!request||typeof request!=='object'||Array.isArray(request))throw Error('Invalid')}catch{fail(400);return true}
 const ctl=new AbortController(),onClose=()=>ctl.abort();res.once('close',onClose);
 try{
  const result=await runner(request,{signal:ctl.signal});
  if(result?.schema_version!=='omega.compute.offline.result.v1'||result.execution_mode!=='OFFLINE'||result.runtime_executed!==false||result.cloud_egress!==false||result.inventory_verified!==false||result.telemetry_verified!==false)throw Error('COMPUTE_POLICY_EVIDENCE_REQUIRED');
  const body=JSON.stringify(result);
  if(Buffer.byteLength(body,'utf8')>262144){fail(502);return true;}
  if(!res.destroyed){res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(body)}
 }catch(e){if(!res.destroyed)fail(e.message==='COMPUTE_BUSY'?429:e.message==='COMPUTE_DENIED'?400:e.message==='COMPUTE_TIMEOUT'?504:502)}finally{res.off('close',onClose)}
 return true;
}
