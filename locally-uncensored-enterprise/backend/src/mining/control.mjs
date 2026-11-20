import {randomBytes} from 'node:crypto';

const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const deny=()=>{throw Error('Mining control denied')};
const valid=x=>typeof x==='string'&&ID.test(x);
const uint=x=>Number.isSafeInteger(x)&&x>=0;
const limitedJson=async(r,max=16384)=>{if(!r.ok||!r.body)deny();const reader=r.body.getReader(),parts=[];let n=0;try{for(;;){const {value,done}=await reader.read();if(done)break;n+=value.length;if(n>max){await reader.cancel();deny()}parts.push(value)}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)))}finally{reader.releaseLock()}};
function endpoint(raw,dev){let u;try{u=new URL(raw)}catch{deny()}if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||(dev&&u.protocol==='http:'&&u.hostname==='127.0.0.1')))deny();return u.origin}
export class MinerGateway {
 #devices=new Map();#pending=new Map();#last=new Map();
 constructor({devices,authorize,token,fetchImpl=fetch,clock=()=>Date.now(),devLoopback=false}){
  if(!Array.isArray(devices)||!devices.length||devices.length>64||typeof authorize!=='function'||typeof token!=='function'||typeof fetchImpl!=='function'||typeof clock!=='function')deny();
  for(const d of devices){if(!d||!valid(d.id)||!valid(d.tenant)||this.#devices.has(d.id)||!uint(d.minWatts)||!uint(d.maxWatts)||d.minWatts<25||d.maxWatts>d.minWatts+10000||d.maxWatts<d.minWatts)deny();this.#devices.set(d.id,Object.freeze({id:d.id,tenant:d.tenant,origin:endpoint(d.origin,devLoopback),minWatts:d.minWatts,maxWatts:d.maxWatts}))}
  this.authorize=authorize;this.token=token;this.fetchImpl=fetchImpl;this.clock=clock;
 }
 async #access(principal,id,action){const d=this.#devices.get(id);if(!d||!principal||!valid(principal.subject)||principal.tenant!==d.tenant||!await this.authorize(principal,{tenant:d.tenant,device:id,action}))deny();return d}
 async #request(d,path,method,body){const secret=await this.token(d.id);if(typeof secret!=='string'||!secret||secret.length>4096||/[\r\n]/.test(secret))deny();const res=await this.fetchImpl(d.origin+path,{method,headers:{authorization:'Bearer '+secret,'accept':'application/json',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(3000)});return limitedJson(res)}
 async status(principal,id){const d=await this.#access(principal,id,'read');const v=await this.#request(d,'/v1/rigs/'+id+'/status','GET');if(!v||v.id!==id||!uint(v.watts)||v.watts>50000||typeof v.hashrateHs!=='number'||!Number.isFinite(v.hashrateHs)||v.hashrateHs<0||!['online','paused','offline'].includes(v.state))deny();return Object.freeze({id,state:v.state,watts:v.watts,hashrateHs:v.hashrateHs})}
 async prepare(principal,command){if(!command||!valid(command.device)||!['pause','resume','set_power'].includes(command.action))deny();const d=await this.#access(principal,command.device,'control');const watts=command.action==='set_power'?command.watts:null;if(command.action==='set_power'&&(!uint(watts)||watts<d.minWatts||watts>d.maxWatts))deny();if(command.action!=='set_power'&&command.watts!==undefined)deny();const now=this.clock();if(!Number.isSafeInteger(now)||now<0)deny();for(const [id,p] of this.#pending)if(p.exp<=now)this.#pending.delete(id);if(this.#pending.size>=64)deny();const challenge=randomBytes(24).toString('base64url');this.#pending.set(challenge,{device:d.id,tenant:d.tenant,subject:principal.subject,action:command.action,watts,exp:now+60000,state:'PREPARED'});return Object.freeze({challenge,expiresAt:now+60000,description:command.action==='set_power'?'Set '+d.id+' power to '+watts+' watts':command.action+' '+d.id})}
 async execute(principal,challenge,confirmation){const p=this.#pending.get(challenge);if(!p||p.state!=='PREPARED'||p.exp<=this.clock()||confirmation!=='CONFIRM '+challenge||principal?.subject!==p.subject||principal?.tenant!==p.tenant)deny();const d=await this.#access(principal,p.device,'control');p.state='SUBMITTED';// Fail-closed on ambiguous timeout; no implicit retries of physical commands.
  const v=await this.#request(d,'/v1/rigs/'+d.id+'/commands','POST',{action:p.action,...(p.watts===null?{}:{watts:p.watts}),idempotencyKey:challenge});
  if(v?.accepted!==true||!valid(v.commandId))deny();p.state='ACCEPTED';return Object.freeze({device:d.id,commandId:v.commandId,accepted:true})}
}
