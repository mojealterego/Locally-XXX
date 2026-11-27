import {MAX_VIDEO_BYTES,validateVideoOptions,editLocalVideo} from './video-runner.mjs';
export async function handleVideoHttp(req,res,port,runner=editLocalVideo){
 if(req.url!=='/api/local/video/edit')return false;
 const fail=n=>{if(res.destroyed)return;if(res.headersSent){res.destroy();return}res.statusCode=n;res.setHeader('cache-control','no-store');res.end('Request unavailable')};
 if(req.method!=='POST'){fail(405);return true}
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)||req.headers['content-type']!=='video/mp4'||req.headers['x-omega-video']!=='1'){fail(403);return true}
 const int=v=>typeof v==='string'&&/^\d{1,6}$/.test(v)?Number(v):NaN;let options;try{if(!['0','1'].includes(req.headers['x-omega-mute']))throw Error();options=validateVideoOptions({startMs:int(req.headers['x-omega-start-ms']),durationMs:int(req.headers['x-omega-duration-ms']),height:int(req.headers['x-omega-height']),mute:req.headers['x-omega-mute']==='1'})}catch{fail(400);return true}
 let size=0;const parts=[];for await(const b of req){size+=b.length;if(size>MAX_VIDEO_BYTES){fail(413);return true}parts.push(b)}
 const ctl=new AbortController(),abort=()=>ctl.abort();res.once('close',abort);
 try{const output=await runner(Buffer.concat(parts),options,{signal:ctl.signal});if(!Buffer.isBuffer(output)||!output.length||output.length>MAX_VIDEO_BYTES)throw Error('VIDEO_OUTPUT_INVALID');if(!res.destroyed){res.setHeader('cache-control','no-store');res.setHeader('content-type','video/mp4');res.setHeader('x-content-type-options','nosniff');res.end(output)}}catch(e){fail(e.message==='VIDEO_BUSY'?429:e.message==='VIDEO_TIMEOUT'?504:['VIDEO_INVALID','VIDEO_RANGE'].includes(e.message)?400:502)}finally{res.off('close',abort)}return true;
}
