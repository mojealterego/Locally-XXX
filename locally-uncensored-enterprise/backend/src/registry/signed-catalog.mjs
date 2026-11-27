import {createPublicKey,verify,createHash} from 'node:crypto';
import {constants,openSync,closeSync,fstatSync,readSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
const fail=()=>{throw Error('Invalid signed catalog')};
const exact=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===k;
const integer=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b;
const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n&&!/[\p{Cc}\p{Cf}]/u.test(v);
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(v);
const decode=b=>new TextDecoder('utf-8',{fatal:true}).decode(b);
function base64(v,max){if(typeof v!=='string'||v.length>Math.ceil(max/3)*4)fail();const b=Buffer.from(v,'base64');if(!b.length||b.length>max||b.toString('base64')!==v)fail();return b}
function entry(v){
 if(!exact(v,'artifactBytes,artifactSha256,description,id,license,name,offer,state,version')||!id(v.id)||!text(v.name,120)||!text(v.description,1000)||!text(v.license,80)||!/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,79}$/.test(v.license)||typeof v.version!=='string'||!/^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[A-Za-z0-9.-]{1,48})?$/.test(v.version)||typeof v.artifactSha256!=='string'||!/^[a-f0-9]{64}$/.test(v.artifactSha256)||!integer(v.artifactBytes,1,Number.MAX_SAFE_INTEGER)||!['DEVELOPMENT','AVAILABLE','SUSPENDED','RETIRED'].includes(v.state))fail();
 if(v.offer!==null&&(!exact(v.offer,'currency,minorUnits,terms')||!['PLN','EUR','USD'].includes(v.offer.currency)||!integer(v.offer.minorUnits,0,1000000000)||!text(v.offer.terms,500)||v.state!=='AVAILABLE'))fail();
 return v;
}
export function verifyCatalog(raw,pem,now=Date.now()){
 if(typeof raw!=='string'||Buffer.byteLength(raw)>524288||!integer(now,0,8640000000000000))fail();
 const envelope=JSON.parse(raw);if(!exact(envelope,'payload,signature'))fail();const bytes=base64(envelope.payload,393000),signature=base64(envelope.signature,64);if(signature.length!==64||typeof pem!=='string'||pem.length>4096||!pem.startsWith('-----BEGIN PUBLIC KEY-----'))fail();
 const key=createPublicKey(pem);if(key.asymmetricKeyType!=='ed25519'||!verify(null,bytes,key,signature))fail();
 const p=JSON.parse(decode(bytes));if(!exact(p,'entries,expiresAtMs,issuedAtMs,issuer,schema')||p.schema!=='omega.agent.catalog.v1'||!id(p.issuer)||!integer(p.issuedAtMs,0,now)||!integer(p.expiresAtMs,now+1,8640000000000000)||p.expiresAtMs-p.issuedAtMs>31*86400000||!Array.isArray(p.entries)||p.entries.length>256)fail();
 const seen=new Set();for(const e of p.entries){entry(e);const k=e.id+'@'+e.version;if(seen.has(k))fail();seen.add(k)}
 return {...p,signerSha256:createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex'),signatureVerified:true,artifactsVerified:false,certificationVerified:false};
}
function readPrivate(path,max){if(typeof path!=='string'||!path)fail();const p=resolve(path);if(realpathSync(p)!==p)fail();const fd=openSync(p,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{const s=fstatSync(fd);if(!s.isFile()||s.nlink!==1||(s.mode&0o077)||(process.getuid&&s.uid!==process.getuid())||!integer(s.size,1,max))fail();const b=Buffer.alloc(s.size+1);let n=0;while(n<b.length){const x=readSync(fd,b,n,b.length-n,null);if(!x)break;n+=x}if(n!==s.size)fail();return decode(b.subarray(0,n))}finally{closeSync(fd)}}
export function loadCatalog({catalog,key},now=Date.now()){return verifyCatalog(readPrivate(catalog,524288),readPrivate(key,4096),now)}
