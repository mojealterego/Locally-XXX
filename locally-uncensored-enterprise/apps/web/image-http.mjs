import {buildImageWorkflow,runLocalImage} from './image-runner.mjs';
const config=()=>process.env.OMEGA_COMFY_PORT&&process.env.OMEGA_COMFY_CHECKPOINT?{port:Number(process.env.OMEGA_COMFY_PORT),checkpoint:process.env.OMEGA_COMFY_CHECKPOINT}:null;
export async function handleImageHttp(req,res,port,{getConfig=config,runner=runLocalImage}={}){
 if(req.url!=='/api/local/image/render')return false;
 const fail=n=>{if(res.destroyed)return;if(res.headersSent){res.destroy();return}res.statusCode=n;res.setHeader('cache-control','no-store');res.end('Request unavailable')};
 if(req.method!=='POST'){fail(405);return true}
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)||req.headers['content-type']!=='application/json'||req.headers['x-omega-image']!=='1'){fail(403);return true}
 if(process.env.OMEGA_IMAGE_QUEUE_DIR){fail(409);return true}
 const c=getConfig();if(!c){fail(503);return true}
 let n=0;const parts=[];for await(const b of req){n+=b.length;if(n>16384){fail(413);return true}parts.push(b)}
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));buildImageWorkflow(value,c)}catch{fail(400);return true}
 const ctl=new AbortController(),abort=()=>ctl.abort();res.once('close',abort);
 try{const data=await runner(value,{...c,signal:ctl.signal});if(!Buffer.isBuffer(data)||!data.length||data.length>8*1024*1024)throw Error('IMAGE_OUTPUT_INVALID');if(!res.destroyed){res.setHeader('cache-control','no-store');res.setHeader('content-type','image/png');res.setHeader('x-content-type-options','nosniff');res.end(data)}}catch(e){fail(e.message==='IMAGE_BUSY'?429:e.message==='IMAGE_TIMEOUT'?504:502)}finally{res.off('close',abort)}return true;
}
