import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {compileProductionIntegration,planDirectorChange,executeApprovedAdapter,IntegrationError} from '../bridge.mjs';
const root=new URL('../modules/',import.meta.url);
const json=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const studio=json('studio/examples/project.json');
const cinema=json('cinema/examples/project_cinematic.json');
const narrative=json('studio/examples/narrative.json');
const audio=json('studio/examples/audio.json');
const base=()=>({studioProject:{...structuredClone(studio),project_id:'cinema-omega-001'},cinemaProject:structuredClone(cinema),assetRights:cinema.assets.map(a=>({asset_id:a.id,hash:a.hash,type:'prop',owner:'project-owner',license:'original'})),narrative:structuredClone(narrative),audioCue:structuredClone(audio)});
const fails=(x,code)=>assert.throws(()=>compileProductionIntegration(x),e=>e instanceof IntegrationError&&e.code===code);

test('joins real P10 and Aether source modules into a content-addressed planning manifest',()=>{
 const input=base();const snapshot=JSON.stringify(input);const out=compileProductionIntegration(input);
 assert.equal(out.status,'PLAN_ONLY_NOT_BUILT');assert.equal(out.engine_adapter,'NOT_CONNECTED');
 assert.equal(out.tenant_id,'omega-studio');assert.equal(out.asset_ids.length,2);
 assert.equal(out.scenes.length,2);assert.equal(out.materialization.qa_e2e,'NOT_RUN');
 assert.equal(out.release_state,'BLOCKED_BY_RELEASE_GATES');
 assert.equal(JSON.stringify(input),snapshot);
 assert.deepEqual(out,compileProductionIntegration(input));
});
test('denies mismatched project identity',()=>{const x=base();x.studioProject.project_id='other';fails(x,'PROJECT_ID_MISMATCH')});
test('denies missing asset rights',()=>{const x=base();x.assetRights.pop();fails(x,'UNATTESTED_ASSET')});
test('denies forged asset digest',()=>{const x=base();x.assetRights[0].hash='sha256:'+'f'.repeat(64);fails(x,'UNATTESTED_ASSET')});
test('denies duplicate attestations',()=>{const x=base();x.assetRights.push(x.assetRights[0]);fails(x,'DUPLICATE_OR_INVALID_ATTESTATION')});
test('denies extra unattached attestations',()=>{const x=base();x.assetRights.push({...x.assetRights[0],asset_id:'other'});fails(x,'ORPHAN_ATTESTATION')});
test('denies missing performer consent',()=>{const x=base();x.assetRights[0].type='face_capture';fails(x,'RIGHTS_DENIED')});
test('denies empty license',()=>{const x=base();x.assetRights[0].license='';fails(x,'RIGHTS_DENIED')});
test('denies adult project routed as child',()=>{const x=base();x.studioProject.rating='CHILD';fails(x,'CHILD_TRACK_MISMATCH')});
test('rejects production scene without known target',()=>{const x=base();x.cinemaProject.shots[0].narrativeNode='missing';fails(x,'P10_REJECTED')});
test('rejects unresolved narrative',()=>{const x=base();x.narrative.nodes[0].choices=[];fails(x,'NARRATIVE_REJECTED')});
test('accepts authorized scene crosswalk',()=>{const x=base();x.sceneCrosswalk={opening:'intro'};assert.equal(compileProductionIntegration(x).scene_crosswalk.opening,'intro')});
test('rejects unknown crosswalk target',()=>{const x=base();x.sceneCrosswalk={opening:'unknown'};fails(x,'INVALID_SCENE_LINK')});
test('rejects unknown crosswalk source',()=>{const x=base();x.sceneCrosswalk={unknown:'intro'};fails(x,'UNKNOWN_STUDIO_SCENE')});
test('rejects invalid audio score',()=>{const x=base();x.audioCue.bpm=-1;fails(x,'AUDIO_REJECTED')});
test('rejects foreign object with custom prototype',()=>{assert.throws(()=>compileProductionIntegration(new Date()),e=>e.code==='INVALID_REQUEST')});
test('rejects invalid P10 child-care policy',()=>{const x=base();x.cinemaProject.track='CHILD_ANIMATION';x.studioProject.rating='CHILD';x.cinemaProject.audience='AGE_3_5';x.cinemaProject.rating='G';fails(x,'P10_REJECTED')});
test('director edits stay pending approval',()=>{const x=base();const r=planDirectorChange(x.studioProject,{tension:.8},1);assert.equal(r.change_status,'PENDING_APPROVAL')});
test('director revision conflicts fail closed',()=>{const x=base();assert.throws(()=>planDirectorChange(x.studioProject,{tension:.8},2),e=>e.code==='DIRECTOR_REJECTED')});
test('executor refuses missing approval',async()=>{const m=compileProductionIntegration(base());await assert.rejects(executeApprovedAdapter({manifest:m,adapter:async()=>({status:'BUILT_AND_VERIFIED',artifact_sha256:'sha256:'+'0'.repeat(64)})}),e=>e.code==='HUMAN_APPROVAL_REQUIRED')});
test('executor refuses missing adapter',async()=>{const m=compileProductionIntegration(base());await assert.rejects(executeApprovedAdapter({manifest:m,approval:true}),e=>e.code==='ADAPTER_NOT_CONFIGURED')});
test('executor detects tampered manifest',async()=>{const m=compileProductionIntegration(base());m.release_state='READY';await assert.rejects(executeApprovedAdapter({manifest:m,approval:true,adapter:()=>{throw Error('should not call')}}),e=>e.code==='MANIFEST_TAMPERED')});
test('executor respects abort before adapter',async()=>{const m=compileProductionIntegration(base());const c=new AbortController();c.abort();await assert.rejects(executeApprovedAdapter({manifest:m,approval:true,adapter:()=>{throw Error('should not call')},signal:c.signal}),e=>e.code==='CANCELLED')});
test('executor fails closed without artifact evidence',async()=>{const m=compileProductionIntegration(base());await assert.rejects(executeApprovedAdapter({manifest:m,approval:true,adapter:async()=>({status:'OK'})}),e=>e.code==='ADAPTER_EVIDENCE_REQUIRED')});
test('executor passes exact manifest to approved adapter and labels reported evidence',async()=>{const m=compileProductionIntegration(base());let invoked=0;const out=await executeApprovedAdapter({manifest:m,approval:true,adapter:async p=>{invoked++;assert.deepEqual(p,m);return {status:'BUILT_AND_VERIFIED',artifact_sha256:'sha256:'+'1'.repeat(64),evidence:{artifact_sha256:'sha256:'+'1'.repeat(64),build_command:'cargo build --release',test_command:'cargo test',build_id:'build-123',test_status:'PASS'}}}});assert.equal(invoked,1);assert.equal(out.status,'EXTERNAL_ADAPTER_CLAIMS_VERIFIED_NOT_INDEPENDENTLY_CONFIRMED')});
test('adapter cannot report built without independent evidence bundle',async()=>{
 const m=compileProductionIntegration(base());await assert.rejects(executeApprovedAdapter({manifest:m,approval:true,
   adapter:async()=>({status:'BUILT_AND_VERIFIED',artifact_sha256:'sha256:'+'1'.repeat(64)})
 }),e=>e.code==='ADAPTER_EVIDENCE_REQUIRED');
});
