import {runAndroidProbe,validateMobileStatus} from './mobile-runner.mjs';
export async function handleMobileHttp(req,res,port,{enabled=()=>process.env.OMEGA_ANDROID_PROBE==='YES',runner=runAndroidProbe}={}){
 if(req.url!=='/api/local/mobile/status')return false;
 const fail=n=>{if(res.destroyed)return;if(res.headersSent){res.destroy();return}res.statusCode=n;res.setHeader('cache-control','no-store');res.end('Request unavailable')};
 if(req.method!=='POST'){fail(405);return true}
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)||req.headers['content-type']!=='application/json'||req.headers['x-omega-mobile']!=='1'){fail(403);return true}
 if(!enabled()){fail(503);return true}
 let n=0;const parts=[];for await(const b of req){n+=b.length;if(n>512){fail(413);return true}parts.push(b)}
 try{const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).join(',')!=='approved'||v.approved!==true)throw Error()}catch{fail(400);return true}
 const ctl=new AbortController(),abort=()=>ctl.abort();res.once('close',abort);
 try{const status=validateMobileStatus(await runner({signal:ctl.signal}));if(!res.destroyed){res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify({schema:'omega.mobile.host-status.v1',scope:'SERVER_HOST',...status,thermal_verified:false,battery_verified:false,heavy_work_admitted:false}))}}catch(e){fail(e.message==='MOBILE_BUSY'?429:e.message==='MOBILE_TIMEOUT'?504:503)}finally{res.off('close',abort)}return true;
}
