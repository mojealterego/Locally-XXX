/** Local benchmark UI; results are real model responses, never modelled quality. */
export function mountModelEvaluation(root,{locale='pl'}={}){
 if(!root||typeof root.append!=='function'||!['pl','en'].includes(locale))throw Error('Invalid model evaluation UI');
 const tr=(pl,en)=>locale==='pl'?pl:en;
 const el=(tag,text,parent=root)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;parent.append(x);return x};
 let active=true,controller=null;
 el('h2',tr('Ewaluacja PL/EN modeli lokalnych','PL/EN Local Model Evaluation'));
 el('p',tr('Testy rzeczywistego lokalnego serwera modelu. Ocena dotyczy wyłącznie jawnie podanych przykładów i wymaga OMEGA_MODEL_EVAL_ENDPOINT.','Tests against a real local model server. Scores apply only to supplied examples and require OMEGA_MODEL_EVAL_ENDPOINT.'));
 const label=el('label',tr('Przykłady w formacie JSON','JSON evaluation examples'));
 const input=el('textarea',undefined,label);input.rows=12;input.maxLength=130000;input.spellcheck=false;input.style.width='100%';
 input.value=JSON.stringify({schema_version:'omega.model.eval.v1',model:'local',cases:[
  {id:'pl-01',language:'pl',prompt:'Ile to jest 2 + 2? Odpowiedz tylko cyfrą.',expected:['4']},
  {id:'en-01',language:'en',prompt:'What is two plus two? Reply using one digit.',expected:['4']}
 ]},null,2);
 const button=el('button',tr('Uruchom lokalną ewaluację','Evaluate local model'));button.type='button';
 const status=el('p','');status.setAttribute('role','status');const output=el('pre','');
 button.onclick=async()=>{
  controller?.abort();const c=new AbortController();controller=c;button.disabled=true;status.textContent=tr('Ewaluacja trwa…','Evaluation running…');output.textContent='';
  try{
   const request=JSON.parse(input.value);
   const res=await fetch('/api/local/models/evaluate',{method:'POST',headers:{'content-type':'application/json','x-omega-models':'1'},body:JSON.stringify(request),cache:'no-store',redirect:'error',credentials:'same-origin',signal:AbortSignal.any([c.signal,AbortSignal.timeout(150000)])});
   if(res.status===503)throw Error('NOT_CONFIGURED');
   if(!res.ok)throw Error('EVALUATION_FAILED');
   const result=await res.json();
   if(result.schema_version!=='omega.model.eval.result.v1'||result.execution!=='REAL_LOOPBACK_RESPONSES'||!result.summary)throw Error('INVALID_EVALUATION_RESULT');
   if(!active||controller!==c)return;
   status.textContent=tr('Zakończono ocenę na lokalnym serwerze. Wynik nie oznacza ogólnej jakości modelu.','Local evaluation completed. Score is not a general model quality rating.');
   output.textContent=JSON.stringify(result,null,2);
  }catch(e){if(active&&controller===c&&!c.signal.aborted)status.textContent=e.message==='NOT_CONFIGURED'?tr('Skonfiguruj OMEGA_MODEL_EVAL_ENDPOINT w serwerze lokalnym.','Configure OMEGA_MODEL_EVAL_ENDPOINT in local server.'):tr('Ewaluacja odrzucona lub model niedostępny.','Evaluation rejected or model unavailable.');}
  finally{if(controller===c){controller=null;button.disabled=false;}}
 };
 return {dispose(){active=false;controller?.abort();input.value='';output.textContent='';button.disabled=true;}};
}
