/** Local authoring shell for the existing Aether Studio / P10 integration bridge. */
export function mountStudioPlanner(root,{locale='pl'}={}){
  if(!root||typeof root.append!=='function'||!['pl','en'].includes(locale))throw Error('Invalid studio mount');
  const tr=(pl,en)=>locale==='pl'?pl:en;
  let controller=null,alive=true;
  function el(tag,text,parent=root){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;parent.append(n);return n;}
  el('h2',tr('Aether Studio — plan produkcji','Aether Studio — production plan'));
  el('p',tr('Połączenie z istniejącym P10 Cinema. Generowany dokument jest planem, nie wyrenderowanym filmem ani grą.','Connected to existing P10 Cinema. Output is a plan, not a rendered movie or game.'));
  const label=el('label',tr('Projekt w formacie JSON','Project JSON'));
  const source=el('textarea',undefined,label);source.rows=12;source.maxLength=250000;source.spellcheck=false;source.autocomplete='off';source.style.width='100%';source.setAttribute('aria-label',tr('Dane projektu','Project data'));
  const run=el('button',tr('Waliduj i utwórz plan','Validate and create plan'));run.type='button';
  const status=el('p','');status.setAttribute('role','status');
  const output=el('pre','');
  const copy=el('button',tr('Kopiuj plan','Copy plan'));copy.type='button';copy.disabled=true;
  let last='';
  run.onclick=async()=>{
    controller?.abort();const ctl=new AbortController();controller=ctl;
    run.disabled=true;copy.disabled=true;last='';output.textContent='';status.textContent=tr('Sprawdzanie…','Checking…');
    try{
      const request=JSON.parse(source.value);
      const response=await fetch('/api/local/studio/plan',{method:'POST',headers:{'content-type':'application/json','x-omega-plan':'1'},body:JSON.stringify(request),signal:AbortSignal.any([ctl.signal,AbortSignal.timeout(15000)]),credentials:'same-origin',cache:'no-store',redirect:'error'});
      if(!response.ok)throw Error('Plan not accepted');
      const plan=await response.json();
      if(!plan||plan.status!=='PLAN_ONLY_NOT_BUILT'||plan.engine_adapter!=='NOT_CONNECTED')throw Error('Unexpected production status');
      if(!alive||controller!==ctl)return;
      last=JSON.stringify(plan,null,2);status.textContent=tr('Plan zweryfikowany strukturalnie; build i render nieuruchomione.','Plan structurally validated; build and render not run.');output.textContent=last;copy.disabled=false;
    }catch{if(alive&&controller===ctl&&!ctl.signal.aborted)status.textContent=tr('Nieprawidłowy plan lub niedostępny lokalny runtime','Invalid plan or unavailable local runtime');}
    finally{if(controller===ctl){controller=null;run.disabled=false;}}
  };
  copy.onclick=()=>{if(last&&navigator.clipboard?.writeText)void navigator.clipboard.writeText(last).catch(()=>{status.textContent=tr('Kopiowanie niedostępne','Clipboard unavailable')})};
  return {dispose(){alive=false;controller?.abort();source.value='';output.textContent='';last='';copy.disabled=true;run.disabled=true;}};
}
