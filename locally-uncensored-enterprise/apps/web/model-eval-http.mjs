import {evaluateLocalModel,validateEvaluationPlan} from '../../../scripts/model-eval.mjs';

let running=false;
const allowedOrigin=(value,p)=>value===`http://127.0.0.1:${p}`||value===`http://localhost:${p}`;
/** Executes bounded PL/EN model test cases on operator-configured loopback endpoint only. */
export async function handleModelEvalHttp(req,res,port,evaluate=evaluateLocalModel,endpoint=process.env.OMEGA_MODEL_EVAL_ENDPOINT){
 if(req.url!=='/api/local/models/evaluate')return false;
 const fail=status=>{if(res.headersSent){res.destroy();return}res.statusCode=status;res.setHeader('cache-control','no-store');res.end('Request unavailable')};
 if(req.method!=='POST'){fail(405);return true}
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!allowedOrigin(req.headers.origin,port)||req.headers['x-omega-models']!=='1'||req.headers['content-type']!=='application/json'){
   fail(403);return true;
 }
 if(!endpoint){fail(503);return true}
 let length=0;const chunks=[];
 for await(const chunk of req){length+=chunk.length;if(length>131072){fail(413);return true;}chunks.push(chunk)}
 let plan;
 try{plan=validateEvaluationPlan(JSON.parse(Buffer.concat(chunks).toString('utf8')));if(plan.cases.length>12)throw Error('Too many requests')}
 catch{fail(400);return true}
 if(running){fail(429);return true}
 running=true;const ctl=new AbortController();const aborted=()=>ctl.abort();res.once('close',aborted);
 try{
   const result=await evaluate(plan,{endpoint,timeoutMs:10000,signal:ctl.signal});
   if(result?.schema_version!=='omega.model.eval.result.v1'||result.execution!=='REAL_LOOPBACK_RESPONSES'||result.sample_count!==plan.cases.length)throw Error('Invalid result');
   const output=JSON.stringify(result);
   if(Buffer.byteLength(output,'utf8')>262144){fail(502);return true}
   if(!res.destroyed){res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json; charset=utf-8');res.end(output)}
 }catch{if(!res.destroyed)fail(502)}finally{res.off('close',aborted);running=false}
 return true;
}
