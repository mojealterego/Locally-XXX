/** Dedicated local P09/QFV CPU preview UI; never claims an actual image or video. */
export function mountMediaPreview(root,{locale='pl'}={}){
 if(!root||typeof root.append!=='function'||!['pl','en'].includes(locale))throw Error('Invalid media view');
 const tr=(pl,en)=>locale==='pl'?pl:en;
 let active=true,controller=null;
 const el=(tag,text,parent=root)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;parent.append(node);return node};
 el('h2',tr('P09/QFV — podgląd deformacji CPU','P09/QFV — CPU deformation preview'));
 el('p',tr('Przetwarzanie lokalne. Wynik zawiera wektory i plan elementu, a nie klatki, obraz ani gotowy film.','Local processing. Results contain vectors and element plan, not frames, images or completed video.'));
 const label=el('label',tr('Manifest wejściowy JSON','JSON input manifest'));
 const source=el('textarea',undefined,label);source.rows=10;source.maxLength=120000;source.style.width='100%';source.spellcheck=false;source.autocomplete='off';
 const run=el('button',tr('Oblicz podgląd CPU','Compute CPU preview'));run.type='button';
 const status=el('p','');status.setAttribute('role','status');
 const output=el('pre','');
 run.onclick=async()=>{
  controller?.abort();const ctl=new AbortController();controller=ctl;
  run.disabled=true;status.textContent=tr('Przetwarzanie…','Processing…');output.textContent='';
  try{
   const value=JSON.parse(source.value);
   const response=await fetch('/api/local/media/preview',{method:'POST',headers:{'content-type':'application/json','x-omega-preview':'1'},body:JSON.stringify(value),signal:AbortSignal.any([ctl.signal,AbortSignal.timeout(12000)]),credentials:'same-origin',cache:'no-store',redirect:'error'});
   if(!response.ok)throw Error('Preview failed');
   const result=await response.json();
   if(result.schema_version!=='omega.media.preview.v1'||result.status!=='CPU_REFERENCE_PREVIEW_NO_VIDEO_RENDER'||result.generated_video!==false||result.rendered_image!==false)throw Error('Invalid status');
   if(!active||controller!==ctl)return;
   output.textContent=JSON.stringify(result,null,2);status.textContent=tr('Zakończono podgląd referencyjny CPU','CPU reference preview completed');
  }catch{if(active&&controller===ctl&&!ctl.signal.aborted)status.textContent=tr('Odrzucono żądanie lub brak lokalnego środowiska Python','Request rejected or local Python unavailable')}
  finally{if(controller===ctl){controller=null;run.disabled=false;}}
 };
 return {dispose(){active=false;controller?.abort();source.value='';output.textContent='';run.disabled=true;}};
}
