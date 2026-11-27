/** Session-only text chat for an operator-configured local model. No cloud fallback. */
export function mountLocalChat(root,{locale='pl'}={}){
 if(!root||typeof root.append!=='function'||!['pl','en'].includes(locale))throw Error('Invalid chat mount');
 const t=(pl,en)=>locale==='pl'?pl:en;
 const el=(tag,value,parent=root)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;parent.append(n);return n};
 let alive=true,controller=null,messages=[];
 el('h2',t('Czat AI — lokalny','AI Chat — local'));
 el('p',t('Wymaga lokalnego serwera modelu (OMEGA_LOCAL_CHAT_ENDPOINT). Historia tylko w sesji tego widoku. Bez chmury, narzędzi i streamingu.','Requires a local model server (OMEGA_LOCAL_CHAT_ENDPOINT). History stays in this view session. No cloud, tools or streaming.'));
 const model=el('input',undefined,el('label',t('Model','Model')));model.maxLength=128;model.value='local';model.autocomplete='off';
 const history=el('div');history.setAttribute('aria-live','polite');
 const input=el('textarea',undefined,el('label',t('Wiadomość','Message')));input.maxLength=4096;input.rows=5;input.autocomplete='off';
 const send=el('button',t('Wyślij','Send')),cancel=el('button',t('Anuluj oczekiwanie','Cancel waiting')),reset=el('button',t('Nowa rozmowa','New conversation'));for(const b of [send,cancel,reset])b.type='button';
 const status=el('p','');status.setAttribute('role','status');
 function show(){history.replaceChildren();for(const m of messages){const section=el('section',undefined,history);el('strong',m.role==='user'?t('Ty','You'):'AI',section);const p=el('p',m.content,section);p.style.whiteSpace='pre-wrap'}}
 function busy(v){send.disabled=v;model.disabled=v;input.disabled=v;cancel.disabled=!v;reset.disabled=v}
 function clear(){messages=[];history.replaceChildren();input.value='';status.textContent=''}
 model.onchange=clear;reset.onclick=clear;
 cancel.onclick=()=>{controller?.abort();status.textContent=t('Przerwano oczekiwanie; model może nadal pracować.','Waiting cancelled; model may still be running.')};
 send.onclick=async()=>{
  if(!alive||controller)return;
  const prompt=input.value;if(!prompt.trim())return;
  if(!/^[A-Za-z0-9_.:/-]{1,128}$/.test(model.value)){status.textContent=t('Nieprawidłowa nazwa modelu.','Invalid model name.');return}
  const next=[...messages,{role:'user',content:prompt}];const encoder=new TextEncoder();while(next.length>15||next.reduce((n,m)=>n+encoder.encode(m.content).length,0)>65536)next.splice(0,2);
  const c=new AbortController();controller=c;busy(true);status.textContent=t('Oczekiwanie na lokalny model…','Waiting for local model…');
  try{
   const res=await fetch('/api/local/chat',{method:'POST',headers:{'content-type':'application/json','x-omega-chat':'1'},body:JSON.stringify({model:model.value,messages:next}),signal:AbortSignal.any([c.signal,AbortSignal.timeout(35000)]),credentials:'same-origin',redirect:'error',cache:'no-store'});
   if(res.status===503)throw Error('NOT_CONFIGURED');if(!res.ok)throw Error('CHAT_FAILED');const data=await res.json();if(typeof data.content!=='string'||!data.content.trim()||data.content.length>8192)throw Error('CHAT_FAILED');
   if(!alive||controller!==c||c.signal.aborted)return;
   messages=[...next,{role:'assistant',content:data.content}];show();input.value='';status.textContent=t('Odpowiedź lokalna.','Local response.');
  }catch(e){if(alive&&controller===c&&!c.signal.aborted)status.textContent=e.message==='NOT_CONFIGURED'?t('Skonfiguruj OMEGA_LOCAL_CHAT_ENDPOINT na serwerze.','Configure OMEGA_LOCAL_CHAT_ENDPOINT on the server.'):t('Model niedostępny lub operacja odrzucona.','Model unavailable or request rejected.')}
  finally{if(controller===c){controller=null;if(alive)busy(false)}}
 };
 busy(false);
 return {dispose(){alive=false;controller?.abort();messages=[];history.replaceChildren();input.value='';model.value='';busy(true);cancel.disabled=true}};
}
