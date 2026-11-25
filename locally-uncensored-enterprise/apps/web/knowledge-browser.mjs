/** Local knowledge reconciliation UI. Never authorizes external actions. */
export function mountKnowledgeReconciler(root,{locale='pl'}={}){
 if(!root||typeof root.append!=='function'||!['pl','en'].includes(locale))throw Error('Invalid knowledge mount');
 const tr=(pl,en)=>locale==='pl'?pl:en;
 const el=(tag,text,parent=root)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;parent.append(x);return x};
 let alive=true,controller=null;
 el('h2',tr('OTCM / ATM — weryfikacja pamięci','OTCM / ATM — Memory Reconciliation'));
 el('p',tr('Rekonstrukcja historii i wykrywanie sprzeczności. Brak zatwierdzania narzędzi, dowodów matematycznych i trwałego zapisu.','Temporal reconstruction and contradiction checks. No tool authorization, formal proofs or persistence.'));
 const label=el('label',tr('Zdarzenia i proponowana decyzja JSON','Events and proposed decision JSON'));
 const source=el('textarea',undefined,label);source.rows=12;source.maxLength=63000;source.style.width='100%';source.spellcheck=false;
 source.value=JSON.stringify({schema_version:'omega.knowledge.integration.v1',tenant_id:'demo_tenant',agent_id:'demo_agent',valid_at:20,known_at:25,
  events:[{claim:'safe-to-deploy',asserts_true:true,valid_from:10,valid_to:100,recorded_at:12,source:'a'},{claim:'safe-to-deploy',asserts_true:false,valid_from:10,valid_to:100,recorded_at:13,source:'b'}],
  action:{id:'deploy',sensitivity:'write',tool_name:'production_release',required_claims:['safe-to-deploy'],contract_id:'release-v1',source_sha256:'a'.repeat(64),utility:1}
 },null,2);
 const run=el('button',tr('Oceń sprzeczności','Evaluate contradictions'));run.type='button';const status=el('p','');status.setAttribute('role','status');const output=el('pre');
 run.onclick=async()=>{
  controller?.abort();const c=new AbortController();controller=c;run.disabled=true;status.textContent=tr('Analiza…','Analyzing…');output.textContent='';
  try{
   const data=JSON.parse(source.value);
   const res=await fetch('/api/local/knowledge/reconcile',{method:'POST',headers:{'content-type':'application/json','x-omega-knowledge':'1'},body:JSON.stringify(data),signal:AbortSignal.any([c.signal,AbortSignal.timeout(15000)]),cache:'no-store',credentials:'same-origin',redirect:'error'});
   if(!res.ok)throw Error('Reconciliation rejected');
   const result=await res.json();
   if(result.schema_version!=='omega.knowledge.reconciliation.v1'||result.action_executed!==false||result.memory_persisted!==false||result.proof_state!=='NO_CHECKED_PROOF'||result.share_state!=='PRIVATE_ONLY')throw Error('Untrusted result');
   if(!alive||controller!==c)return;
   status.textContent=tr('Rekonstrukcja zakończona. Nie wykonano żadnej akcji.','Reconciliation completed. No action executed.');
   output.textContent=JSON.stringify(result,null,2);
  }catch{if(alive&&controller===c&&!c.signal.aborted)status.textContent=tr('Nieprawidłowy manifest lub niedostępny silnik lokalny','Invalid manifest or unavailable local engine');}
  finally{if(controller===c){controller=null;run.disabled=false;}}
 };
 return {dispose(){alive=false;controller?.abort();source.value='';output.textContent='';run.disabled=true;}};
}
