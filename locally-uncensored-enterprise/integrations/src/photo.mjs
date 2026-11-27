import {sniffRaster} from './converter.mjs';
export const MAX_PIXELS=12000000,MAX_BYTES=16*1024*1024;
const fail=()=>{throw Error('Photo operation denied')};
const dimensions=(width,height)=>{if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>12000||height>12000||width*height>MAX_PIXELS)fail();return {width,height}};
export function rasterDimensions(header,type){
 const b=header instanceof Uint8Array?header:new Uint8Array(header);if(sniffRaster(b)!==type)fail();const d=new DataView(b.buffer,b.byteOffset,b.byteLength),text=(o,n)=>String.fromCharCode(...b.subarray(o,o+n));
 if(type==='image/png'){if(b.length<24||d.getUint32(8)!==13||text(12,4)!=='IHDR')fail();return dimensions(d.getUint32(16),d.getUint32(20))}
 if(type==='image/jpeg'){
  for(let i=2;i<b.length;){if(b[i++]!==255)fail();while(b[i]===255)i++;const mark=b[i++];if(mark===0||mark===0xda||mark===0xd9||i+2>b.length)fail();const size=d.getUint16(i);if(size<2||i+size>b.length)fail();if([0xc0,0xc1,0xc2].includes(mark)){if(size<8||b[i+2]!==8)fail();return dimensions(d.getUint16(i+5),d.getUint16(i+3))}i+=size}
  fail();
 }
 if(type==='image/webp'){
  if(b.length<25)fail();const chunk=text(12,4),size=d.getUint32(16,true),u24=i=>b[i]|b[i+1]<<8|b[i+2]<<16;
  if(chunk==='VP8X'&&size===10&&b.length>=30)return dimensions(1+u24(24),1+u24(27));
  if(chunk==='VP8L'&&size>=5&&b[20]===0x2f){const v=d.getUint32(21,true);return dimensions(1+(v&0x3fff),1+((v>>>14)&0x3fff))}
  if(chunk==='VP8 '&&size>=10&&b.length>=30&&b[23]===0x9d&&b[24]===1&&b[25]===0x2a)return dimensions(d.getUint16(26,true)&0x3fff,d.getUint16(28,true)&0x3fff);
 }
 fail();
}
export function validatePhotoSettings(v){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='contrast,exposure,monochrome,saturation,warmth'||typeof v.monochrome!=='boolean')fail();for(const [key,limit] of [['exposure',2],['contrast',1],['saturation',1],['warmth',1]])if(!Number.isFinite(v[key])||Math.abs(v[key])>limit)fail();return {...v}}
const linear=Array.from({length:256},(_,n)=>{const x=n/255;return x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4});
const gamma=x=>{x=Math.min(1,Math.max(0,x));return Math.round(255*(x<=0.0031308?12.92*x:1.055*x**(1/2.4)-0.055))};
export function adjustPixels(src,settings){const v=validatePhotoSettings(settings);if(!(src instanceof Uint8ClampedArray)||!src.length||src.length%4||src.length/4>MAX_PIXELS)fail();const out=new Uint8ClampedArray(src);if(!v.exposure&&!v.contrast&&!v.saturation&&!v.warmth&&!v.monochrome)return out;const exposure=2**v.exposure,contrast=2**v.contrast,sat=v.monochrome?0:1+v.saturation,warm=2**(v.warmth/2);const tone=x=>(x*exposure-0.18)*contrast+0.18;for(let i=0;i<src.length;i+=4){let r=tone(linear[src[i]]*warm),g=tone(linear[src[i+1]]),b=tone(linear[src[i+2]]/warm);const y=0.2126*r+0.7152*g+0.0722*b;out[i]=gamma(y+(r-y)*sat);out[i+1]=gamma(y+(g-y)*sat);out[i+2]=gamma(y+(b-y)*sat)}return out}
/** Browser decoding and encoding are local; output is a rendered sRGB raster, not a RAW/ICC-preserving master. */
export async function editPhoto(file,settings,target='image/png'){
 validatePhotoSettings(settings);if(!file||!Number.isSafeInteger(file.size)||file.size<12||file.size>MAX_BYTES||!['image/png','image/jpeg','image/webp'].includes(target))fail();const header=new Uint8Array(await file.slice(0,1048576).arrayBuffer()),type=sniffRaster(header);if(!type||(file.type&&file.type!==type))fail();rasterDimensions(header,type);
 const picture=await createImageBitmap(file,{imageOrientation:'from-image',colorSpaceConversion:'default'});let canvas;
 try{const {width,height}=dimensions(picture.width,picture.height);canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{alpha:true,colorSpace:'srgb'});if(!ctx)fail();ctx.drawImage(picture,0,0);const pixels=ctx.getImageData(0,0,width,height);pixels.data.set(adjustPixels(pixels.data,settings));ctx.putImageData(pixels,0,0);if(target==='image/jpeg'){ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height)}const blob=await new Promise((resolve,reject)=>canvas.toBlob(x=>x&&x.type===target&&x.size<=MAX_BYTES*4?resolve(x):reject(Error('Encoder denied')),target,0.94));return {blob,width,height}}
 finally{picture.close();if(canvas){canvas.width=1;canvas.height=1}}
}
