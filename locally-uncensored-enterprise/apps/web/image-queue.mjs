import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {constants,openSync,closeSync,fstatSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildImageWorkflow} from './image-runner.mjs';
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail=()=>{throw Error('IMAGE_QUEUE_DENIED')};
const hash=b=>createHash('sha256').update(b).digest('hex');
const stable=o=>JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a],[b])=>a<b?-1:a>b?1:0)));
const privateStat=(s,dir=false)=>{if(!(dir?s.isDirectory():s.isFile())||(s.mode&0o077)||(process.getuid&&s.uid!==process.getuid())||(!dir&&s.nlink!==1))fail()};
const checkId=id=>{if(typeof id!=='string'||!ID.test(id))fail()};
function validPng(b,v){return Buffer.isBuffer(b)&&b.length>=33&&b.length<=8*1024*1024&&b.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&b.readUInt32BE(8)===13&&b.toString('ascii',12,16)==='IHDR'&&b.readUInt32BE(16)===v.width&&b.readUInt32BE(20)===v.height}
export class ImageQueue{
 constructor({directory,clock=Date.now}={}){
  if(typeof directory!=='string'||!directory||typeof clock!=='function'||!process.getuid||!constants.O_NOFOLLOW)fail();const root=resolve(directory);privateStat(lstatSync(root),true);if(realpathSync(root)!==root)fail();const path=join(root,'image-jobs.sqlite');
  for(const suffix of ['-journal','-wal','-shm']){try{privateStat(lstatSync(path+suffix))}catch(e){if(e.code!=='ENOENT')throw e}}
  const fd=openSync(path,constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW|constants.O_NONBLOCK,0o600);try{privateStat(fstatSync(fd));if(realpathSync(path)!==path)fail()}finally{closeSync(fd)}
  this.clock=clock;this.db=new DatabaseSync(path);try{this.db.exec("PRAGMA busy_timeout=2000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS jobs(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,input TEXT NOT NULL,config TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('QUEUED','RUNNING','SUCCEEDED','UNKNOWN','UNKNOWN_ACKNOWLEDGED','CANCELLED')),deadline INTEGER,token TEXT,output BLOB,sha256 TEXT)")}catch(e){this.close();throw e}
 }
 close(){if(this.db){this.db.close();this.db=null}}
 #tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result}catch(e){this.db.exec('ROLLBACK');throw e}}
 #row(id){checkId(id);const r=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);if(!r)fail();return r}
 #now(){const n=this.clock();if(!Number.isSafeInteger(n)||n<0||n>Number.MAX_SAFE_INTEGER-180000)fail();return n}
 #expire(now){this.db.prepare("UPDATE jobs SET status='UNKNOWN',token=NULL,deadline=NULL WHERE status='RUNNING' AND deadline<=?").run(now)}
 #meta(r){return {id:r.id,status:r.status,sha256:r.sha256??null}}
 #config(c){return stable({port:c.port,checkpoint:c.checkpoint})}
 enqueue(id,input,c){checkId(id);buildImageWorkflow(input,c);const body=stable(input),config=this.#config(c);if(Buffer.byteLength(body)>16384)fail();return this.#tx(()=>{const old=this.db.prepare('SELECT id,status,input,config,sha256 FROM jobs WHERE id=?').get(id);if(old){if(old.input!==body||old.config!==config)fail();return this.#meta(old)}if(this.db.prepare('SELECT count(*) n FROM jobs').get().n>=16)fail();this.db.prepare("INSERT INTO jobs(id,input,config,status) VALUES(?,?,?,'QUEUED')").run(id,body,config);return {id,status:'QUEUED',sha256:null}})}
 list(){return this.#tx(()=>{this.#expire(this.#now());return this.db.prepare('SELECT id,status,sha256 FROM jobs ORDER BY seq LIMIT 16').all().map(r=>this.#meta(r))})}
 claim(id,c){checkId(id);this.list();return this.#tx(()=>{const now=this.#now(),r=this.#row(id);if(r.status!=='QUEUED'||r.config!==this.#config(c)||this.db.prepare("SELECT 1 FROM jobs WHERE status IN ('RUNNING','UNKNOWN') LIMIT 1").get()||this.db.prepare("SELECT id FROM jobs WHERE status='QUEUED' ORDER BY seq LIMIT 1").get()?.id!==id)fail();const input=JSON.parse(r.input);buildImageWorkflow(input,c);const token=randomUUID();this.db.prepare("UPDATE jobs SET status='RUNNING',token=?,deadline=? WHERE id=?").run(token,now+180000,id);return {input,token}})}
 complete(id,token,bytes){this.list();return this.#tx(()=>{const r=this.#row(id);if(r.status!=='RUNNING'||typeof token!=='string'||r.token!==token||r.deadline<=this.#now()||!validPng(bytes,JSON.parse(r.input)))fail();this.db.prepare("UPDATE jobs SET status='SUCCEEDED',output=?,sha256=?,token=NULL,deadline=NULL WHERE id=?").run(bytes,hash(bytes),id)})}
 unknown(id,token){return this.#tx(()=>{const r=this.#row(id);if(r.status!=='RUNNING'||typeof token!=='string'||r.token!==token)fail();this.db.prepare("UPDATE jobs SET status='UNKNOWN',token=NULL,deadline=NULL WHERE id=?").run(id)})}
 cancel(id){return this.#tx(()=>{const r=this.#row(id);if(r.status!=='QUEUED')fail();this.db.prepare("UPDATE jobs SET status='CANCELLED' WHERE id=?").run(id)})}
 acknowledge(id,approved){if(approved!==true)fail();return this.#tx(()=>{const r=this.#row(id);if(r.status!=='UNKNOWN')fail();this.db.prepare("UPDATE jobs SET status='UNKNOWN_ACKNOWLEDGED' WHERE id=?").run(id)})}
 result(id){const r=this.#row(id);if(r.status!=='SUCCEEDED'||!r.output)fail();const b=Buffer.from(r.output);if(!validPng(b,JSON.parse(r.input))||hash(b)!==r.sha256)fail();return b}
}
