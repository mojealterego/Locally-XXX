const fail=()=>{throw Error('Unsupported or unsafe local image conversion')};
const formats={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
export function sniffRaster(header){
 const b=new Uint8Array(header);
 if(b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return 'image/jpeg';
 if(b.length>=8&&[137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x))return 'image/png';
 if(b.length>=12&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP')return 'image/webp';
 return null;
}
/** Strictly local canvas conversion; no PDF, SVG or HEIC unless separate audited decoders are installed. */
export async function convertRaster(file,target,{decode=globalThis.createImageBitmap,canvasFactory=()=>document.createElement('canvas'),maxBytes=25*1024*1024,maxPixels=24000000}={}){
 if(!file||typeof file.size!=='number'||file.size<12||file.size>maxBytes||!Object.hasOwn(formats,target)||typeof decode!=='function')fail();
 const type=sniffRaster(await file.slice(0,16).arrayBuffer());
 if(!type||file.type&&file.type!==type)fail();
 const picture=await decode(file);
 try{
  if(!Number.isSafeInteger(picture.width)||!Number.isSafeInteger(picture.height)||picture.width<1||picture.height<1||picture.width*picture.height>maxPixels)fail();
  const canvas=canvasFactory();canvas.width=picture.width;canvas.height=picture.height;
  const ctx=canvas.getContext('2d',{alpha:target!=='image/jpeg'});if(!ctx)fail();
  if(target==='image/jpeg'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height)}
  ctx.drawImage(picture,0,0);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(x=>x&&x.type===target?resolve(x):reject(Error('Canvas encoder unavailable')),target,0.92));
  if(blob.size>maxBytes*2)fail();
  return {blob,extension:formats[target],width:picture.width,height:picture.height};
 }finally{picture.close?.()}
}
