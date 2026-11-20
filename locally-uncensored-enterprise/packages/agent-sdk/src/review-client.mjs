const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const STATES=new Set(['PENDING','REVIEWED','APPROVED','REJECTED','EXPIRED']);
const valid=(x,r)=>typeof x==='string'&&r.test(x);
const fail=()=>{throw Error('Invalid review request or response')};
const text=(s,n)=>typeof s==='string'&&s.trim().length>0&&new TextEncoder().encode(s).length<=n;
const draft=x=>x&&valid(x.agent,UUID)&&Number.isSafeInteger(x.revision)&&x.revision>0&&text(x.name,256)&&text(x.role,2048)&&Array.isArray(x.tools)&&x.tools.length<=64&&x.tools.every(t=>valid(t,ID))&&new Set(x.tools).size===x.tools.length;
export class ReviewClient {
  #base;#token;#fetch;
  constructor({base,token,fetchImpl=fetch}){const u=new URL(base);if((u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))||u.username||u.password||u.pathname!=='/'||u.search||u.hash||typeof token!=='function'||typeof fetchImpl!=='function')fail();this.#base=u.origin;this.#token=token;this.#fetch=fetchImpl}
  async #request(method,body){const token=await this.#token();if(typeof token!=='string'||token.length>16384||!/^[A-Za-z0-9_.-]+$/.test(token))fail();const r=await this.#fetch(new URL('/api/reviews/'+method,this.#base),{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body),signal:AbortSignal.timeout(10000),redirect:'error',credentials:'omit',cache:'no-store'});if(!r.ok||!r.body)throw Error('Review API unavailable or denied');const reader=r.body.getReader();let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();fail()}chunks.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(v?.id!==body.id||!valid(v.tenant,UUID)||!STATES.has(v.status))fail();if(method==='get'&&(!draft(v)||!valid(v.subject,ID)||!valid(v.digest,HEX)))fail();return v}finally{reader.releaseLock()}}
  async get(id){if(!valid(id,UUID))fail();return this.#request('get',{id})}
  async submit(q){if(!q||Object.keys(q).length!==6||!['id','agent','revision','name','role','tools'].every(k=>Object.hasOwn(q,k))||!valid(q.id,UUID)||!draft(q))fail();return this.#request('submit',q)}
  async decide(id,digest,approved){if(!valid(id,UUID)||!valid(digest,HEX)||typeof approved!=='boolean')fail();return this.#request('decide',{id,digest,approved})}
}
