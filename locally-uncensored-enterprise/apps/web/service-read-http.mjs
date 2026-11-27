/** Authenticated, read-only operator services. No mutation routes. */
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys;
export function createServiceReadHandler({runtime,clock=()=>Math.floor(Date.now()/1000)}={}){
 if(typeof runtime!=='function'||typeof clock!=='function')throw Error('Invalid service configuration');
 let active=0;
 return async function handle(req,res,port){
  const path=req.url;if(!['/api/local/mining/status','/api/local/phone/owned','/api/local/phone/available'].includes(path))return false;
  const fail=code=>{if(res.headersSent)res.destroy();else{res.statusCode=code;res.setHeader('cache-control','no-store');res.end('Request unavailable')}return true};
  if(req.method!=='POST')return fail(405);
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)||req.headers['content-type']!=='application/json'||req.headers['x-omega-service-read']!=='1')return fail(403);
  const token=/^Bearer ([A-Za-z0-9_.-]{1,16384})$/.exec(req.headers.authorization??'')?.[1];if(!token)return fail(401);
  let n=0;const parts=[];for await(const chunk of req){n+=chunk.length;if(n>4096)return fail(413);parts.push(chunk)}
  let q;try{q=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));if(path.endsWith('/status')){if(!exact(q,'device')||typeof q.device!=='string'||!ID.test(q.device))throw Error()}else if(path.endsWith('/owned')){if(!exact(q,''))throw Error()}else if(!exact(q,'country,type')||typeof q.country!=='string'||!/^[A-Z]{2}$/.test(q.country)||!['Local','Mobile','TollFree'].includes(q.type))throw Error()}catch{return fail(400)}
  if(active>=8)return fail(429);active++;
  try{
   let service;try{service=runtime()}catch{return fail(503)}if(!service)return fail(503);
   let principal;try{principal=await service.oidc.verify(token)}catch{return fail(401)}
   if(!principal||!Number.isSafeInteger(principal.expires)||principal.expires<=clock())return fail(401);
   const adapter=path.includes('/mining/')?service.miner:service.phone;if(!adapter)return fail(503);
   let data;try{data=path.endsWith('/status')?await adapter.status(principal,q.device):{items:path.endsWith('/owned')?await adapter.owned(principal):await adapter.available(principal,q)}}catch{return fail(403)}
   if(principal.expires<=clock())return fail(401);
   const body=JSON.stringify(data);if(Buffer.byteLength(body)>131072)return fail(502);
   res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('x-content-type-options','nosniff');res.end(body);return true;
  }finally{active--}
 };
}
