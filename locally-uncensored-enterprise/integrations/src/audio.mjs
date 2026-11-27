/** Offline RIFF/WAVE PCM16 editor. No codecs, network or model execution. */
export const MAX_AUDIO_BYTES=32*1024*1024;
const fail=()=>{throw Error('Invalid or unsupported PCM16 WAV')};
export function readWav(input){
 if(!(input instanceof Uint8Array)||input.byteLength<44||input.byteLength>MAX_AUDIO_BYTES)fail();
 const d=new DataView(input.buffer,input.byteOffset,input.byteLength),tag=i=>String.fromCharCode(...input.subarray(i,i+4));
 if(tag(0)!=='RIFF'||tag(8)!=='WAVE'||d.getUint32(4,true)!==input.length-8)fail();
 let fmt=null,data=null,chunks=0;
 for(let i=12;i<input.length;){if(++chunks>4096||i+8>input.length)fail();const name=tag(i),size=d.getUint32(i+4,true),p=i+8,end=p+size,next=end+(size&1);if(next>input.length)fail();
  if(name==='fmt '){if(fmt||data||!(size===16||size===18&&d.getUint16(p+16,true)===0)||d.getUint16(p,true)!==1)fail();const channels=d.getUint16(p+2,true),rate=d.getUint32(p+4,true),align=d.getUint16(p+12,true);if(![1,2].includes(channels)||rate<8000||rate>192000||align!==channels*2||d.getUint32(p+8,true)!==rate*align||d.getUint16(p+14,true)!==16)fail();fmt={channels,rate,align}}
  if(name==='data'){if(!fmt||data||!size||size%fmt.align)fail();data={offset:p,frames:size/fmt.align}}
  i=next;
 }
 if(!fmt||!data)fail();return {...fmt,...data,durationMs:Math.ceil(data.frames*1000/fmt.rate)};
}
export function editWav(input,options){
 const info=readWav(input);if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).sort().join(',')!=='endMs,gainDb,normalize,startMs')fail();const {startMs,endMs,gainDb,normalize}=options;
 if(!Number.isSafeInteger(startMs)||!Number.isSafeInteger(endMs)||startMs<0||endMs<=startMs||endMs>info.durationMs||!Number.isFinite(gainDb)||gainDb< -24||gainDb>24||typeof normalize!=='boolean')fail();
 const first=Math.floor(startMs*info.rate/1000),last=Math.min(info.frames,Math.floor(endMs*info.rate/1000)),frames=last-first;if(frames<1)fail();
 const source=new DataView(input.buffer,input.byteOffset,input.byteLength),length=frames*info.align,out=new Uint8Array(44+length),d=new DataView(out.buffer),tag=(i,s)=>{for(let n=0;n<s.length;n++)out[i+n]=s.charCodeAt(n)};
 const offset=info.offset+first*info.align;let peak=0;if(normalize)for(let i=0;i<length;i+=2)peak=Math.max(peak,Math.abs(source.getInt16(offset+i,true)));const factor=10**(gainDb/20)*(normalize&&peak?32767/peak:1);
 tag(0,'RIFF');d.setUint32(4,out.length-8,true);tag(8,'WAVEfmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,info.channels,true);d.setUint32(24,info.rate,true);d.setUint32(28,info.rate*info.align,true);d.setUint16(32,info.align,true);d.setUint16(34,16,true);tag(36,'data');d.setUint32(40,length,true);
 for(let i=0;i<length;i+=2)d.setInt16(44+i,Math.min(32767,Math.max(-32768,Math.round(source.getInt16(offset+i,true)*factor))),true);return out;
}
