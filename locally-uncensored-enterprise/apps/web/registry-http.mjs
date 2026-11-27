import {loadCatalog} from '../../backend/src/registry/signed-catalog.mjs';
const local=()=>process.env.OMEGA_AGENT_CATALOG&&process.env.OMEGA_AGENT_PUBLIC_KEY?loadCatalog({catalog:process.env.OMEGA_AGENT_CATALOG,key:process.env.OMEGA_AGENT_PUBLIC_KEY}):null;
export async function handleRegistryHttp(req,res,port,loader=local){
 if(req.url!=='/api/local/registry/list')return false;
 const fail=n=>{if(res.destroyed)return;if(res.headersSent){res.destroy();return}res.statusCode=n;res.setHeader('cache-control','no-store');res.end('Request unavailable')};
 if(req.method!=='POST'){fail(405);return true}
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)||req.headers['content-type']!=='application/json'||req.headers['x-omega-registry']!=='1'){fail(403);return true}
 let n=0;const parts=[];for await(const b of req){n+=b.length;if(n>1024){fail(413);return true}parts.push(b)}
 try{const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length)throw Error()}catch{fail(400);return true}
 try{const v=loader();if(v?.signatureVerified!==true||v.artifactsVerified!==false||v.certificationVerified!==false)throw Error();const data=JSON.stringify(v);if(Buffer.byteLength(data)>524288)throw Error();res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.end(data)}catch{fail(503)}return true;
}
