import {createServer} from 'node:http';
import {CloudConsent,validatePrompt,validProvider} from './policy.mjs';
import {cloudStream} from './providers.mjs';
const deny=()=>{throw Error('Denied')};
async function jsonBody(req){if(req.headers['content-type']!=='application/json')deny();let total=0;const data=[];for await(const chunk of req){total+=chunk.length;if(total>73728)deny();data.push(chunk)}let object;try{object=JSON.parse(Buffer.concat(data).toString('utf8'))}catch{deny()}if(!object||typeof object!=='object'||Array.isArray(object))deny();return object}
const exact=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).sort().join(',')===keys.slice().sort().join(',');
export function cloudServer({oidc,permit,vault,quota=null,enabled=false,stream=cloudStream,allowedOrigins=['http://127.0.0.1:4173','http://localhost:4173'],clock=()=>Date.now()/1000}){
 if(!oidc?.verify||!permit?.allowed||!vault?.using||!vault?.set||typeof stream!=='function'||typeof enabled!=='boolean'||(enabled&&(!quota||typeof quota.reserve!=='function'||typeof quota.snapshot!=='function')))throw Error('Cloud gateway dependencies required');
 const authorize=(p,_provider,action)=>permit.allowed(p,p.tenant,action,'cloud-gateway');
 const consent=new CloudConsent({enabled,authorize,clock});let active=0;
 const server=createServer({requestTimeout:15000,headersTimeout:5000,maxHeaderSize:16384},async(req,res)=>{
  res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');res.setHeader('x-frame-options','DENY');
  const send=(status,response)=>{if(res.writableEnded||res.destroyed)return;res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(response))};
  if(active>=8)return send(503,{error:'Unavailable'});active++;
  try{
   if(req.method!=='POST'||!['/api/cloud/credential','/api/cloud/forget','/api/cloud/status','/api/cloud/approve','/api/cloud/stream'].includes(req.url))return send(404,{error:'Not found'});
   if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin))return send(403,{error:'Denied'});
   const match=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(req.headers.authorization??'');if(!match)return send(401,{error:'Unauthorized'});
   let principal;try{principal=await oidc.verify(match[1])}catch{return send(401,{error:'Unauthorized'})}
   const action=['/api/cloud/credential','/api/cloud/forget'].includes(req.url)?'create':'interact';
   if(!await authorize(principal,null,action))return send(403,{error:'Denied'});
   const body=await jsonBody(req);
   if(req.url==='/api/cloud/credential'){
    if(!exact(body,['provider','credential'])||typeof body.credential!=='string')deny();validProvider(body.provider);
    vault.set(principal.tenant,body.provider,body.credential);return send(200,{stored:true,provider:body.provider});
   }
   if(req.url==='/api/cloud/forget'){
    if(!exact(body,['provider']))deny();validProvider(body.provider);vault.remove(principal.tenant,body.provider);return send(200,{removed:true,provider:body.provider});
   }
   if(req.url==='/api/cloud/status'){
    if(!exact(body,['provider']))deny();validProvider(body.provider);return send(200,{configured:vault.has(principal.tenant,body.provider),enabled,quota:quota?.snapshot(principal.tenant)??null});
   }
   if(req.url==='/api/cloud/approve'){
    if(!enabled||!exact(body,['request']))deny();const request=validatePrompt(body.request);if(!vault.has(principal.tenant,request.provider))deny();
    return send(200,await consent.issue(principal,request));
   }
   if(!enabled||!exact(body,['ticket','request']))deny();const request=await consent.consume(principal,body.ticket,body.request);
   if(!vault.has(principal.tenant,request.provider))deny();
   quota.reserve(principal.tenant,request);
   // Important: streaming credentials never travel to caller; all provider URLs are hardcoded.
   res.statusCode=200;res.setHeader('content-type','text/event-stream; charset=utf-8');res.setHeader('connection','keep-alive');res.setHeader('x-accel-buffering','no');
   const ctl=new AbortController();const abort=()=>ctl.abort();res.once('close',abort);
   try{await vault.using(principal.tenant,request.provider,async credential=>{
    for await(const token of stream(request,credential,{signal:ctl.signal})){if(res.destroyed||ctl.signal.aborted)break;if(typeof token!=='string'||token.length>16384)deny();res.write('event: token\ndata: '+JSON.stringify({text:token})+'\n\n')}
   });if(!res.destroyed)res.end('event: done\ndata: {}\n\n');}
   catch{if(!res.destroyed)res.end('event: error\ndata: {"error":"Provider unavailable"}\n\n')}
   finally{res.off('close',abort)}
  }catch{return send(403,{error:'Denied'})}finally{active--}
 });server.maxConnections=32;return server;
}
