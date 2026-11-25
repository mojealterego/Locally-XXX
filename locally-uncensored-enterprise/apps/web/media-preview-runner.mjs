import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SCRIPT=fileURLToPath(new URL('../../../overlays/omega-integrations/media_bridge.py',import.meta.url));
const MAX_REQUEST=131072,MAX_OUTPUT=1048576,MAX_ACTIVE=2;
let active=0;

/** Fixed Python bridge, isolated startup, bounded output, hard deadline and concurrency cap. */
export async function runMediaPreview(request,{script=SCRIPT,python='python3',timeoutMs=10000,signal}={}){
  if(signal?.aborted)throw Error('MEDIA_CANCELLED');
  const bytes=Buffer.from(JSON.stringify(request),'utf8');
  if(bytes.length>MAX_REQUEST||bytes.length===0)throw Error('INVALID_MEDIA_REQUEST_SIZE');
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)throw Error('INVALID_MEDIA_DEADLINE');
  if(active>=MAX_ACTIVE)throw Error('MEDIA_BUSY');
  active++;
  try{
    const result=await new Promise((resolve,reject)=>{
      let closed=false,timedOut=false,size=0,output=[];
      const child=spawn(python,['-I',script],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH??'/usr/bin:/bin',LANG:'C.UTF-8',PYTHONIOENCODING:'utf-8',PYTHONNOUSERSITE:'1'}});
      const deadline=setTimeout(()=>{timedOut=true;child.kill('SIGKILL')},timeoutMs);
      const detach=()=>{clearTimeout(deadline);signal?.removeEventListener('abort',onAbort)};
      const fail=e=>{if(closed)return;closed=true;detach();child.kill('SIGKILL');reject(e)};
      const onAbort=()=>fail(Error('MEDIA_CANCELLED'));
      signal?.addEventListener('abort',onAbort,{once:true});
      if(signal?.aborted){onAbort();return;}
      child.once('error',()=>fail(Error('MEDIA_EXECUTION_FAILED')));
      child.stdout.on('data',part=>{size+=part.length;if(size>MAX_OUTPUT){fail(Error('MEDIA_RESPONSE_TOO_LARGE'));return;}output.push(part)});
      child.stderr.on('data',()=>{});
      child.stdin.on('error',()=>{});
      child.once('close',code=>{if(closed)return;closed=true;detach();
        if(timedOut)return reject(Error('MEDIA_TIMEOUT'));
        if(code!==0)return reject(Error('MEDIA_REJECTED'));
        try{const obj=JSON.parse(Buffer.concat(output).toString('utf8'));
          if(obj?.schema_version!=='omega.media.preview.v1'||obj.status!=='CPU_REFERENCE_PREVIEW_NO_VIDEO_RENDER'||obj.generated_video!==false||obj.rendered_image!==false||obj.persistent!==false)
            throw Error('Invalid bridge evidence');
          resolve(obj);
        }catch{reject(Error('MEDIA_RESPONSE_INVALID'))}
      });
      child.stdin.end(bytes);
    });
    return result;
  }finally{active--;}
}
