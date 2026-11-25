/** Inspect local GGUF headers; does not download or execute models. */
export function mountModelInventory(root,{locale='pl'}={}){
  if(!root||typeof root.append!=='function'||!['pl','en'].includes(locale))throw Error('Invalid model manager mount');
  const tr=(pl,en)=>locale==='pl'?pl:en;
  let active=true,controller=null;
  const el=(tag,text,parent=root)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;parent.append(x);return x;};
  el('h2',tr('Katalog modeli GGUF','GGUF Model Catalog'));
  el('p',tr('Odczyt lokalnych nagłówków i szacunki pamięci. Bez uruchamiania inferencji. Katalog źródłowy jest ustawiany przez OMEGA_MODEL_DIR.','Local header inspection and memory estimates. No inference. Set source directory with OMEGA_MODEL_DIR.'));
  const run=el('button',tr('Skanuj lokalny katalog','Scan local directory'));run.type='button';
  const status=el('p','');status.setAttribute('role','status');
  const results=el('div');
  run.onclick=async()=>{
    controller?.abort();const ctl=new AbortController();controller=ctl;run.disabled=true;results.replaceChildren();
    status.textContent=tr('Skanowanie…','Scanning…');
    try{
      const response=await fetch('/api/local/models/inventory',{method:'POST',headers:{'content-type':'application/json','x-omega-models':'1'},body:'{}',signal:AbortSignal.any([ctl.signal,AbortSignal.timeout(20000)]),credentials:'same-origin',cache:'no-store',redirect:'error'});
      if(response.status===503)throw Error('NOT_CONFIGURED');
      if(!response.ok)throw Error('SCAN_FAILED');
      const data=await response.json();
      if(data.schema_version!=='omega.model.inventory.v1'||data.state!=='GGUF_HEADERS_ONLY_NOT_INFERENCE'||!Array.isArray(data.models)||!Array.isArray(data.rejected))throw Error('INVALID_CATALOG');
      if(!active||controller!==ctl)return;
      status.textContent=tr('Odczytano plików: ','Files inspected: ')+data.file_count+'. '+tr('Inferencja nie została uruchomiona.','No inference executed.');
      const list=el('ul',undefined,results);
      for(const item of data.models.slice(0,3000)){
        const size=Number.isSafeInteger(item.bytes)&&item.bytes>=0?(item.bytes/(1024*1024)).toFixed(1)+' MiB':'?';
        el('li',String(item.path??item.name??'GGUF')+' — '+size,list);
      }
      if(data.rejected.length)el('p',tr('Odrzucone wpisy: ','Rejected entries: ')+data.rejected.length,results);
    }catch(e){
      if(active&&controller===ctl&&!ctl.signal.aborted)status.textContent=e.message==='NOT_CONFIGURED'?tr('Ustaw OMEGA_MODEL_DIR w środowisku lokalnego serwera.','Set OMEGA_MODEL_DIR in the local server environment.'):tr('Odczyt odrzucony lub katalog niedostępny.','Scan rejected or directory unavailable.');
    }finally{if(controller===ctl){controller=null;run.disabled=false;}}
  };
  return {dispose(){active=false;controller?.abort();results.replaceChildren();run.disabled=true;}};
}
