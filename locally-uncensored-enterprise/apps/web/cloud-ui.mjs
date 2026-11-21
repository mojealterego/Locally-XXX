/** Local-only cloud control surface. Secrets and prompts never enter localStorage or URLs. */
export function mountCloudGateway(root,{locale='pl'}={}){
 if(!root||typeof root.append!=='function')throw Error('Invalid cloud UI root');
 const t=(pl,en)=>locale==='pl'?pl:en;
 const el=(tag,parent,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;parent.append(n);return n};
 const field=(label,type='text')=>{const l=el('label',root,label),x=el('input',l);x.type=type;x.autocomplete='off';x.maxLength=type==='password'?4096:256;return x};
 const button=(name,fn)=>{const x=el('button',root,name);x.type='button';x.onclick=fn;return x};
 let live=true;const controller=new AbortController();
 el('h2',root,t('Bramka Cloud — domyślnie wyłączona','Cloud gateway — disabled by default'));
 el('p',root,t('Dane są przesyłane na zewnętrzny serwer tylko po autoryzacji, zapisaniu klucza i potwierdzeniu konkretnego zapytania. Nie wprowadzaj danych poufnych.','External transmission requires authentication, a configured key and explicit consent for the exact prompt. Do not enter confidential data.'));
 const access=field('OIDC access token','password');const key=field(t('Klucz API dostawcy (tylko do zapisu)','Provider API key (save only)'),'password');
 const provider=el('select',root);provider.setAttribute('aria-label','Cloud provider');for(const name of ['openai','anthropic','openrouter','groq','together','deepseek','mistral']){const option=el('option',provider,name);option.value=name}
 const model=field(t('Identyfikator modelu','Model identifier'));
 const max=field(t('Maks. tokenów odpowiedzi','Max output tokens'),'number');max.value='256';max.min='1';max.max='2048';
 const prompt=el('textarea',root);prompt.maxLength=65536;prompt.setAttribute('aria-label',t('Wyłącznie publiczny prompt','Public prompt only'));prompt.className='editor';
 const classify=el('label',root,t('Potwierdzam, że treść jest publiczna i mogę udostępnić ją dostawcy','I confirm the prompt is public and may be shared with the provider'));const agree=el('input',classify);agree.type='checkbox';
 const state=el('p',root,'');state.setAttribute('role','status');const answer=el('pre',root,'');answer.setAttribute('aria-label','Cloud response');
 function status(text){if(live)state.textContent=text}
 async function post(path,body,{stream=false}={}){if(!live||!access.value.trim())throw Error('Authorization required');const response=await fetch('/api/cloud/'+path,{method:'POST',headers:{authorization:'Bearer '+access.value.trim(),'content-type':'application/json'},body:JSON.stringify(body),credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});if(!response.ok)throw Error('Request unavailable');if(stream)return response;const data=await response.json();if(!data||typeof data!=='object')throw Error('Invalid response');return data}
 button(t('Zapisz klucz w szyfrowanym magazynie','Store encrypted credential'),async()=>{try{if(!key.value)throw Error();await post('credential',{provider:provider.value,credential:key.value});status(t('Klucz zapisany na serwerze lokalnym','Credential stored locally'))}catch{status(t('Odmowa lub niedostępna usługa','Denied or unavailable'))}finally{key.value=''}});
 button(t('Sprawdź konfigurację','Check configuration'),async()=>{try{const r=await post('status',{provider:provider.value});status(JSON.stringify(r))}catch{status(t('Odmowa lub niedostępna usługa','Denied or unavailable'))}});
 button(t('Usuń klucz','Revoke credential'),async()=>{try{await post('forget',{provider:provider.value});status(t('Klucz usunięty','Credential removed'))}catch{status(t('Odmowa lub niedostępna usługa','Denied or unavailable'))}});
 button(t('Zatwierdź wysłanie i rozpocznij','Confirm cloud transmission and stream'),async()=>{
  try{if(!agree.checked||!prompt.value.trim()||!model.value.trim())throw Error();const request={provider:provider.value,model:model.value.trim(),messages:[{role:'user',content:prompt.value}],maxOutputTokens:Number(max.value),classification:'public'};
   if(!confirm(t('Ta treść opuści urządzenie i może podlegać opłatom API. Zatwierdzasz wysłanie?', 'This content leaves the device and may incur API charges. Authorize transmission?')))return;
   const grant=await post('approve',{request});answer.textContent='';const response=await post('stream',{ticket:grant.ticket,request},{stream:true});if(!response.body||!response.headers.get('content-type')?.includes('text/event-stream'))throw Error();const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',n=0,completed=false;
   try{while(live){const part=await reader.read();if(part.done)break;n+=part.value.byteLength;if(n>2097152)throw Error();buffer+=decoder.decode(part.value,{stream:true});if(buffer.length>65536)throw Error();let point;while((point=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,point);buffer=buffer.slice(point+2);if(frame.includes('event: error'))throw Error();if(frame.includes('event: done'))completed=true;if(frame.includes('event: token')){const data=frame.split('\n').find(x=>x.startsWith('data:'));const chunk=JSON.parse(data.slice(5));if(typeof chunk.text==='string')answer.textContent+=chunk.text}}}
   }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
   if(!completed)throw Error();status(t('Zakończono strumień','Stream finished'));
  }catch{status(t('Operacja odrzucona lub niedostępna','Operation denied or unavailable'))}
 });
 return {dispose(){live=false;controller.abort();access.value='';key.value='';prompt.value='';answer.textContent='';root.replaceChildren()}};
}
