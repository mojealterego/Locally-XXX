/** Local dataset preparation UI; model training is not started here. */
export function mountTrainingData(root,{locale='pl'}={}){
 if(!root||typeof root.append!=='function'||!['pl','en'].includes(locale))throw Error('Invalid training mount');
 const t=(pl,en)=>locale==='pl'?pl:en;
 const el=(tag,value,parent=root)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;parent.append(n);return n};
 let active=true,controller=null,result=null;
 el('h2',t('Trening LLM — przygotowanie danych','LLM Training — dataset preparation'));
 el('p',t('Lokalna walidacja JSONL, deduplikacja i deterministyczny podział train/eval. Pola: instruction, output, source, license oraz opcjonalne input. Pochodzenie i licencje są deklarowane przez operatora. Nie uruchamia treningu.','Local JSONL validation, deduplication and deterministic train/eval split. Fields: instruction, output, source, license and optional input. Provenance and licenses are operator-declared. Does not start training.'));
 const input=el('textarea',undefined,el('label','JSONL'));input.rows=12;input.maxLength=1048576;input.spellcheck=false;input.autocomplete='off';
 const file=el('input',undefined,el('label',t('Wczytaj JSONL','Load JSONL')));file.type='file';file.accept='.jsonl,.txt';
 const percent=el('input',undefined,el('label',t('Zbiór ewaluacyjny (%)','Evaluation split (%)')));percent.type='number';percent.min='5';percent.max='40';percent.step='1';percent.value='20';
 const run=el('button',t('Przygotuj zbiory','Prepare datasets'));run.type='button';
 const status=el('p','');status.setAttribute('role','status');const summary=el('pre','');
 const downloads=[['train.jsonl','trainText'],['eval.jsonl','evalText'],['manifest.json','manifest']].map(([name,key])=>{const b=el('button',t('Pobierz ','Download ')+name);b.type='button';b.disabled=true;b.onclick=()=>{if(!result||!active)return;const data=key==='manifest'?JSON.stringify(result[key],null,2)+'\n':result[key];const url=URL.createObjectURL(new Blob([data],{type:'application/octet-stream'}));try{const a=el('a',undefined,root);a.href=url;a.download=name;a.click();a.remove()}finally{setTimeout(()=>URL.revokeObjectURL(url),1000)}};return b});
 function invalidate(){controller?.abort();controller=null;result=null;summary.textContent='';status.textContent='';run.disabled=false;for(const b of downloads)b.disabled=true}
 let fileRevision=0;
 input.oninput=percent.oninput=()=>{fileRevision++;invalidate()};
 file.onchange=async()=>{invalidate();const f=file.files[0],rev=++fileRevision;file.value='';if(!f)return;if(f.size>1048576){status.textContent=t('Plik zbyt duży.','File too large.');return}try{const value=await f.text();if(!active||rev!==fileRevision)return;invalidate();input.value=value}catch{if(active&&rev===fileRevision)status.textContent=t('Odczyt odrzucony.','Read rejected.')}};
 run.onclick=async()=>{
  if(!active||controller)return;fileRevision++;invalidate();const c=new AbortController();controller=c;run.disabled=true;status.textContent=t('Przetwarzanie lokalne…','Local processing…');
  try{
   const body=JSON.stringify({jsonl:input.value,evalPercent:Number(percent.value)});if(new TextEncoder().encode(body).length>1048576)throw Error('Dataset too large');
   const res=await fetch('/api/local/training/prepare',{method:'POST',headers:{'content-type':'application/json','x-omega-training':'1'},body,signal:AbortSignal.any([c.signal,AbortSignal.timeout(15000)]),credentials:'same-origin',redirect:'error',cache:'no-store'});
   if(!res.ok)throw Error('Dataset rejected');const value=await res.json();if(value?.manifest?.format!=='omega-sft-v1'||typeof value.trainText!=='string'||typeof value.evalText!=='string')throw Error('Invalid result');
   if(!active||controller!==c)return;result=value;summary.textContent=JSON.stringify(value.manifest,null,2);for(const b of downloads)b.disabled=false;status.textContent=t('Zbiory gotowe do zapisania. Trening nie został uruchomiony.','Datasets ready to save. Training has not started.');
  }catch{if(active&&controller===c&&!c.signal.aborted)status.textContent=t('Niepoprawny zbiór, zbyt mało danych do podziału lub przekroczony limit.','Invalid dataset, insufficient split or limit exceeded.')}
  finally{if(controller===c){controller=null;run.disabled=false}}
 };
 return {dispose(){active=false;fileRevision++;invalidate();input.value='';run.disabled=true}};
}
