import {constants,closeSync,lstatSync,openSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {validatePrompt} from './policy.mjs';

const deny=()=>{throw Error('Cloud quota unavailable or exhausted')};
const TENANT=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function checkPrivate(path,directory){
 const abs=resolve(path),st=lstatSync(abs);
 if(realpathSync(abs)!==abs||(st.mode&0o077)!==0||(process.getuid&&st.uid!==process.getuid())||(directory?!st.isDirectory():!st.isFile()))deny();
 return abs;
}
function maxLimit(value,upper){if(!Number.isSafeInteger(value)||value<1||value>upper)deny();return value}
export class CloudQuota {
 #db;#clock;#requests;#tokens;
 constructor({directory,maxRequestsPerDay,maxOutputTokensPerDay,clock=()=>Date.now()/1000}={}){
  this.#requests=maxLimit(maxRequestsPerDay,1000000);
  this.#tokens=maxLimit(maxOutputTokensPerDay,10000000);
  if(typeof clock!=='function')deny();this.#clock=clock;
  const dir=checkPrivate(directory,true),file=join(dir,'cloud-quota.sqlite');
  const fd=openSync(file,constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW,0o600);
  try{checkPrivate(file,false)}finally{closeSync(fd)}
  this.#db=new DatabaseSync(file);
  this.#db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS daily_usage (tenant TEXT NOT NULL, utc_day INTEGER NOT NULL, requests INTEGER NOT NULL CHECK (requests >= 0), output_tokens_reserved INTEGER NOT NULL CHECK (output_tokens_reserved >= 0), PRIMARY KEY (tenant,utc_day))');
 }
 #day(){const now=this.#clock();if(!Number.isFinite(now)||now<0||now>8640000000000)deny();return Math.floor(now/86400)}
 #tenant(tenant){if(typeof tenant!=='string'||!TENANT.test(tenant))deny();return tenant}
 snapshot(tenant){const row=this.#db.prepare('SELECT requests,output_tokens_reserved AS tokens FROM daily_usage WHERE tenant=? AND utc_day=?').get(this.#tenant(tenant),this.#day());const requestsUsed=row?.requests??0,tokensReserved=row?.tokens??0;return Object.freeze({requestsUsed,tokensReserved,requestsRemaining:Math.max(0,this.#requests-requestsUsed),outputTokensRemaining:Math.max(0,this.#tokens-tokensReserved),maxRequestsPerDay:this.#requests,maxOutputTokensPerDay:this.#tokens})}
 reserve(tenant,request){const t=this.#tenant(tenant),q=validatePrompt(request),day=this.#day();if(q.maxOutputTokens>this.#tokens)deny();
  // Single atomic SQLite UPSERT serializes quota reservations across independent processes.
  // Failed, interrupted or disconnected requests keep their reservation: no uncertain refund.
  const outcome=this.#db.prepare('INSERT INTO daily_usage (tenant,utc_day,requests,output_tokens_reserved) VALUES (?,?,1,?) ON CONFLICT(tenant,utc_day) DO UPDATE SET requests=requests+1, output_tokens_reserved=output_tokens_reserved+excluded.output_tokens_reserved WHERE requests < ? AND output_tokens_reserved <= ? - excluded.output_tokens_reserved').run(t,day,q.maxOutputTokens,this.#requests,this.#tokens);
  if(outcome.changes!==1)deny();return this.snapshot(t);
 }
 close(){this.#db.close()}
}
