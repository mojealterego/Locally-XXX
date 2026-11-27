/** Bounded local chat using the existing OpenAI-compatible evaluation transport guards. */
import {validateEndpoint,readBounded} from './model-eval.mjs';
export function validateChatRequest(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.getPrototypeOf(raw)!==Object.prototype||Object.keys(raw).sort().join(',')!=='messages,model'||typeof raw.model!=='string'||!/^[A-Za-z0-9_.:/-]{1,128}$/.test(raw.model)||!Array.isArray(raw.messages)||raw.messages.length<1||raw.messages.length>15||raw.messages.length%2!==1)throw Error('INVALID_CHAT_REQUEST');
 let size=0;
 const messages=raw.messages.map((m,i)=>{
  if(!m||typeof m!=='object'||Array.isArray(m)||Object.getPrototypeOf(m)!==Object.prototype||Object.keys(m).sort().join(',')!=='content,role'||m.role!==(i%2?'assistant':'user')||typeof m.content!=='string'||!m.content.trim()||m.content.length>8192||m.content.includes('\u0000'))throw Error('INVALID_CHAT_MESSAGE');
  size+=Buffer.byteLength(m.content,'utf8');if(size>65536)throw Error('CHAT_CONTEXT_LIMIT');
  return {role:m.role,content:m.content};
 });
 return {model:raw.model,messages};
}
export async function requestLocalChat(raw,{endpoint,signal,timeoutMs=30000,fetchFn=fetch}={}){
 const request=validateChatRequest(raw),url=validateEndpoint(endpoint);
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>60000||typeof fetchFn!=='function')throw Error('INVALID_CHAT_CONFIG');
 const res=await fetchFn(url,{method:'POST',headers:{'content-type':'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.any([signal??new AbortController().signal,AbortSignal.timeout(timeoutMs)]),body:JSON.stringify({...request,stream:false,max_tokens:1024})});
 if(res.status!==200){await res.body?.cancel().catch(()=>{});throw Error('MODEL_HTTP_ERROR')}
 const content=await readBounded(res);
 if(!content.trim()||content.includes('\u0000'))throw Error('INVALID_MODEL_RESPONSE');
 return content;
}
