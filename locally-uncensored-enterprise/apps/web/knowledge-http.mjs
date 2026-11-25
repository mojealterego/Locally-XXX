import {runKnowledgeReconciliation} from './knowledge-runner.mjs';
const allowedOrigin=(o,p)=>o===`http://127.0.0.1:${p}`||o===`http://localhost:${p}`;
/** Local-only OTCM/ATM view; no production tool execution, no external services. */
export async function handleKnowledgeHttp(req,res,port,runner=runKnowledgeReconciliation){
 if(req.url!=='/api/local/knowledge/reconcile')return false;
 const fail=code=>{if(res.headersSent){res.destroy();return}res.statusCode=code;res.setHeader('cache-control','no-store');res.end('Request unavailable')};
 if(req.method!=='POST'){fail(405);return true}
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!allowedOrigin(req.headers.origin,port)||req.headers['content-type']!=='application/json'||req.headers['x-omega-knowledge']!=='1'){
  fail(403);return true;
 }
 let n=0;const parts=[];
 for await(const p of req){n+=p.length;if(n>65536){fail(413);return true}parts.push(p)}
 let input;try{input=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Bad input')}
 catch{fail(400);return true}
 const controller=new AbortController();const abort=()=>controller.abort();res.once('close',abort);
 try{
  const result=await runner(input,{signal:controller.signal});
  if(result?.schema_version!=='omega.knowledge.reconciliation.v1'||result.action_executed!==false||result.memory_persisted!==false||result.proof_state!=='NO_CHECKED_PROOF'||result.share_state!=='PRIVATE_ONLY')throw Error('Invalid output');
  const bytes=JSON.stringify(result);
  if(Buffer.byteLength(bytes,'utf8')>1048576){fail(502);return true}
  if(!res.destroyed){res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json; charset=utf-8');res.end(bytes)}
 }catch(e){if(!res.destroyed)fail(e.message==='KNOWLEDGE_BUSY'?429:e.message==='KNOWLEDGE_REJECTED'?400:e.message==='KNOWLEDGE_TIMEOUT'?504:502)}finally{res.off('close',abort)}
 return true;
}
