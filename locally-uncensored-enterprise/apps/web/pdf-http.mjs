import {renderLocalPdf} from './pdf-runner.mjs';
import {validateReport} from '../../packages/awesome-printer-tools/html.mjs';
const allowedOrigin=(origin,port)=>origin===`http://127.0.0.1:${port}`||origin===`http://localhost:${port}`;
/** Loopback-only PDF report endpoint; never accepts file paths from HTTP clients. */
export async function handlePdfHttp(req,res,port,renderer=renderLocalPdf){
 if(req.url!=='/api/local/pdf/render')return false;
 const fail=code=>{if(res.headersSent){res.destroy();return}res.statusCode=code;res.setHeader('cache-control','no-store');res.end('Request unavailable')};
 if(req.method!=='POST'){fail(405);return true}
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!allowedOrigin(req.headers.origin,port)||req.headers['content-type']!=='application/json'||req.headers['x-omega-pdf']!=='1'){
  fail(403);return true;
 }
 let total=0;const buffers=[];
 for await(const chunk of req){total+=chunk.length;if(total>145000){fail(413);return true}buffers.push(chunk)}
 let report;
 try{report=validateReport(JSON.parse(Buffer.concat(buffers).toString('utf8')))}catch{fail(400);return true}
 const ctl=new AbortController(),abort=()=>ctl.abort();res.once('close',abort);
 try{
  const pdf=await renderer(report,{signal:ctl.signal});
  if(!Buffer.isBuffer(pdf)||pdf.length<8||pdf.length>4*1024*1024||pdf.subarray(0,5).toString('ascii')!=='%PDF-')throw Error('PDF_INVALID_OUTPUT');
  if(!res.destroyed){
    res.setHeader('cache-control','no-store');res.setHeader('content-type','application/pdf');
    res.setHeader('content-disposition','attachment; filename="omega-report.pdf"');
    res.setHeader('content-length',pdf.length);res.end(pdf);
  }
 }catch(e){if(!res.destroyed)fail(e.message==='PDF_BUSY'?429:e.message==='PDF_TIMEOUT'?504:502)}finally{res.off('close',abort)}
 return true;
}
