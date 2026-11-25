import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {runKnowledgeReconciliation} from '../apps/web/knowledge-runner.mjs';
const valid={schema_version:'omega.knowledge.reconciliation.v1',action_executed:false,memory_persisted:false,proof_state:'NO_CHECKED_PROOF',share_state:'PRIVATE_ONLY',decision:'DENIED'};
function fixture(t,code){const dir=mkdtempSync(join(tmpdir(),'omega-knowledge-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=join(dir,'output.py');writeFileSync(file,code);return file}
test('KNOW-RUN-01 accepts actual isolated Python JSON process with fail-closed proof',async t=>{
 const script=fixture(t,`import json\nprint(json.dumps(${JSON.stringify(valid).replaceAll('false','False').replaceAll('true','True')}))\n`);
 const result=await runKnowledgeReconciliation({sample:1},{script});assert.equal(result.proof_state,'NO_CHECKED_PROOF');assert.equal(result.action_executed,false);
});
test('KNOW-RUN-02 rejects forged execution grant',async t=>{
 const forged={...valid,action_executed:true};const script=fixture(t,`import json\nprint(json.dumps(${JSON.stringify(forged).replaceAll('false','False').replaceAll('true','True')}))\n`);
 await assert.rejects(runKnowledgeReconciliation({}, {script}),/KNOWLEDGE_INVALID_OUTPUT/);
});
test('KNOW-RUN-03 refuses oversized requests',async()=>{await assert.rejects(runKnowledgeReconciliation({x:'x'.repeat(70000)}),/KNOWLEDGE_INPUT_TOO_LARGE/)});
test('KNOW-RUN-04 terminates slow child process',async t=>{
 const script=fixture(t,'import time\ntime.sleep(3)\n');await assert.rejects(runKnowledgeReconciliation({}, {script,timeoutMs:200}),/KNOWLEDGE_TIMEOUT/);
});
