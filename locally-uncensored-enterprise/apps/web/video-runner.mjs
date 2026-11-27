import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
export const MAX_VIDEO_BYTES=16*1024*1024;
const integer=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b;
export function validateVideoOptions(v){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='durationMs,height,mute,startMs'||!integer(v.startMs,0,120000)||!integer(v.durationMs,100,30000)||![240,360,480,720,1080].includes(v.height)||typeof v.mute!=='boolean')throw Error('VIDEO_INVALID');return {...v}}
const mp4=b=>Buffer.isBuffer(b)&&b.length>=16&&b.length<=MAX_VIDEO_BYTES&&b.toString('ascii',4,8)==='ftyp';
const inputArgs=['-protocol_whitelist','file,pipe','-f','mov','-enable_drefs','0','-use_absolute_path','0'];
async function command(bin,args,signal,timeout){
 if(signal?.aborted)throw Error('VIDEO_CANCELLED');
 return await new Promise((resolve,reject)=>{const child=spawn(bin,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH??'/usr/bin:/bin',LANG:'C.UTF-8'}});let size=0,parts=[],failure=null;const stop=reason=>{failure??=reason;child.kill('SIGKILL')};const abort=()=>stop('VIDEO_CANCELLED');const timer=setTimeout(()=>stop('VIDEO_TIMEOUT'),timeout);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();child.stdout.on('data',b=>{size+=b.length;if(size>131072)stop('VIDEO_INVALID');else parts.push(b)});child.stderr.resume();child.once('error',()=>{failure??='VIDEO_BACKEND_FAILED'});child.once('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(failure||code!==0)return reject(Error(failure??'VIDEO_BACKEND_FAILED'));resolve(Buffer.concat(parts).toString('utf8'))})});
}
async function probe(path,signal){const raw=await command('ffprobe',['-v','error','-max_alloc','67108864',...inputArgs,'-show_streams','-show_format','-of','json',path],signal,8000);let data;try{data=JSON.parse(raw)}catch{throw Error('VIDEO_INVALID')}
 const streams=data.streams,duration=Number(data.format?.duration);if(!Array.isArray(streams)||streams.length<1||streams.length>2||!Number.isFinite(duration)||duration<=0||duration>120.15)throw Error('VIDEO_INVALID');const videos=streams.filter(s=>s.codec_type==='video'),audios=streams.filter(s=>s.codec_type==='audio');if(videos.length!==1||audios.length>1||videos.length+audios.length!==streams.length)throw Error('VIDEO_INVALID');const v=videos[0],a=audios[0],match=/^(\d+)\/(\d+)$/.exec(v.avg_frame_rate??''),fps=match?Number(match[1])/Number(match[2]):NaN;
 if(v.codec_name!=='h264'||!integer(v.width,2,1920)||!integer(v.height,2,1920)||v.width*v.height>2073600||!Number.isFinite(fps)||fps<1||fps>60||v.disposition?.attached_pic||v.side_data_list?.some(s=>Number(s.rotation??0)!==0)||a&&(a.codec_name!=='aac'||!integer(a.channels,1,2)||!integer(Number(a.sample_rate),8000,96000)))throw Error('VIDEO_INVALID');return {width:v.width,height:v.height,duration,audio:Boolean(a)};
}
let active=false;
export async function editLocalVideo(bytes,options,{signal}={}){
 const v=validateVideoOptions(options);if(!mp4(bytes))throw Error('VIDEO_INVALID');if(signal?.aborted)throw Error('VIDEO_CANCELLED');if(active)throw Error('VIDEO_BUSY');active=true;let dir;
 try{dir=await mkdtemp(join(tmpdir(),'omega-video-'));const source=join(dir,'input.mp4'),out=join(dir,'output.mp4');await writeFile(source,bytes,{mode:0o600,flag:'wx'});const info=await probe(source,signal);if(v.startMs+v.durationMs>Math.floor(info.duration*1000))throw Error('VIDEO_RANGE');const ratio=Math.min(1,v.height/info.height,1920/info.width),width=2*Math.floor(info.width*ratio/2),height=2*Math.floor(info.height*ratio/2);if(width<2||height<2)throw Error('VIDEO_INVALID');const audio=info.audio&&!v.mute;
 await command('ffmpeg',['-nostdin','-v','error','-max_alloc','67108864','-threads','2',...inputArgs,'-noautorotate','-i',source,'-ss',(v.startMs/1000).toFixed(3),'-t',(v.durationMs/1000).toFixed(3),'-map','0:v:0',...(audio?['-map','0:a:0','-c:a','aac','-b:a','128k']:['-an']),'-sn','-dn','-map_metadata','-1','-map_chapters','-1','-filter_threads','1','-vf','scale='+width+':'+height,'-c:v','libx264','-threads','2','-preset','veryfast','-crf','24','-pix_fmt','yuv420p','-movflags','+faststart','-fs',String(MAX_VIDEO_BYTES),'-n',out],signal,45000);
 const st=await lstat(out);if(!st.isFile()||st.nlink!==1||st.size>MAX_VIDEO_BYTES||st.size<16)throw Error('VIDEO_OUTPUT_INVALID');const result=await probe(out,signal);if(result.width!==width||result.height!==height||result.audio!==audio||Math.abs(result.duration-v.durationMs/1000)>0.15)throw Error('VIDEO_OUTPUT_INVALID');const output=await readFile(out);if(output.length!==st.size||!mp4(output))throw Error('VIDEO_OUTPUT_INVALID');return output;
 }finally{try{if(dir)await rm(dir,{recursive:true,force:true})}finally{active=false}}
}
