import {ArtifactStore,readStorageKey,MAX_FILE} from '../../backend/src/storage/artifacts.mjs';
const ID=/^[a-f0-9]{64}$/;
const MAX_BODY=Math.ceil(MAX_FILE/3)*4+1024;
let store;
function localStore(){if(!process.env.OMEGA_STORAGE_DIR||!process.env.OMEGA_STORAGE_KEY_FILE)return null;if(!store){const key=readStorageKey(process.env.OMEGA_STORAGE_KEY_FILE);try{store=new ArtifactStore({directory:process.env.OMEGA_STORAGE_DIR,key})}finally{key.fill(0)}process.once('exit',()=>store.close())}return store}
const exact=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===ks;
const id=v=>typeof v==='string'&&ID.test(v);
export async function handleStorageHttp(req,res,port,provider=localStore){
 const op={'/api/local/storage/list':'list','/api/local/storage/put':'put','/api/local/storage/get':'get','/api/local/storage/remove':'remove'}[req.url];if(!op)return false;
 const fail=code=>{if(res.headersSent){res.destroy();return}res.statusCode=code;res.setHeader('cache-control','no-store');res.end('Request unavailable')};
 if(req.method!=='POST'){fail(405);return true}
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)||req.headers['content-type']!=='application/json'||req.headers['x-omega-storage']!=='1'){fail(403);return true}
 let n=0;const chunks=[];for await(const chunk of req){n+=chunk.length;if(n>(op==='put'?MAX_BODY:1024)){fail(413);return true}chunks.push(chunk)}
 let data,bytes;
 try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));if(op==='list'&&!exact(data,''))throw Error();if(op==='get'&&(!exact(data,'id')||!id(data.id)))throw Error();if(op==='remove'&&(!exact(data,'confirm,id')||!id(data.id)||data.confirm!==data.id))throw Error();if(op==='put'){if(!exact(data,'base64,name')||typeof data.name!=='string'||typeof data.base64!=='string'||data.base64.length>Math.ceil(MAX_FILE/3)*4)throw Error();bytes=Buffer.from(data.base64,'base64');if(!bytes.length||bytes.length>MAX_FILE||bytes.toString('base64')!==data.base64)throw Error()}}catch{fail(400);return true}
 let vault;try{vault=provider()}catch{fail(503);return true}if(!vault){fail(503);return true}
 try{res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');if(op==='get'){const item=vault.get(data.id);if(!item){fail(404);return true}res.setHeader('content-type','application/octet-stream');res.setHeader('content-disposition','attachment');res.setHeader('content-length',item.data.length);res.end(item.data);return true}const result=op==='list'?{items:vault.list()}:op==='put'?vault.put(data.name,bytes):{removed:vault.remove(data.id)};res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(result))}catch{fail(409)}return true;
}
