import {validateChatRequest,requestLocalChat} from '../../../scripts/local-chat.mjs';
let running=false;
/** Local-only chat. Endpoint is configured by the operator, never by HTTP clients. */
export async function handleChatHttp(req,res,port,endpoint=process.env.OMEGA_LOCAL_CHAT_ENDPOINT){
 if(req.url!=='/api/local/chat')return false;
 const fail=code=>{if(res.headersSent){res.destroy();return}res.statusCode=code;res.setHeader('cache-control','no-store');res.end('Request unavailable')};
 if(req.method!=='POST'){fail(405);return true}
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)||req.headers['content-type']!=='application/json'||req.headers['x-omega-chat']!=='1'){fail(403);return true}
 if(!endpoint){fail(503);return true}
 let bytes=0;const chunks=[];
 for await(const chunk of req){bytes+=chunk.length;if(bytes>98304){fail(413);return true}chunks.push(chunk)}
 let request;try{request=validateChatRequest(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{fail(400);return true}
 if(running){fail(429);return true}
 running=true;const ctl=new AbortController(),abort=()=>ctl.abort();res.once('close',abort);
 try{
  const content=await requestLocalChat(request,{endpoint,signal:ctl.signal});
  if(!res.destroyed){res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify({content}))}
 }catch{if(!res.destroyed)fail(502)}finally{res.off('close',abort);running=false}
 return true;
}
