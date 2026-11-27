import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuditLedger} from '../backend/src/observability/ledger.mjs';
import {auditServer} from '../backend/src/observability/http.mjs';
import {fetchAuditPage} from '../apps/web/operations-browser.mjs';
test('OPWEB-05: actual SQLite HMAC ledger and audit HTTP preserve tenant, paging and policy',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'omega-opweb-'));
 const ledger=new AuditLedger({directory,key:Buffer.alloc(32,7),clock:()=>1000});
 const event={agent:'agent-a',runId:'run-a',kind:'run_started',node:null};
 const first=ledger.append({...event,tenant:'tenant-a'});
 ledger.append({...event,tenant:'tenant-b'});
 const last=ledger.append({...event,tenant:'tenant-a',kind:'run_finished'});
 const s=auditServer({ledger,clock:()=>100,oidc:{verify:async token=>{if(token!=='fixture')throw Error('Denied');return {tenant:'tenant-a',expires:200}}},permit:{allowed:async(p,t,a,id)=>p.tenant===t&&a==='read'&&id==='agent-a'}});
 try{
  await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve)});
  const transport=(path,options)=>fetch('http://127.0.0.1:'+s.address().port+path,options);
  const request={token:'fixture',agent:'agent-a',since:0,limit:1};
  const p=await fetchAuditPage(request,transport);assert.deepEqual(p,{entries:[first],nextCursor:first.seq});
  const q=await fetchAuditPage({...request,since:p.nextCursor},transport);assert.deepEqual(q,{entries:[last],nextCursor:last.seq});
  assert.deepEqual(await fetchAuditPage({...request,since:q.nextCursor},transport),{entries:[],nextCursor:last.seq});
  await assert.rejects(fetchAuditPage({...request,agent:'other'},transport));await assert.rejects(fetchAuditPage({...request,token:'wrong'},transport));
 }finally{s.closeAllConnections();if(s.listening)await new Promise(resolve=>s.close(resolve));ledger.close();rmSync(directory,{recursive:true,force:true})}
});
