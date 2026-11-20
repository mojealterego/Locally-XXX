import {DatabaseSync} from 'node:sqlite';
import {createCipheriv,createDecipheriv,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {lstatSync,realpathSync,openSync,closeSync,constants} from 'node:fs';
import {resolve,join} from 'node:path';
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const fail=()=>{throw Error('Invalid checkpoint or revision conflict')};
const scope=(t,p)=>{if(typeof t!=='string'||typeof p!=='string'||!ID.test(t)||!ID.test(p))fail()};
const aad=(t,p,r)=>Buffer.from(JSON.stringify(['omega-checkpoint-v1',t,p,r]));
export class CheckpointStore {
  #key;
  constructor({directory,key}){if(!Buffer.isBuffer(key)||key.length!==32)fail();this.#key=Buffer.from(key);const root=resolve(directory),st=lstatSync(root);if(realpathSync(root)!==root||!st.isDirectory()||(st.mode&0o077)||(process.getuid&&st.uid!==process.getuid()))fail();const path=join(root,'checkpoints.sqlite');const fd=openSync(path,constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW,0o600);closeSync(fd);const f=lstatSync(path);if(!f.isFile()||f.nlink!==1||(f.mode&0o077)||(process.getuid&&f.uid!==process.getuid()))fail();this.db=new DatabaseSync(path);this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS checkpoints(tenant TEXT NOT NULL,project TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),nonce BLOB NOT NULL,tag BLOB NOT NULL,ciphertext BLOB NOT NULL,mac BLOB NOT NULL,PRIMARY KEY(tenant,project,revision))')}
  close(){this.db.close();this.#key.fill(0)}
  #latest(t,p){return this.db.prepare('SELECT * FROM checkpoints WHERE tenant=? AND project=? ORDER BY revision DESC LIMIT 1').get(t,p)}
  #mac(t,p,plain){return createHmac('sha256',this.#key).update('omega-checkpoint-dedupe\0').update(JSON.stringify([t,p])).update(plain).digest()}
  #decode(row){const d=createDecipheriv('aes-256-gcm',this.#key,row.nonce);d.setAAD(aad(row.tenant,row.project,row.revision));d.setAuthTag(row.tag);const plain=Buffer.concat([d.update(row.ciphertext),d.final()]);if(!timingSafeEqual(this.#mac(row.tenant,row.project,plain),row.mac))fail();return JSON.parse(plain.toString('utf8'))}
  save({tenant,project,expected,payload}){scope(tenant,project);if(!Number.isSafeInteger(expected)||expected<0||expected>=Number.MAX_SAFE_INTEGER||!payload||typeof payload!=='object'||Array.isArray(payload))fail();const plain=Buffer.from(JSON.stringify(payload));if(plain.length>1048576)fail();const mac=this.#mac(tenant,project,plain);this.db.exec('BEGIN IMMEDIATE');try{const last=this.#latest(tenant,project),current=last?.revision??0;if(last)this.#decode(last);if(last&&current===expected+1&&timingSafeEqual(mac,last.mac)){this.db.exec('COMMIT');return {revision:current}}if(current!==expected)fail();const revision=current+1,nonce=randomBytes(12),c=createCipheriv('aes-256-gcm',this.#key,nonce);c.setAAD(aad(tenant,project,revision));const ciphertext=Buffer.concat([c.update(plain),c.final()]);this.db.prepare('INSERT INTO checkpoints VALUES(?,?,?,?,?,?,?)').run(tenant,project,revision,nonce,c.getAuthTag(),ciphertext,mac);this.db.exec('COMMIT');return {revision}}catch(e){this.db.exec('ROLLBACK');throw e}}
  restore(tenant,project){scope(tenant,project);const row=this.#latest(tenant,project);return row?{revision:row.revision,payload:this.#decode(row)}:null}
}
