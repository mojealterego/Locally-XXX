import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {lstatSync,realpathSync,openSync,readFileSync,closeSync,constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {validProvider} from './policy.mjs';
const deny=()=>{throw Error('Credential vault unavailable')};
const TENANT=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function safeFile(path,mode,expectDirectory){const abs=resolve(path),st=lstatSync(abs);if(realpathSync(abs)!==abs||(st.mode&mode)!==0||(process.getuid&&st.uid!==process.getuid())||(expectDirectory?!st.isDirectory():!st.isFile()))deny();return abs}
export class CredentialVault {
 #key;#db;
 constructor({directory,machineKeyFile}){
  const dir=safeFile(directory,0o077,true),key=safeFile(machineKeyFile,0o077,false);
  const fd=openSync(key,constants.O_RDONLY|constants.O_NOFOLLOW);try{this.#key=readFileSync(fd);if(this.#key.length!==32)deny()}finally{closeSync(fd)}
  const dbPath=join(dir,'cloud.sqlite');const f=openSync(dbPath,constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW,0o600);closeSync(f);safeFile(dbPath,0o077,false);
  this.#db=new DatabaseSync(dbPath);this.#db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS credentials (tenant TEXT NOT NULL, provider TEXT NOT NULL, iv BLOB NOT NULL, ciphertext BLOB NOT NULL, tag BLOB NOT NULL, PRIMARY KEY(tenant,provider))');
 }
 #validate(tenant,provider){if(typeof tenant!=='string'||!TENANT.test(tenant))deny();validProvider(provider)}
 set(tenant,provider,secret){this.#validate(tenant,provider);if(typeof secret!=='string'||secret.length<12||secret.length>4096||/[\x00-\x1f\x7f]/.test(secret))deny();const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.#key,iv);cipher.setAAD(Buffer.from(tenant+':'+provider+':v1'));const ciphertext=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);const tag=cipher.getAuthTag();this.#db.prepare('INSERT INTO credentials (tenant,provider,iv,ciphertext,tag) VALUES (?,?,?,?,?) ON CONFLICT (tenant,provider) DO UPDATE SET iv=excluded.iv,ciphertext=excluded.ciphertext,tag=excluded.tag').run(tenant,provider,iv,ciphertext,tag)}
 has(tenant,provider){this.#validate(tenant,provider);return !!this.#db.prepare('SELECT 1 FROM credentials WHERE tenant=? AND provider=?').get(tenant,provider)}
 remove(tenant,provider){this.#validate(tenant,provider);this.#db.prepare('DELETE FROM credentials WHERE tenant=? AND provider=?').run(tenant,provider)}
 async using(tenant,provider,run){this.#validate(tenant,provider);if(typeof run!=='function')deny();const v=this.#db.prepare('SELECT iv,ciphertext,tag FROM credentials WHERE tenant=? AND provider=?').get(tenant,provider);if(!v)deny();try{const decipher=createDecipheriv('aes-256-gcm',this.#key,v.iv);decipher.setAAD(Buffer.from(tenant+':'+provider+':v1'));decipher.setAuthTag(v.tag);const content=Buffer.concat([decipher.update(v.ciphertext),decipher.final()]);try{return await run(content.toString('utf8'))}finally{content.fill(0)}}catch{deny()}}
 close(){this.#db.close();this.#key.fill(0)}
}
