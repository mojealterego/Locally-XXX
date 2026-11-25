/** Purely advisory offline compute policy UI. Not an inferencer or cloud client. */
export function mountComputePolicy(root,{locale='pl'}={}){
 if(!root||typeof root.append!=='function'||!['pl','en'].includes(locale))throw Error('Invalid compute view');
 const t=(pl,en)=>locale==='pl'?pl:en;
 const el=(tag,value,parent=root)=>{const x=document.createElement(tag);if(value!==undefined)x.textContent=value;parent.append(x);return x;};
 let alive=true,abort=null;
 el('h2',t('OMEGA — dopuszczenie inferencji offline','OMEGA — Offline Inference Admission'));
 el('p',t('Decyzja planistyczna na podstawie deklarowanych parametrów sprzętu i runtime. Brak autentykacji telemetrii, uruchamiania modeli lub transferu danych.','Advisory plan from declared device and runtime metadata. No authenticated telemetry, model launch or network transfer.'));
 const l=el('label',t('Kontrakt JSON','JSON contract'));
 const input=el('textarea',undefined,l);input.rows=12;input.maxLength=63000;input.style.width='100%';input.spellcheck=false;
 input.value=JSON.stringify({schema_version:'omega.compute.offline.v1',tenant_id:'local_demo',model_ref:'qwen3-local',model_format:'GGUF',data_class:'PRIVATE',capabilities:['chat'],estimated_peak_mib:1024,reserve_mib:256,
  device:{total_native_budget_mib:12288,reserved_native_mib:4096,thermal_headroom:0.35,battery_percent:90,charging:true,unmetered:true,network_available:false,foreground:true},
  runtimes:[{runtime_id:'llama_local',engine:'llama.cpp',deployment:'ON_DEVICE',model_ref:'qwen3-local',model_format:'GGUF',capabilities:['chat'],memory_headroom_mib:4096,healthy:true,version_pinned:true}]},null,2);
 const run=el('button',t('Sprawdź plan offline','Check offline plan'));run.type='button';const status=el('p','');status.setAttribute('role','status');const output=el('pre');
 run.onclick=async()=>{
  abort?.abort();const c=new AbortController();abort=c;run.disabled=true;status.textContent=t('Weryfikacja…','Checking…');output.textContent='';
  try{
   const data=JSON.parse(input.value);
   const res=await fetch('/api/local/compute/plan',{method:'POST',headers:{'content-type':'application/json','x-omega-compute':'1'},body:JSON.stringify(data),signal:AbortSignal.any([c.signal,AbortSignal.timeout(12000)]),redirect:'error',cache:'no-store',credentials:'same-origin'});
   if(!res.ok)throw Error('Denied');
   const out=await res.json();
   if(out.schema_version!=='omega.compute.offline.result.v1'||out.execution_mode!=='OFFLINE'||out.runtime_executed!==false||out.cloud_egress!==false)throw Error('Invalid plan');
   if(!alive||abort!==c)return;
   output.textContent=JSON.stringify(out,null,2);
   status.textContent=t('Zwrócono plan. Nie uruchomiono modelu.','Plan received. No model executed.');
  }catch{if(alive&&abort===c&&!c.signal.aborted)status.textContent=t('Żądanie odrzucone lub polityka niedostępna','Request rejected or policy unavailable')}
  finally{if(abort===c){abort=null;run.disabled=false;}}
 };
 return {dispose(){alive=false;abort?.abort();input.value='';output.textContent='';run.disabled=true;}};
}
