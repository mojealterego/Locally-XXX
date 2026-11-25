import {executeLocalTool} from './devsuite-service.mjs';

const MAX_BODY=65536;
const originAllowed=(origin,port)=>origin===`http://127.0.0.1:${port}`||origin===`http://localhost:${port}`;

/** True when consumed; false for unrelated API routes. */
export async function handleLocalToolsHttp(req,res,port){
  if(req.url!=='/api/local/tools')return false;
  const fail=code=>{res.statusCode=code;res.setHeader('cache-control','no-store');res.end('Request unavailable');};
  if(req.method!=='POST'){fail(405);return true;}
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host) || !originAllowed(req.headers.origin,port)){
    fail(403);return true;
  }
  if(req.headers['content-type']!=='application/json' || req.headers['x-omega-local-tool']!=='1'){
    fail(403);return true;
  }
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY){fail(413);return true;}chunks.push(chunk);}
  let output;
  try{output=executeLocalTool(JSON.parse(Buffer.concat(chunks).toString('utf8')));}
  catch{fail(400);return true;}
  res.statusCode=200;res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json; charset=utf-8');
  res.end(JSON.stringify(output));
  return true;
}
