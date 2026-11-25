import {scanGGUF} from '../../../scripts/gguf-inventory.mjs';

let scanning=false;
const isOrigin=(v,p)=>v===`http://127.0.0.1:${p}`||v===`http://localhost:${p}`;

/** Local-only model headers. No model loading, inference, downloads, or network. */
export async function handleModelsHttp(req,res,port,scanner=scanGGUF,modelDir=process.env.OMEGA_MODEL_DIR){
 if(req.url!=='/api/local/models/inventory')return false;
 const fail=code=>{res.statusCode=code;res.setHeader('cache-control','no-store');res.end('Request unavailable')};
 if(req.method!=='POST'){fail(405);return true}
 if(!['localhost:'+port,'127.0.0.1:'+port].includes(req.headers.host)||!isOrigin(req.headers.origin,port)||req.headers['x-omega-models']!=='1'||req.headers['content-type']!=='application/json'){
   fail(403);return true;
 }
 let n=0;const chunks=[];
 for await(const part of req){n+=part.length;if(n>512){fail(413);return true}chunks.push(part)}
 try{const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(input===null||Array.isArray(input)||typeof input!=='object'||Object.keys(input).length!==0)throw Error('Bad input')}
 catch{fail(400);return true}
 if(!modelDir||typeof modelDir!=='string'){fail(503);return true}
 if(scanning){fail(429);return true}
 scanning=true;
 try{
   const result=await scanner(modelDir,{sha256:false,maxDepth:6,maxEntries:3000});
   if(!Array.isArray(result.models)||!Array.isArray(result.rejected)||!Number.isSafeInteger(result.files))throw Error('Invalid inventory result');
   const body=JSON.stringify({schema_version:'omega.model.inventory.v1',state:'GGUF_HEADERS_ONLY_NOT_INFERENCE',models:result.models,rejected:result.rejected,file_count:result.files,disclaimer:'File size heuristic only; no tensor evaluation, PL/EN quality score, or running model.'});
   if(Buffer.byteLength(body,'utf8')>1048576){fail(502);return true}
   res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(body);
 }catch{fail(502)}finally{scanning=false}
 return true;
}
