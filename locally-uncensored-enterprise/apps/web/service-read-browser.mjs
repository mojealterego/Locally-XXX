/** Read-only mining and telephone views; credentials remain in the current DOM session. */
function mount(root,{locale='pl',kind}={}){
 if(!root||typeof root.append!=='function'||!['pl','en'].includes(locale)||!['mining','phone'].includes(kind))throw Error('Invalid service view');
 const t=(pl,en)=>locale==='pl'?pl:en,el=(tag,value,parent=root)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;parent.append(n);return n};
 let active=true,controller=null;
 el('h2',kind==='mining'?t('Koparki — telemetria','Mining — telemetry'):t('Numery wirtualne — odczyt','Virtual numbers — read only'));
 el('p',t('Wymaga lokalnej konfiguracji operatora, tokenu OIDC i uprawnień PDP. Tylko odczyt; bez zakupów, SMS, połączeń i komend sterujących.','Requires local operator configuration, OIDC token and PDP permission. Read only; no purchases, SMS, calls or control commands.'));
 const token=el('input',undefined,el('label','OIDC access token'));token.type='password';token.maxLength=16384;token.autocomplete='off';
 const buttons=[],fields=[token],status=el('p','');status.setAttribute('role','status');const output=el('pre','');
 function reset(){controller?.abort();controller=null;status.textContent='';output.textContent='';for(const b of buttons)b.disabled=false}
 async function run(path,body){if(!active||controller)return;const c=new AbortController();controller=c;for(const b of buttons)b.disabled=true;output.textContent='';status.textContent=t('Pobieranie…','Loading…');try{if(!/^[A-Za-z0-9_.-]{1,16384}$/.test(token.value))throw Error('Invalid token');const response=await fetch(path,{method:'POST',headers:{authorization:'Bearer '+token.value,'content-type':'application/json','x-omega-service-read':'1'},body:JSON.stringify(body),signal:AbortSignal.any([c.signal,AbortSignal.timeout(15000)]),credentials:'omit',cache:'no-store',redirect:'error'});if(response.status===503)throw Error('NOT_CONFIGURED');if(!response.ok)throw Error('Denied');const data=await response.json();if(!active||controller!==c)return;output.textContent=JSON.stringify(data,null,2);status.textContent=t('Odczyt zakończony.','Read completed.')}catch(e){if(active&&controller===c&&!c.signal.aborted)status.textContent=e.message==='NOT_CONFIGURED'?t('Usługa nie jest skonfigurowana.','Service not configured.'):t('Odmowa dostępu lub niedostępna usługa.','Access denied or service unavailable.')}finally{if(controller===c){controller=null;for(const b of buttons)b.disabled=false}}}
 const button=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=fn;buttons.push(b)};
 if(kind==='mining'){const device=el('input',undefined,el('label',t('Identyfikator koparki','Rig ID')));device.maxLength=64;device.autocomplete='off';fields.push(device);button(t('Pobierz status','Read status'),()=>run('/api/local/mining/status',{device:device.value}))}
 else{button(t('Moje numery','Owned numbers'),()=>run('/api/local/phone/owned',{}));const country=el('input',undefined,el('label',t('Kod kraju','Country code')));country.maxLength=2;country.value='PL';country.autocomplete='off';const type=el('select',undefined,el('label',t('Typ numeru','Number type')));for(const v of ['Local','Mobile','TollFree']){const o=el('option',v,type);o.value=v}fields.push(country,type);button(t('Szukaj numerów','Search numbers'),()=>run('/api/local/phone/available',{country:country.value.toUpperCase(),type:type.value}))}
 for(const f of fields)f.oninput=f.onchange=reset;
 return {dispose(){active=false;reset();token.value='';for(const b of buttons)b.disabled=true}};
}
export function mountMiningRead(root,options={}){return mount(root,{...options,kind:'mining'})}
export function mountPhoneRead(root,options={}){return mount(root,{...options,kind:'phone'})}
