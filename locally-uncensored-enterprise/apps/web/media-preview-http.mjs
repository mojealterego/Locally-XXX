import {runMediaPreview} from './media-preview-runner.mjs';

const MAX_BODY=131072;
const allowedOrigin=(origin,port)=>origin===`http://127.0.0.1:${port}`||origin===`http://localhost:${port}`;

/** Local CPU preview only. Result cannot masquerade as rendered image/video. */
export async function handleMediaPreviewHttp(req,res,port,runner=runMediaPreview){
  if(req.url!=='/api/local/media/preview')return false;
  const fail=code=>{if(!res.headersSent){res.statusCode=code;res.setHeader('cache-control','no-store');res.end('Request unavailable');}};
  if(req.method!=='POST'){fail(405);return true;}
  if(!['localhost:'+port,'127.0.0.1:'+port].includes(req.headers.host)||!allowedOrigin(req.headers.origin,port)||req.headers['x-omega-preview']!=='1'||req.headers['content-type']!=='application/json'){
    fail(403);return true;
  }
  let n=0;const chunks=[];
  for await(const chunk of req){n+=chunk.length;if(n>MAX_BODY){fail(413);return true;}chunks.push(chunk)}
  let request;
  try{request=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail(400);return true;}
  const control=new AbortController();const abort=()=>control.abort();res.once('close',abort);
  try{
    const preview=await runner(request,{signal:control.signal});
    if(preview?.schema_version!=='omega.media.preview.v1'||preview.status!=='CPU_REFERENCE_PREVIEW_NO_VIDEO_RENDER'||preview.generated_video!==false||preview.rendered_image!==false||preview.persistent!==false)throw Error('MEDIA_RESPONSE_INVALID');
    const result=JSON.stringify(preview);
    if(Buffer.byteLength(result,'utf8')>1048576){fail(502);return true;}
    if(!res.destroyed){res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json; charset=utf-8');res.end(result)}
  }catch(error){
    if(error.message==='MEDIA_BUSY')fail(429);
    else if(error.message==='MEDIA_TIMEOUT')fail(504);
    else if(error.message==='MEDIA_REJECTED'||error.message==='INVALID_MEDIA_REQUEST_SIZE')fail(400);
    else fail(502);
  }finally{res.off('close',abort)}
  return true;
}
