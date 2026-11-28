import {ImageQueue} from './image-queue.mjs';
import {runLocalImage} from './image-runner.mjs';
let queue;
const local=()=>{if(!process.env.OMEGA_IMAGE_QUEUE_DIR||process.env.OMEGA_MEDIA_QUEUE_DIR)return null;if(!queue){queue=new ImageQueue({directory:process.env.OMEGA_IMAGE_QUEUE_DIR});process.once('exit',()=>queue.close())}return queue};
const config=()=>process.env.OMEGA_COMFY_PORT&&process.env.OMEGA_COMFY_CHECKPOINT?{port:Number(process.env.OMEGA_COMFY_PORT),checkpoint:process.env.OMEGA_COMFY_CHECKPOINT}:null;
const routes=new Map(['enqueue','list','run','cancel','acknowledge','result'].map(x=>['/api/local/image/jobs/'+x,x]));
const exact=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===k;
export async function handleImageQueueHttp(req,res,port,{getQueue=local,getConfig=config,runner=runLocalImage}={}){
 const op=routes.get(req.url);if(!op)return false;
 const fail=n=>{if(res.destroyed)return;if(res.headersSent){res.destroy();return}res.statusCode=n;res.setHeader('cache-control','no-store');res.end('Request unavailable')};
 if(req.method!=='POST'){fail(405);return true}
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)||req.headers['content-type']!=='application/json'||req.headers['x-omega-image']!=='1'){fail(403);return true}
 let n=0;const parts=[];for await(const b of req){n+=b.length;if(n>18432){fail(413);return true}parts.push(b)}
 let v;try{v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));if(!exact(v,op==='list'?'':op==='enqueue'?'id,input':['run','cancel','acknowledge'].includes(op)?'approved,id':'id')||(['run','cancel','acknowledge'].includes(op)&&v.approved!==true))throw Error()}catch{fail(400);return true}
 let q;try{q=getQueue();if(!q)throw Error()}catch{fail(503);return true}
 try{
  let data;
  if(op==='list')data={jobs:q.list()};
  else if(op==='result'){const b=q.result(v.id);res.setHeader('cache-control','no-store');res.setHeader('content-type','image/png');res.setHeader('x-content-type-options','nosniff');res.end(b);return true}
  else if(op==='cancel'){q.cancel(v.id);data={jobs:q.list()}}
  else if(op==='acknowledge'){q.acknowledge(v.id,v.approved);data={jobs:q.list()}}
  else {const c=getConfig();if(!c){fail(503);return true}if(op==='enqueue')data=q.enqueue(v.id,v.input,c);else{
   const claim=q.claim(v.id,c),ctl=new AbortController(),abort=()=>ctl.abort();res.once('close',abort);if(res.destroyed)abort();
   try{const b=await runner(claim.input,{...c,signal:ctl.signal});q.complete(v.id,claim.token,b)}catch{try{q.unknown(v.id,claim.token)}catch{} }finally{res.off('close',abort)}
   data={jobs:q.list()};
  }}
  if(!res.destroyed){res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('x-content-type-options','nosniff');res.end(JSON.stringify(data))}
 }catch{fail(409)}return true;
}
