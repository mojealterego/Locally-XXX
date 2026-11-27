import {prepareExamples} from '../../backend/src/training/dataset.mjs';
const MAX_REQUEST=1048576,MAX_RESPONSE=4194304;
/** Local-only dataset preparation. No model execution, cloud transfer or filesystem writes. */
export async function handleTrainingHttp(req,res,port){
 if(req.url!=='/api/local/training/prepare')return false;
 const fail=code=>{if(res.headersSent){res.destroy();return}res.statusCode=code;res.setHeader('cache-control','no-store');res.end('Request unavailable')};
 if(req.method!=='POST'){fail(405);return true}
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)||req.headers['content-type']!=='application/json'||req.headers['x-omega-training']!=='1'){fail(403);return true}
 let n=0;const chunks=[];
 for await(const chunk of req){n+=chunk.length;if(n>MAX_REQUEST){fail(413);return true}chunks.push(chunk)}
 let result;
 try{
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='evalPercent,jsonl'||typeof value.jsonl!=='string'||!Number.isInteger(value.evalPercent))throw Error('Invalid dataset request');
  result=JSON.stringify(prepareExamples(value.jsonl,{evalPercent:value.evalPercent}));
 }catch{fail(400);return true}
 if(Buffer.byteLength(result)>MAX_RESPONSE){fail(413);return true}
 res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json; charset=utf-8');res.end(result);return true;
}
