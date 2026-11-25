import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {runComputePlan} from '../apps/web/compute-runner.mjs';
const safe={schema_version:'omega.compute.offline.result.v1',execution_mode:'OFFLINE',state:'ROUTE_PLAN_ONLY',runtime_executed:false,cloud_egress:false,telemetry_verified:false,inventory_verified:false};
function fixture(t,obj){const d=mkdtempSync(join(tmpdir(),'omega-compute-'));t.after(()=>rmSync(d,{recursive:true,force:true}));const p=join(d,'worker.py');writeFileSync(p,'import json\nprint(json.dumps('+JSON.stringify(obj).replaceAll('false','False').replaceAll('true','True')+'))\n');return p}
test('COMPUTE-RUN-01 accepts a bounded offline policy plan',async t=>{const script=fixture(t,safe);const result=await runComputePlan({case:'x'},{script});assert.equal(result.runtime_executed,false)});
test('COMPUTE-RUN-02 refuses cloud egress or claimed execution',async t=>{const script=fixture(t,{...safe,cloud_egress:true});await assert.rejects(runComputePlan({case:'x'},{script}),/COMPUTE_INVALID_RESPONSE/)});
test('COMPUTE-RUN-03 rejects oversized input',async()=>{await assert.rejects(runComputePlan({a:'x'.repeat(70000)}),/COMPUTE_REQUEST_TOO_LARGE/)});
