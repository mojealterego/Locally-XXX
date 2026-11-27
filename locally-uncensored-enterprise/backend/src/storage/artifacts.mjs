import {DatabaseSync} from 'node:sqlite';
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {lstatSync,realpathSync,openSync,closeSync,fstatSync,readFileSync,constants} from 'node:fs';
import {resolve,join} from 'node:path';
export const MAX_FILE=4*1024*1024;
const ID=/^[a-f0-9]{64}$/;
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=()=>{throw Error('Artifact storage denied')};
const bounded=(v,max)=>Number.isSafeInteger(v)&&v>0&&v<=max;
const validName=n=>typeof n==='string'&&n.length>0&&Buffer.byteLength(n)<=240&&n===n.trim()&&!/[\\/:*?"<>|\p{Cc}\p{Cf}]/u.test(n)&&!n.startsWith('.')&&!n.endsWith('.')&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(n);
function privateStat(s,dir=false){if((dir?!s.isDirectory():!s.isFile())||(s.mode&0o077)||(process.getuid&&s.uid!==process.getuid())||(!dir&&s.nlink!==1))fail()}
export function readStorageKey(path){const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{const stat=fstatSync(fd);privateStat(stat);if(stat.size!==32)fail();const key=readFileSync(fd);if(key.length!==32)fail();return key}finally{closeSync(fd)}}
const aad=r=>Buffer.from(JSON.stringify(['omega-artifact-v1',r.id,r.name,r.bytes]));
export class ArtifactStore{
 #key;#maxBytes;#maxEntries;
 constructor({directory,key,maxBytes=64*1024*1024,maxEntries=128}={}){
  if(typeof directory!=='string'||!directory||!Buffer.isBuffer(key)||key.length!==32||!bounded(maxBytes,64*1024*1024)||!bounded(maxEntries,128))fail();
  const root=resolve(directory);privateStat(lstatSync(root),true);if(realpathSync(root)!==root)fail();
  const path=join(root,'artifacts.sqlite');const fd=openSync(path,constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW|constants.O_NONBLOCK,0o600);try{privateStat(fstatSync(fd));if(realpathSync(path)!==path)fail()}finally{closeSync(fd)}
  this.#key=Buffer.from(key);this.#maxBytes=maxBytes;this.#maxEntries=maxEntries;
  this.db=new DatabaseSync(path);try{this.db.exec('PRAGMA busy_timeout=2000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY,name TEXT NOT NULL,bytes INTEGER NOT NULL CHECK(bytes>0),nonce BLOB NOT NULL,tag BLOB NOT NULL,ciphertext BLOB NOT NULL)')}catch(e){this.close();throw e}
 }
 close(){if(this.db){this.db.close();this.db=null}this.#key.fill(0)}
 #row(id){if(typeof id!=='string'||!ID.test(id))fail();return this.db.prepare('SELECT * FROM artifacts WHERE id=?').get(id)}
 #decode(r){if(!ID.test(r.id)||!validName(r.name)||!bounded(r.bytes,MAX_FILE)||r.ciphertext.length!==r.bytes||r.nonce.length!==12||r.tag.length!==16)fail();const d=createDecipheriv('aes-256-gcm',this.#key,r.nonce);d.setAAD(aad(r));d.setAuthTag(r.tag);const data=Buffer.concat([d.update(r.ciphertext),d.final()]);if(hash(data)!==r.id)fail();return data}
 #meta(r){return {id:r.id,name:r.name,bytes:r.bytes}}
 put(name,data){if(!validName(name)||!Buffer.isBuffer(data)||!bounded(data.length,MAX_FILE))fail();const id=hash(data);this.db.exec('BEGIN IMMEDIATE');try{const old=this.#row(id);if(old){this.#decode(old);this.db.exec('COMMIT');return this.#meta(old)}const usage=this.db.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(bytes),0) AS total FROM artifacts').get();if(usage.n>=this.#maxEntries||usage.total+data.length>this.#maxBytes)fail();const row={id,name,bytes:data.length},nonce=randomBytes(12),c=createCipheriv('aes-256-gcm',this.#key,nonce);c.setAAD(aad(row));const ciphertext=Buffer.concat([c.update(data),c.final()]);this.db.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?)').run(id,name,data.length,nonce,c.getAuthTag(),ciphertext);this.db.exec('COMMIT');return row}catch(e){this.db.exec('ROLLBACK');throw e}}
 list(){const out=[];for(const row of this.db.prepare('SELECT * FROM artifacts ORDER BY id LIMIT 129').iterate()){if(out.length>=128)fail();this.#decode(row);out.push(this.#meta(row))}return out}
 get(id){const row=this.#row(id);return row?{...this.#meta(row),data:this.#decode(row)}:null}
 remove(id){this.db.exec('BEGIN IMMEDIATE');try{const row=this.#row(id);if(row)this.#decode(row);if(row)this.db.prepare('DELETE FROM artifacts WHERE id=?').run(id);this.db.exec('COMMIT');return Boolean(row)}catch(e){this.db.exec('ROLLBACK');throw e}}
}
