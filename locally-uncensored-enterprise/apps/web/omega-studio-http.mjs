import {runOmegaStudio} from './omega-studio-runner.mjs';
export async function handleOmegaStudioHttp(req,res,port){
 if(req.url!=='/api/local/omega-studio/plan')return false;
 const fail=n=>{if(res.destroyed)return;if(res.headersSent){res.destroy();return}res.statusCode=n;res.setHeader('cache-control','no-store');res.end('Request unavailable')};
 if(req.method!=='POST'){fail(405);return true}
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)||req.headers['content-type']!=='application/json'||req.headers['x-omega-studio']!=='1'){fail(403);return true}
 let n=0;const parts=[];for await(const b of req){n+=b.length;if(n>32768){fail(413);return true}parts.push(b)}
 let v;try{v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));if(!v||typeof v!=='object'||Array.isArray(v))throw Error()}catch{fail(400);return true}
 const ctl=new AbortController(),abort=()=>ctl.abort();res.once('close',abort);
 try{const result=await runOmegaStudio(v,{signal:ctl.signal});if(!res.destroyed){res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(result))}}catch(e){fail(e.message==='STUDIO_INVALID'?400:e.message==='STUDIO_BUSY'?429:e.message==='STUDIO_TIMEOUT'?504:503)}finally{res.off('close',abort)}return true;
}
