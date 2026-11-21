import {createHash,randomBytes} from 'node:crypto';
const deny=()=>{throw Error('Cloud access denied')};
const providers=Object.freeze(['openai','anthropic','openrouter','groq','together','deepseek','mistral']);
const PROVIDER=new Set(providers);
const TENANT=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SUBJECT=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MODEL=/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const DLP=/(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk-proj-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|authorization\s*:\s*bearer\s+[A-Za-z0-9._-]{12,}|(?:password|secret|api[_-]?key)\s*[=:]\s*\S{6,})/i;
export const providerNames=()=>[...providers];
export function validProvider(provider){if(!PROVIDER.has(provider))deny();return provider}
export function validatePrompt(q){
 if(!q||typeof q!=='object'||Array.isArray(q)||Object.keys(q).sort().join(',')!=='classification,maxOutputTokens,messages,model,provider')deny();
 validProvider(q.provider);
 if(q.classification!=='public'||!MODEL.test(q.model??'')||!Number.isSafeInteger(q.maxOutputTokens)||q.maxOutputTokens<1||q.maxOutputTokens>2048||!Array.isArray(q.messages)||!q.messages.length||q.messages.length>32)deny();
 let bytes=0;
 const messageList=q.messages.map(m=>{
  if(!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).sort().join(',')!=='content,role'||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim())deny();
  bytes+=Buffer.byteLength(m.content,'utf8');if(bytes>65536||DLP.test(m.content))deny();
  return {role:m.role,content:m.content};
 });
 // Return only validated properties; do not forward untrusted extras.
 return {provider:q.provider,model:q.model,messages:messageList,maxOutputTokens:q.maxOutputTokens,classification:'public'};
}
const digest=q=>createHash('sha256').update(JSON.stringify(q)).digest('hex');
export class CloudConsent{
 #tickets=new Map();
 constructor({enabled=false,authorize,clock=()=>Date.now()/1000,ttl=60}={}){if(typeof authorize!=='function'||typeof clock!=='function'||typeof enabled!=='boolean'||!Number.isSafeInteger(ttl)||ttl<1||ttl>120)deny();this.enabled=enabled;this.authorize=authorize;this.clock=clock;this.ttl=ttl}
 #principal(p){if(!p||!SUBJECT.test(p.subject??'')||!TENANT.test(p.tenant??'')||!Number.isFinite(p.expires)||p.expires<=this.clock())deny()}
 async issue(principal,request){if(!this.enabled)deny();this.#principal(principal);const q=validatePrompt(request);if(await this.authorize(principal,q.provider,'interact')!==true)deny();const now=this.clock();for(const [id,record] of this.#tickets)if(record.expires<=now)this.#tickets.delete(id);if(this.#tickets.size>=1024)deny();const ticket=randomBytes(32).toString('base64url');this.#tickets.set(digest(ticket),{subject:principal.subject,tenant:principal.tenant,hash:digest(q),expires:Math.min(principal.expires,now+this.ttl)});return Object.freeze({ticket,expires:Math.min(principal.expires,now+this.ttl),provider:q.provider})}
 async consume(principal,ticket,request){if(!this.enabled)deny();this.#principal(principal);if(typeof ticket!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(ticket))deny();const hash=digest(ticket),entry=this.#tickets.get(hash);this.#tickets.delete(hash);const q=validatePrompt(request);if(!entry||entry.expires<=this.clock()||entry.subject!==principal.subject||entry.tenant!==principal.tenant||entry.hash!==digest(q))deny();if(await this.authorize(principal,q.provider,'interact')!==true)deny();return q}
}
