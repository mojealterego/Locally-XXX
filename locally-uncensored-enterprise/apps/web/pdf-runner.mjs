/** Offline PDF renderer adapter for the existing deterministic ReportLab exporter. */
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const scriptDefault=fileURLToPath(new URL('../../packages/awesome-printer-tools/pdf_report.py',import.meta.url));
const MAX_INPUT=145000,MAX_PDF=4*1024*1024;
let active=0;
export async function renderLocalPdf(report,{script=scriptDefault,python='python3',signal,timeoutMs=15000}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>20000)throw Error('PDF_INVALID_DEADLINE');
 if(signal?.aborted)throw Error('PDF_CANCELLED');
 let json;
 try{json=JSON.stringify(report)}catch{throw Error('PDF_INVALID_REPORT')}
 if(!json||Buffer.byteLength(json,'utf8')>MAX_INPUT)throw Error('PDF_INVALID_REPORT');
 if(active>=2)throw Error('PDF_BUSY');active++;
 let dir;
 try{
  dir=await mkdtemp(join(tmpdir(),'omega-local-pdf-'));
  const input=join(dir,'input.json'),output=join(dir,'output.pdf');
  await writeFile(input,json,{mode:0o600,flag:'wx'});
  await new Promise((resolve,reject)=>{
   let finished=false,timedOut=false;
   const child=spawn(python,['-I',script,input,output],{
    shell:false,windowsHide:true,stdio:['ignore','ignore','ignore'],
    env:{PATH:process.env.PATH??'/usr/bin:/bin',LANG:'C.UTF-8',PYTHONNOUSERSITE:'1',PYTHONIOENCODING:'utf-8',OMEGA_PDF_FONT_PATH:process.env.OMEGA_PDF_FONT_PATH??''}
   });
   const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL')},timeoutMs);
   function settle(e){if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(e){child.kill('SIGKILL');reject(e)}else resolve()}
   const abort=()=>settle(Error('PDF_CANCELLED'));
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return}
   child.once('error',()=>settle(Error('PDF_RENDERER_UNAVAILABLE')));
   child.once('close',code=>settle(code===0?null:Error(timedOut?'PDF_TIMEOUT':'PDF_RENDER_FAILED')));
  });
  const metadata=await stat(output);
  if(!metadata.isFile()||metadata.size<8||metadata.size>MAX_PDF)throw Error('PDF_INVALID_OUTPUT');
  const buffer=await readFile(output);
  if(buffer.subarray(0,5).toString('ascii')!=='%PDF-' || !buffer.subarray(-2048).toString('latin1').includes('%%EOF'))throw Error('PDF_INVALID_OUTPUT');
  return buffer;
 }finally{if(dir)await rm(dir,{recursive:true,force:true});active--}
}
