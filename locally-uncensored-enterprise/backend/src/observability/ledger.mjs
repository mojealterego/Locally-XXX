import {createHmac,timingSafeEqual} from 'node:crypto';
import {constants,closeSync,lstatSync,openSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const KINDS=new Set(['run_started','tool_allowed','tool_denied','tool_finished','tool_failed','run_finished','run_failed']);
const EMPTY=Buffer.alloc(32);
const fail=(message='Audit input denied')=>{throw Error(message)};
const valid=x=>typeof x==='string'&&ID.test(x);
const keys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===expected.slice().sort().join(',');
function privatePath(value,directory){if(typeof value!=='string'||!value)fail();const path=resolve(value),st=lstatSync(path);if(realpathSync(path)!==path||(st.mode&0o077)!==0||(process.getuid&&st.uid!==process.getuid())||(directory?!st.isDirectory():!st.isFile())||(!directory&&st.nlink!==1))fail('Audit store permissions invalid');return path}
const signed=(key,row)=>createHmac('sha256',key).update('omega-audit-v1\0').update(JSON.stringify([row.seq,row.tenant,row.agent,row.runId,row.kind,row.node,row.timeMs,Buffer.from(row.prev).toString('hex')])).digest();

/** Restricted audit ledger: no arbitrary text, prompts, LLM reasoning, credentials or tool outputs. */
export class AuditLedger {
 #db;#key;#clock;#max;
 constructor({directory,key,maxEventsPerTenant=50000,clock=Date.now}={}){
  if(!Buffer.isBuffer(key)||key.length!==32||typeof clock!=='function'||!Number.isSafeInteger(maxEventsPerTenant)||maxEventsPerTenant<1||maxEventsPerTenant>1000000)fail();
  this.#key=Buffer.from(key);this.#clock=clock;this.#max=maxEventsPerTenant;
  const parent=privatePath(directory,true),file=join(parent,'audit.sqlite');const fd=openSync(file,constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW,0o600);try{privatePath(file,false)}finally{closeSync(fd)}
  this.#db=new DatabaseSync(file);
  this.#db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
   CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY,tenant TEXT NOT NULL,agent TEXT NOT NULL,run_id TEXT NOT NULL,kind TEXT NOT NULL,node TEXT,time_ms INTEGER NOT NULL,prev BLOB NOT NULL,mac BLOB NOT NULL);
   CREATE INDEX IF NOT EXISTS ix_audit_scope ON events(tenant,agent,seq);
   CREATE TABLE IF NOT EXISTS tenant_state(tenant TEXT PRIMARY KEY,records INTEGER NOT NULL CHECK(records >= 0),last_mac BLOB NOT NULL);`);
 }
 #time(){const t=this.#clock();if(!Number.isSafeInteger(t)||t<0||t>8640000000000000)fail();return t}
 #scope(tenant,agent){if(!valid(tenant)||(agent!==undefined&&!valid(agent)))fail()}
 append(event){if(!keys(event,['tenant','agent','runId','kind','node'])||!valid(event.runId)||!KINDS.has(event.kind)||!(event.node===null||valid(event.node)))fail();this.#scope(event.tenant,event.agent);if(event.kind.startsWith('tool_')&&event.node===null)fail();if(!event.kind.startsWith('tool_')&&event.node!==null)fail();const timeMs=this.#time();
  this.#db.exec('BEGIN IMMEDIATE');try{
   const state=this.#db.prepare('SELECT records,last_mac FROM tenant_state WHERE tenant=?').get(event.tenant),count=state?.records??0;
   if(count>=this.#max)fail('Audit capacity exhausted');
   const prev=state?Buffer.from(state.last_mac):Buffer.from(EMPTY);
   const row=this.#db.prepare('SELECT mac FROM events WHERE tenant=? ORDER BY seq DESC LIMIT 1').get(event.tenant);
   if(count===0?!!row:!row||!timingSafeEqual(prev,row.mac))fail('Audit integrity violated');
   const seq=this.#db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS next FROM events').get().next;
   const record={seq,tenant:event.tenant,agent:event.agent,runId:event.runId,kind:event.kind,node:event.node,timeMs,prev};
   const mac=signed(this.#key,record);
   this.#db.prepare('INSERT INTO events(seq,tenant,agent,run_id,kind,node,time_ms,prev,mac) VALUES (?,?,?,?,?,?,?,?,?)').run(seq,record.tenant,record.agent,record.runId,record.kind,record.node,timeMs,prev,mac);
   this.#db.prepare('INSERT INTO tenant_state(tenant,records,last_mac) VALUES (?,?,?) ON CONFLICT(tenant) DO UPDATE SET records=excluded.records,last_mac=excluded.last_mac').run(event.tenant,count+1,mac);
   this.#db.exec('COMMIT');return Object.freeze({seq,tenant:event.tenant,agent:event.agent,runId:event.runId,kind:event.kind,node:event.node,timeMs});
  }catch(e){this.#db.exec('ROLLBACK');throw e}
 }
 verify(tenant){this.#scope(tenant);this.#db.exec('BEGIN');try{const state=this.#db.prepare('SELECT records,last_mac FROM tenant_state WHERE tenant=?').get(tenant);const rows=this.#db.prepare('SELECT seq,tenant,agent,run_id,kind,node,time_ms,prev,mac FROM events WHERE tenant=? ORDER BY seq').all(tenant);if(rows.length!==(state?.records??0))fail('Audit integrity violated');let previous=Buffer.from(EMPTY);for(const r of rows){const event={seq:r.seq,tenant:r.tenant,agent:r.agent,runId:r.run_id,kind:r.kind,node:r.node,timeMs:r.time_ms,prev:r.prev};if(!timingSafeEqual(previous,r.prev)||!timingSafeEqual(signed(this.#key,event),r.mac))fail('Audit integrity violated');previous=Buffer.from(r.mac)}if(state&&!timingSafeEqual(previous,state.last_mac))fail('Audit integrity violated');this.#db.exec('COMMIT');return true}catch(e){this.#db.exec('ROLLBACK');throw e}}
 list({tenant,agent,since=0,limit=100}={}){this.#scope(tenant,agent);if(!Number.isSafeInteger(since)||since<0||!Number.isSafeInteger(limit)||limit<1||limit>200)fail();this.verify(tenant);const entries=this.#db.prepare('SELECT seq,tenant,agent,run_id AS runId,kind,node,time_ms AS timeMs FROM events WHERE tenant=? AND agent=? AND seq>? ORDER BY seq LIMIT ?').all(tenant,agent,since,limit);return Object.freeze({entries:entries.map(r=>Object.freeze({...r})),nextCursor:entries.length?entries.at(-1).seq:since})}
 close(){if(this.#db){this.#db.close();this.#db=null}this.#key.fill(0)}
}
