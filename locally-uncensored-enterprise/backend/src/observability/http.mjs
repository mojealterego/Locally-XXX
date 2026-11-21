import {createServer} from 'node:http';
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const bad=()=>{throw Error('Audit request denied')};
const exact=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===ks.slice().sort().join(',');
async function body(req){if(req.headers['content-type']!=='application/json')bad();let size=0;const parts=[];for await(const p of req){size+=p.length;if(size>4096)bad();parts.push(p)}let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)))}catch{bad()}if(!exact(data,['agent','since','limit'])||typeof data.agent!=='string'||!ID.test(data.agent)||!Number.isSafeInteger(data.since)||data.since<0||!Number.isSafeInteger(data.limit)||data.limit<1||data.limit>200)bad();return data}
export function auditServer({ledger,oidc,permit,allowedOrigins=['http://127.0.0.1:4173','http://localhost:4173'],streamMs=30000,heartbeatMs=1000,clock=()=>Date.now()/1000}={}){
 if(typeof ledger?.list!=='function'||typeof oidc?.verify!=='function'||typeof permit?.allowed!=='function'||!Array.isArray(allowedOrigins)||!allowedOrigins.every(x=>typeof x==='string'&&x.startsWith('http'))||!Number.isSafeInteger(streamMs)||streamMs<100||streamMs>60000||!Number.isSafeInteger(heartbeatMs)||heartbeatMs<50||heartbeatMs>10000||typeof clock!=='function')bad();
 let active=0;
 const server=createServer({requestTimeout:15000,headersTimeout:5000,maxHeaderSize:8192},async(req,res)=>{
  res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('x-frame-options','DENY');res.setHeader('referrer-policy','no-referrer');
  const send=(status,msg)=>{if(res.writableEnded||res.destroyed)return;res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify({error:msg}))};
  if(active>=16)return send(503,'Busy');active++;
  let streaming=false;
  try{
   if(req.method!=='POST'||!['/api/audit/list','/api/audit/stream'].includes(req.url))return send(404,'Not found');
   if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin))return send(403,'Denied');
   const token=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(req.headers.authorization??'')?.[1];if(!token)return send(401,'Unauthorized');
   let principal;try{principal=await oidc.verify(token)}catch{return send(401,'Unauthorized')}
   if(!principal||typeof principal.tenant!=='string'||typeof principal.expires!=='number'||principal.expires<=clock())return send(401,'Unauthorized');
   const query=await body(req);if(await permit.allowed(principal,principal.tenant,'read',query.agent)!==true)return send(403,'Denied');
   if(req.url==='/api/audit/list'){
    const data=ledger.list({...query,tenant:principal.tenant});res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(data));return;
   }
   res.statusCode=200;res.setHeader('content-type','text/event-stream; charset=utf-8');res.setHeader('connection','keep-alive');res.setHeader('x-accel-buffering','no');
   let cursor=query.since,done=false,timer,deadline;streaming=true;
   const stop=()=>{if(done)return;done=true;clearInterval(timer);clearTimeout(deadline);active--;if(!res.writableEnded&&!res.destroyed)res.end()};
   const flush=()=>{if(done||res.destroyed)return stop();if(principal.expires<=clock())return stop();try{
    const result=ledger.list({tenant:principal.tenant,agent:query.agent,since:cursor,limit:query.limit});
    for(const row of result.entries){const frame='id: '+row.seq+'\nevent: audit\ndata: '+JSON.stringify(row)+'\n\n';if(!res.write(frame))return stop();cursor=row.seq}
    if(!result.entries.length&&!res.write(': heartbeat\n\n'))return stop();
   }catch{if(!res.destroyed)res.write('event: error\ndata: {"error":"Audit unavailable"}\n\n');stop()}};
   flush();if(!done){timer=setInterval(flush,heartbeatMs);timer.unref();deadline=setTimeout(stop,Math.min(streamMs,Math.max(0,(principal.expires-clock())*1000)));deadline.unref();res.once('close',stop)}
  }catch{return send(403,'Denied')}finally{if(!streaming)active--}
 });server.maxConnections=32;return server;
}
