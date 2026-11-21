import {validatePrompt} from './policy.mjs';
const endpoints=Object.freeze({openai:'https://api.openai.com/v1/chat/completions',anthropic:'https://api.anthropic.com/v1/messages',openrouter:'https://openrouter.ai/api/v1/chat/completions',groq:'https://api.groq.com/openai/v1/chat/completions',together:'https://api.together.xyz/v1/chat/completions',deepseek:'https://api.deepseek.com/chat/completions',mistral:'https://api.mistral.ai/v1/chat/completions'});
const deny=()=>{throw Error('Cloud provider unavailable')};
export function makeUpstreamRequest(req,credential){const q=validatePrompt(req);if(typeof credential!=='string'||credential.length<8||/[\r\n]/.test(credential))deny();const headers={'content-type':'application/json','accept':'text/event-stream'};
 let payload;if(q.provider==='anthropic'){
  headers['x-api-key']=credential;headers['anthropic-version']='2023-06-01';const system=q.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');const messages=q.messages.filter(m=>m.role!=='system');if(!messages.length||messages[0].role!=='user')deny();payload={model:q.model,messages,max_tokens:q.maxOutputTokens,stream:true};if(system)payload.system=system;
 }else {headers.authorization='Bearer '+credential;payload={model:q.model,messages:q.messages,stream:true};payload[q.provider==='openai'?'max_completion_tokens':'max_tokens']=q.maxOutputTokens}
 return {url:endpoints[q.provider],options:{method:'POST',headers,body:JSON.stringify(payload),redirect:'error'}};
}
export async function* parseUpstreamSse(stream,provider){if(!stream||typeof stream.getReader!=='function'||!Object.hasOwn(endpoints,provider))deny();const reader=stream.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let buffer='',bytes=0,events=0,chars=0,done=false;
 function processFrame(raw){if(++events>20000)deny();const data=raw.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!data)return null;if(data==='[DONE]')return {done:true};let parsed;try{parsed=JSON.parse(data)}catch{deny()}
  if(provider==='anthropic'){if(parsed.type==='error')deny();if(parsed.type==='message_stop')return {done:true};return {text:parsed.type==='content_block_delta'&&parsed.delta?.type==='text_delta'?parsed.delta.text:null}}
  if(parsed.error)deny();return {text:parsed.choices?.[0]?.delta?.content??null};
 }
 try{while(!done){const part=await reader.read();if(part.done){buffer+=decoder.decode();break}bytes+=part.value.byteLength;if(bytes>2097152)deny();buffer+=decoder.decode(part.value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');if(buffer.length>65536)deny();let point;while((point=buffer.indexOf('\n\n'))!==-1){const f=buffer.slice(0,point);buffer=buffer.slice(point+2);const result=processFrame(f);if(result?.done){done=true;break}if(result?.text!==undefined&&result?.text!==null){if(typeof result.text!=='string')deny();chars+=result.text.length;if(chars>131072)deny();yield result.text}}}if(!done)deny()}finally{try{await reader.cancel()}catch{}reader.releaseLock()}}
export async function* cloudStream(req,credential,{fetchImpl=fetch,signal}={}){
 const {url,options}=makeUpstreamRequest(req,credential);let r;try{r=await fetchImpl(url,{...options,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000)})}catch{deny()}
 if(!r?.ok||!r.body||r.headers.get('content-type')?.split(';')[0].trim()!=='text/event-stream')deny();yield* parseUpstreamSse(r.body,req.provider);
}
