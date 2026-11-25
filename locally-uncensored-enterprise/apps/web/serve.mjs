import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {handleLocalToolsHttp} from './devsuite-http.mjs';
import {handleStudioHttp} from './studio-http.mjs';
import {handleMediaPreviewHttp} from './media-preview-http.mjs';
import {handleModelsHttp} from './models-http.mjs';
import {handleModelEvalHttp} from './model-eval-http.mjs';
const files={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.mjs':'app.mjs','/modules/catalog.mjs':'modules/catalog.mjs','/modules/workspace.mjs':'modules/workspace.mjs','/modules/review-client.mjs':'modules/review-client.mjs','/modules/builder.mjs':'modules/builder.mjs','/modules/codespace-bundle.mjs':'modules/codespace-bundle.mjs','/modules/integration-browser.mjs':'modules/integration-browser.mjs','/modules/catalog-index.mjs':'modules/catalog-index.mjs','/modules/catalog-browser.mjs':'modules/catalog-browser.mjs','/modules/json-tools.mjs':'modules/json-tools.mjs','/modules/pricing.mjs':'modules/pricing.mjs','/modules/converter.mjs':'modules/converter.mjs','/modules/awesome-local-llm.md':'modules/awesome-local-llm.md','/modules/cloud-ui.mjs':'modules/cloud-ui.mjs','/modules/awesome-browser.mjs':'modules/awesome-browser.mjs','/modules/definitions.mjs':'modules/definitions.mjs','/modules/devsuite-browser.mjs':'modules/devsuite-browser.mjs','/modules/studio-browser.mjs':'modules/studio-browser.mjs','/modules/media-browser.mjs':'modules/media-browser.mjs','/modules/models-browser.mjs':'modules/models-browser.mjs','/modules/model-eval-browser.mjs':'modules/model-eval-browser.mjs'};
const port=Number(process.env.WEB_PORT??4173),reviewPort=Number(process.env.REVIEW_PORT??3001),cloudPort=Number(process.env.CLOUD_PORT??3002),auditPort=Number(process.env.AUDIT_PORT??3003);
if(![port,reviewPort,cloudPort,auditPort].every(p=>Number.isInteger(p)&&p>0&&p<=65535)||new Set([port,reviewPort,cloudPort,auditPort]).size!==4)throw Error('Invalid port configuration');
const reviewRoutes=new Set(['/api/reviews/get','/api/reviews/submit','/api/reviews/decide']);
const cloudRoutes=new Set(['/api/cloud/credential','/api/cloud/forget','/api/cloud/status','/api/cloud/approve','/api/cloud/stream']);
const auditRoutes=new Set(['/api/audit/list','/api/audit/stream']);
const server=createServer({requestTimeout:15000,headersTimeout:5000,maxHeaderSize:24576},async(req,res)=>{
 res.setHeader('x-content-type-options','nosniff');res.setHeader('cache-control','no-store');res.setHeader('referrer-policy','no-referrer');res.setHeader('x-frame-options','DENY');
 const fail=n=>{if(res.headersSent)res.destroy();else{res.statusCode=n;res.end('Request unavailable')}};
 try{
  if(req.method==='GET'&&Object.hasOwn(files,req.url)){
   const f=files[req.url];res.setHeader('content-type',f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.css')?'text/css; charset=utf-8':f.endsWith('.md')?'text/plain; charset=utf-8':'text/javascript; charset=utf-8');res.end(await readFile(new URL('dist/'+f,import.meta.url)));return;
  }
  if(await handleLocalToolsHttp(req,res,port))return;
  if(await handleStudioHttp(req,res,port))return;
  if(await handleMediaPreviewHttp(req,res,port))return;
  if(await handleModelsHttp(req,res,port))return;
  if(await handleModelEvalHttp(req,res,port))return;
  const cloud=cloudRoutes.has(req.url),review=reviewRoutes.has(req.url),audit=auditRoutes.has(req.url);
  if(req.method!=='POST'||(!cloud&&!review&&!audit))return fail(404);
  if(req.headers.origin!==`http://127.0.0.1:${port}`&&req.headers.origin!==`http://localhost:${port}`)return fail(403);
  if(!/^Bearer [A-Za-z0-9_.-]+$/.test(req.headers.authorization??'')||req.headers['content-type']!=='application/json')return fail(401);
  let n=0;const chunks=[];for await(const c of req){n+=c.length;if(n>(audit?4096:cloud?73728:16384))return fail(413);chunks.push(c)}
  const url=`http://127.0.0.1:${cloud?cloudPort:audit?auditPort:reviewPort}${req.url}`;
  const ctl=new AbortController();const abort=()=>ctl.abort();res.once('close',abort);
  try{
   const upstream=await fetch(url,{method:'POST',headers:{authorization:req.headers.authorization,'content-type':'application/json',origin:req.headers.origin},body:Buffer.concat(chunks),redirect:'error',signal:AbortSignal.any([ctl.signal,AbortSignal.timeout(cloud?90000:audit&&req.url==='/api/audit/stream'?65000:10000)])});
   if(!upstream.ok)return fail(upstream.status);
   if((cloud&&req.url==='/api/cloud/stream')||(audit&&req.url==='/api/audit/stream')){
    if(!upstream.headers.get('content-type')?.startsWith('text/event-stream'))return fail(502);
    res.statusCode=200;res.setHeader('content-type','text/event-stream; charset=utf-8');res.setHeader('x-accel-buffering','no');
    const reader=upstream.body.getReader();let size=0;
    try{while(!res.destroyed){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2097152){await reader.cancel();return fail(502)}if(!res.write(value))await new Promise((resolve,reject)=>{res.once('drain',resolve);res.once('close',()=>reject(Error('closed')))});}}finally{reader.releaseLock()}
    if(!res.destroyed)res.end();return;
   }
   const reader=upstream.body.getReader();let size=0;const out=[];
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576){await reader.cancel();return fail(502)}out.push(value)}}finally{reader.releaseLock()}
   res.statusCode=upstream.status;res.setHeader('content-type','application/json; charset=utf-8');res.end(Buffer.concat(out));
  }finally{res.off('close',abort)}
 }catch{fail(502)}
});
server.maxConnections=32;server.listen(port,'127.0.0.1');
