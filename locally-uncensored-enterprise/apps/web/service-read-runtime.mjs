import {constants,openSync,closeSync,fstatSync,readSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {MinerGateway} from '../../backend/src/mining/control.mjs';
import {TwilioNumbers} from '../../backend/src/telecom/twilio.mjs';
const deny=()=>{throw Error('Invalid read service configuration')};
const exact=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===k;
const tenant=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const wall=()=>Math.floor(Date.now()/1000);
export function readPrivateConfig(path){const p=resolve(path);if(realpathSync(p)!==p)deny();const fd=openSync(p,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{const s=fstatSync(fd);if(!s.isFile()||s.nlink!==1||(s.mode&0o077)||(process.getuid&&s.uid!==process.getuid())||s.size<1||s.size>131072)deny();const bytes=Buffer.alloc(s.size+1);let n=0;while(n<bytes.length){const count=readSync(fd,bytes,n,bytes.length-n,null);if(!count)break;n+=count}if(n!==s.size)deny();return new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,n))}finally{closeSync(fd)}}
export function createReadRuntime(config,{oidc,permit,clock=wall,fetchImpl=fetch}={}){
 if(!config||typeof config!=='object'||Array.isArray(config)||!Object.keys(config).length||Object.keys(config).some(k=>!['mining','phone'].includes(k))||typeof oidc?.verify!=='function'||typeof permit?.allowed!=='function'||typeof clock!=='function'||typeof fetchImpl!=='function')deny();
 const allowed=async(p,t,r)=>p?.tenant===t&&Number.isSafeInteger(p.expires)&&p.expires>clock()&&await permit.allowed(p,t,'read',r)===true&&p.expires>clock();
 let miner=null,phone=null;
 if(Object.hasOwn(config,'mining')){if(!Array.isArray(config.mining)||!config.mining.length||config.mining.length>64)deny();const secrets=new Map(),devices=config.mining.map(d=>{if(!exact(d,'id,maxWatts,minWatts,origin,tenant,token')||!tenant(d.tenant)||typeof d.token!=='string'||!d.token||d.token.length>4096||/[\r\n]/.test(d.token))deny();const {token,...rest}=d;secrets.set(d.id,token);return rest});miner=new MinerGateway({devices,authorize:(p,q)=>q.action==='read'&&allowed(p,q.tenant,'mining-'+q.device),token:id=>secrets.get(id),fetchImpl})}
 if(Object.hasOwn(config,'phone')){const q=config.phone;if(!exact(q,'accountSid,apiKeySecret,apiKeySid,tenant')||!tenant(q.tenant))deny();phone=new TwilioNumbers({...q,authorize:(p,a)=>['phone:read','phone:search'].includes(a.action)&&allowed(p,a.tenant,a.action==='phone:search'?'virtual-number-search':'virtual-number'),recipientConsent:async()=>false,fetchImpl})}
 return Object.freeze({oidc,miner,phone});
}
export function loadReadRuntime(env,{Oidc,Permit}){if(!env.OMEGA_SERVICE_READ_CONFIG)return null;const required=k=>{if(typeof env[k]!=='string'||!env[k])deny();return env[k]};const config=JSON.parse(readPrivateConfig(required('OMEGA_SERVICE_READ_CONFIG')));const oidc=new Oidc({issuer:required('OMEGA_OIDC_ISSUER'),audience:required('OMEGA_OIDC_AUDIENCE'),client:required('OMEGA_OIDC_CLIENT')});const permit=new Permit({url:required('OMEGA_PDP_URL'),apiKey:readPrivateConfig(required('OMEGA_PDP_KEY_FILE')).trim()});return createReadRuntime(config,{oidc,permit})}
