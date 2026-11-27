/** Read-only audit view over the existing authenticated same-origin proxy. */
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const KINDS=new Set(['run_started','tool_allowed','tool_denied','tool_finished','tool_failed','run_finished','run_failed']);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys;
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export async function fetchAuditPage(request,fetchImpl=fetch,signal){
 if(!exact(request,'agent,limit,since,token')||typeof request.token!=='string'||request.token.length>4096||!/^[A-Za-z0-9_.-]+$/.test(request.token)||typeof request.agent!=='string'||!ID.test(request.agent)||!integer(request.since,0,Number.MAX_SAFE_INTEGER)||!integer(request.limit,1,200))throw Error('Invalid audit request');
 const {token,agent,since,limit}=request;
 const response=await fetchImpl('/api/audit/list',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({agent,since,limit}),credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.any([signal??new AbortController().signal,AbortSignal.timeout(12000)])});
 if(!response.ok||!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')||!response.body){await response.body?.cancel().catch(()=>{});throw Error('Audit unavailable')}
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576)throw Error('Audit response limit');chunks.push(value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(!exact(data,'entries,nextCursor')||!Array.isArray(data.entries)||data.entries.length>limit)throw Error('Invalid audit response');
 let previous=since,tenant=null;
 for(const row of data.entries){
  if(!exact(row,'agent,kind,node,runId,seq,tenant,timeMs')||row.agent!==agent||typeof row.tenant!=='string'||!ID.test(row.tenant)||(tenant!==null&&tenant!==row.tenant)||typeof row.runId!=='string'||!ID.test(row.runId)||!KINDS.has(row.kind)||!integer(row.seq,previous+1,Number.MAX_SAFE_INTEGER)||!integer(row.timeMs,0,8640000000000000)||(row.kind.startsWith('tool_')?(typeof row.node!=='string'||!ID.test(row.node)):row.node!==null))throw Error('Invalid audit record');
  previous=row.seq;tenant=row.tenant;
 }
 if(data.nextCursor!==previous)throw Error('Invalid audit cursor');return data;
}
export function mountOperations(root,{locale='pl'}={}){
 if(!root||typeof root.append!=='function'||!['pl','en'].includes(locale))throw Error('Invalid operations mount');
 const t=(pl,en)=>locale==='pl'?pl:en;
 const el=(tag,value,parent=root)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;parent.append(n);return n};
 let active=true,controller=null,cursor=0;
 el('h2',t('Operacje — audyt agentów','Operations — agent audit'));
 el('p',t('Odczyt chronionego dziennika. Wymaga działającego serwera audytu oraz tokenu OIDC. Brak zapisu tokenu, edycji zdarzeń i transmisji na żywo.','Read-only protected ledger. Requires running audit service and OIDC token. No token storage, event edits or live stream.'));
 const token=el('input',undefined,el('label','OIDC access token'));token.type='password';token.maxLength=4096;token.autocomplete='off';
 const agent=el('input',undefined,el('label',t('Identyfikator agenta','Agent ID')));agent.maxLength=128;agent.autocomplete='off';
 const first=el('button',t('Pobierz od początku','Read from start')),next=el('button',t('Kolejna strona','Next page'));first.type=next.type='button';next.disabled=true;
 const status=el('p','');status.setAttribute('role','status');const out=el('pre','');out.style.whiteSpace='pre-wrap';
 function reset(){controller?.abort();controller=null;cursor=0;out.textContent='';status.textContent='';first.disabled=false;next.disabled=true}
 token.oninput=agent.oninput=reset;
 async function load(since){
  if(!active||controller)return;const c=new AbortController();controller=c;first.disabled=next.disabled=true;out.textContent='';status.textContent=t('Pobieranie…','Loading…');
  try{const data=await fetchAuditPage({token:token.value,agent:agent.value,since,limit:50},fetch,c.signal);if(!active||controller!==c)return;cursor=data.nextCursor;out.textContent=JSON.stringify(data.entries,null,2);status.textContent=t('Liczba zdarzeń: ','Events: ')+data.entries.length;next.disabled=data.entries.length===0}
  catch{if(active&&controller===c&&!c.signal.aborted)status.textContent=t('Brak dostępu, niepoprawne dane lub niedostępny audyt.','Access denied, invalid data or audit unavailable.')}
  finally{if(controller===c){controller=null;first.disabled=false}}
 }
 first.onclick=()=>load(0);next.onclick=()=>load(cursor);
 return {dispose(){active=false;reset();token.value='';agent.value='';first.disabled=true}};
}
