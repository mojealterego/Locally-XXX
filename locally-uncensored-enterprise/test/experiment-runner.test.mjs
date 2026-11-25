import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {runExperimentPlan} from '../apps/web/experiment-runner.mjs';
const good={status:'PLAN_ONLY_NOT_TRAINED',execution:'NO_EXECUTOR_BOUND',authorization:{cloud_plan_authorized:false,external_dataset_egress_authorized:false},plan_sha256:'a'.repeat(64)};
function fixture(t,value){const dir=mkdtempSync(join(tmpdir(),'omega-exp-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'mock.py');writeFileSync(path,'import json\nprint(json.dumps('+JSON.stringify(value).replaceAll('false','False').replaceAll('true','True')+'))\n');return path}
test('EXPERIMENT-RUN-01 isolated Python returns bounded plan only',async t=>{const r=await runExperimentPlan({example:1},{script:fixture(t,good)});assert.equal(r.execution,'NO_EXECUTOR_BOUND')});
test('EXPERIMENT-RUN-02 refuses training-executed claim and cloud grant',async t=>{await assert.rejects(runExperimentPlan({example:1},{script:fixture(t,{...good,execution:'TRAINING_DONE'})}),/EXPERIMENT_INVALID_RESPONSE/)});
test('EXPERIMENT-RUN-03 bounds request size before spawn',async()=>{await assert.rejects(runExperimentPlan({input:'x'.repeat(70000)}),/EXPERIMENT_INPUT_TOO_LARGE/)});
