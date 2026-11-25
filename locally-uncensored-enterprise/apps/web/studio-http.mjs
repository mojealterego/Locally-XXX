import {compileProductionIntegration} from '../../../overlays/omega-integrations/bridge.mjs';

const MAX_REQUEST=262144,MAX_RESPONSE=1048576;
const allowedOrigin=(value,port)=>value===`http://127.0.0.1:${port}`||value===`http://localhost:${port}`;

/** Authoring-plane request only: never dispatches a renderer, model or production job. */
export async function handleStudioHttp(req,res,port,compile=compileProductionIntegration){
  if(req.url!=='/api/local/studio/plan')return false;
  const fail=code=>{res.statusCode=code;res.setHeader('cache-control','no-store');res.end('Request unavailable')};
  if(req.method!=='POST'){fail(405);return true;}
  if(!['localhost:'+port,'127.0.0.1:'+port].includes(req.headers.host)||!allowedOrigin(req.headers.origin,port)||req.headers['x-omega-plan']!=='1'||req.headers['content-type']!=='application/json'){
    fail(403);return true;
  }
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>MAX_REQUEST){fail(413);return true;}chunks.push(chunk);}
  let manifest,serialized;
  try{
    const request=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    manifest=compile(request);
    if(manifest?.status!=='PLAN_ONLY_NOT_BUILT'||manifest?.engine_adapter!=='NOT_CONNECTED')throw Error('Invalid plan boundary');
    serialized=JSON.stringify(manifest);
    if(Buffer.byteLength(serialized,'utf8')>MAX_RESPONSE){fail(413);return true;}
  }catch{fail(400);return true;}
  res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json; charset=utf-8');res.end(serialized);
  return true;
}
