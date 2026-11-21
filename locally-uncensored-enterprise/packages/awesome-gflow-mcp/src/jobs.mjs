import {DatabaseSync} from 'node:sqlite';
import {constants,closeSync,lstatSync,openSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
const TENANT=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const HASH=/^[a-f0-9]{64}$/;
const GCS=/^gs:\/\/[a-z0-9][a-z0-9._-]{2,61}\/(?:[a-zA-Z0-9_-]+\/){1,12}$/;
const MODEL=new Set(['veo-3.1-generate-001','veo-3.1-fast-generate-001']);
const deny=()=>{throw Error('Video job denied or unavailable')};
const check=(tenant,key)=>{if(typeof tenant!=='string'||!TENANT.test(tenant)||typeof key!=='string'||!ID.test(key))deny()};
function safe(path,dir){if(typeof path!=='string'||!path)deny();const name=resolve(path),stat=lstatSync(name);if(realpathSync(name)!==name||(stat.mode&0o077)!==0||(process.getuid&&stat.uid!==process.getuid())||(dir?!stat.isDirectory():!stat.isFile())||(!dir&&stat.nlink!==1))deny();return name}
export class FlowJobs{
 #db;#clock;#dailyLimit;
 constructor({directory,dailyLimit,clock=()=>Date.now()}={}){
  if(!Number.isSafeInteger(dailyLimit)||dailyLimit<1||dailyLimit>100000||typeof clock!=='function')deny();this.#dailyLimit=dailyLimit;this.#clock=clock;
  const dbFile=join(safe(directory,true),'gflow-jobs.sqlite'),fd=openSync(dbFile,constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW,0o600);try{safe(dbFile,false)}finally{closeSync(fd)}
  this.#db=new DatabaseSync(dbFile);
  this.#db.exec(`PRAGMA busy_timeout=5000;PRAGMA journal_mode=DELETE;PRAGMA synchronous=FULL;
   CREATE TABLE IF NOT EXISTS jobs (tenant TEXT NOT NULL, key TEXT NOT NULL, digest TEXT NOT NULL, model TEXT NOT NULL, storage_prefix TEXT NOT NULL, utc_day INTEGER NOT NULL, state TEXT NOT NULL, operation_name TEXT, artifact_uri TEXT, failure_code TEXT, PRIMARY KEY(tenant,key));
   CREATE TABLE IF NOT EXISTS limits(tenant TEXT NOT NULL, utc_day INTEGER NOT NULL, calls INTEGER NOT NULL CHECK(calls>=0), PRIMARY KEY(tenant,utc_day));`)
 }
 #now(){const n=this.#clock();if(!Number.isSafeInteger(n)||n<0||n>8640000000000000)deny();return Math.floor(n/86400000)}
 get(tenant,key){check(tenant,key);const x=this.#db.prepare('SELECT digest,model,storage_prefix AS storagePrefix,state,operation_name AS operationName,artifact_uri AS artifactUri,failure_code AS failureCode FROM jobs WHERE tenant=? AND key=?').get(tenant,key);return x?Object.freeze({...x}):null}
 reserve(tenant,key,digest,model,storageUri){check(tenant,key);if(typeof storageUri!=='string'||!GCS.test(storageUri)||storageUri.includes('..'))deny();if(typeof digest!=='string'||!HASH.test(digest)||!MODEL.has(model))deny();const day=this.#now();this.#db.exec('BEGIN IMMEDIATE');try{
  const existing=this.get(tenant,key);if(existing){if(existing.digest!==digest||existing.model!==model||existing.storagePrefix!==storageUri)deny();this.#db.exec('COMMIT');return {...existing,created:false}}
  const used=this.#db.prepare('SELECT calls FROM limits WHERE tenant=? AND utc_day=?').get(tenant,day)?.calls??0;if(used>=this.#dailyLimit)deny();
  this.#db.prepare('INSERT INTO limits(tenant,utc_day,calls) VALUES (?,?,1) ON CONFLICT(tenant,utc_day) DO UPDATE SET calls=calls+1').run(tenant,day);
  this.#db.prepare('INSERT INTO jobs(tenant,key,digest,model,storage_prefix,utc_day,state) VALUES(?,?,?,?,?,?,?)').run(tenant,key,digest,model,storageUri,day,'SUBMITTING');this.#db.exec('COMMIT');return {...this.get(tenant,key),created:true}
 }catch(e){this.#db.exec('ROLLBACK');throw e}}
 transition(tenant,key,from,to,{operationName=null,artifactUri=null,failureCode=null}={}){check(tenant,key);if(!['SUBMITTING','SUBMITTED','RUNNING'].includes(from)||!['UNKNOWN','SUBMITTED','RUNNING','SUCCEEDED','FAILED'].includes(to))deny();if(!(from==='SUBMITTING'?['UNKNOWN','SUBMITTED'].includes(to):from==='SUBMITTED'?['RUNNING','SUCCEEDED','FAILED'].includes(to):['RUNNING','SUCCEEDED','FAILED'].includes(to)))deny();if(to==='SUBMITTED'&&(!operationName||typeof operationName!=='string'||operationName.length>350))deny();if(to==='SUCCEEDED'&&(typeof artifactUri!=='string'||!artifactUri.startsWith('gs://')))deny();if(failureCode!==null&&!['FILTERED','PROVIDER_ERROR'].includes(failureCode))deny();const out=this.#db.prepare('UPDATE jobs SET state=?, operation_name=COALESCE(?,operation_name),artifact_uri=COALESCE(?,artifact_uri),failure_code=? WHERE tenant=? AND key=? AND state=?').run(to,operationName,artifactUri,failureCode,tenant,key,from);if(out.changes!==1)deny();return this.get(tenant,key)}
 close(){this.#db.close()}
}
