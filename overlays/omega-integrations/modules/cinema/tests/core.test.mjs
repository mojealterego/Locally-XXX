import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 classifyAudience, validateProject, verifyNarrative, planTasks, streamWorld,
 makeLedger, appendLedger, verifyLedger, canonicalHash, validateShot, toSafeCsv,
 calculateReadiness, checkMinorCompliance, buildShotManifest, validateRoleAssignments
} from '../src/core.mjs';
import {loadRoleCatalogue} from '../src/roles.mjs';
const load = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
const roles=loadRoleCatalogue();

test('P10-001 four tracks valid for production',()=>{
 for(const track of ['FILM_TV','CHILD_ANIMATION','GAME_CINEMATIC','AAA_WORLD']) {
   assert.equal(classifyAudience({track,audience:'FAMILY',rating:'PG'}).ok,true)
 }
});
test('P10-002 prevent adult explicit content being tagged for children',()=>{
 assert.equal(classifyAudience({track:'FILM_TV',audience:'AGE_6_8',rating:'ADULT',explicit:true}).ok,false)
});
test('P10-003 explicit adult performer must be adult',()=>{
 assert.equal(classifyAudience({track:'FILM_TV',audience:'ADULT',rating:'ADULT',explicit:true,performers:[{id:'a',age:17}]}).ok,false)
});
test('P10-004 adult performer 18+ accepted with proper audience',()=>{
 assert.equal(classifyAudience({track:'FILM_TV',audience:'ADULT',rating:'ADULT',explicit:true,performers:[{id:'a',age:18}]}).ok,true)
});
test('P10-005 paid under16 requires authorizations PL',()=>{
 const r=checkMinorCompliance({jurisdiction:'PL',performers:[{id:'child',age:13,paid:true,documents:{guardianConsent:true}}]});
 assert.equal(r.ok,false); assert.ok(r.missing.includes('inspectorPermit'));
});
test('P10-006 under16 with required package accepted for workflow review, not legal certificate',()=>{
 const r=checkMinorCompliance({jurisdiction:'PL',performers:[{id:'child',age:13,paid:true,documents:{guardianConsent:true,inspectorPermit:true,psychOpinion:true,medicalClearance:true,schoolOpinion:true}}]});
 assert.equal(r.ok,true);assert.equal(r.legalCertification,false);
});
test('P10-007 crew job identifiers unique and present',()=>{
 assert.ok(roles.length>80);assert.equal(new Set(roles.map(x=>x.id)).size,roles.length);
});
test('P10-008 crew unknown role rejected',()=>{
 assert.equal(validateRoleAssignments([{personId:'operator',roleId:'UNKNOWN'}],roles).ok,false)
});
test('P10-009 film overlapping crew roles allowed where no conflicting person role duplicate',()=>{
 assert.equal(validateRoleAssignments([{personId:'operator',roleId:'DIRECTOR'},{personId:'operator',roleId:'PRODUCER'}],roles).ok,true)
});
test('P10-010 reject repeated same assignment',()=>{
 assert.equal(validateRoleAssignments([{personId:'a',roleId:'DIRECTOR'},{personId:'a',roleId:'DIRECTOR'}],roles).ok,false)
});
test('P10-011 narrative valid branching fail-forward',()=>{
 const n=load('project_cinematic.json').narrative;assert.equal(verifyNarrative(n).ok,true)
});
test('P10-012 narrative unknown target rejected',()=>{
 const n={root:'a',nodes:[{id:'a',ending:false,edges:[{to:'missing'}]}]};assert.equal(verifyNarrative(n).ok,false)
});
test('P10-013 narrative cycle rejected',()=>{
 const n={root:'a',nodes:[{id:'a',ending:false,edges:[{to:'b'}]},{id:'b',ending:false,edges:[{to:'a'}]}]};assert.ok(verifyNarrative(n).errors.some(x=>x.includes('CYCLE')))
});
test('P10-014 narrative unreachable ending rejected',()=>{
 const n={root:'a',nodes:[{id:'a',ending:true,edges:[]},{id:'b',ending:true,edges:[]}]};assert.equal(verifyNarrative(n).ok,false)
});
test('P10-015 narrative dead-end non-ending rejected',()=>{
 const n={root:'a',nodes:[{id:'a',ending:false,edges:[]}]};assert.equal(verifyNarrative(n).ok,false)
});
test('P10-016 qte requires explicit failure continuation',()=>{
 const n={root:'a',nodes:[{id:'a',ending:false,qte:true,edges:[{to:'end',outcome:'SUCCESS'}]},{id:'end',ending:true,edges:[]}]};assert.equal(verifyNarrative(n).ok,false)
});
test('P10-017 DAG tasks deterministic topological order',()=>{
 const a=[{id:'render',needs:['anim']},{id:'anim',needs:['rig']},{id:'rig',needs:[]}];assert.deepEqual(planTasks(a),['rig','anim','render']);
});
test('P10-018 DAG tasks cycle blocks production',()=>{
 assert.throws(()=>planTasks([{id:'a',needs:['b']},{id:'b',needs:['a']}]),/CYCLE/)
});
test('P10-019 DAG tasks unknown blocks production',()=>{
 assert.throws(()=>planTasks([{id:'a',needs:['b']}]),/UNKNOWN_DEP/)
});
test('P10-020 camera focal length must be physically plausible',()=>{
 assert.equal(validateShot({id:'s',fps:[24,1],durationFrames:120,camera:{focalLengthMm:0}}).ok,false)
});
test('P10-021 rational fps accepted, duration integer',()=>{
 assert.equal(validateShot({id:'s',fps:[24000,1001],durationFrames:120,camera:{focalLengthMm:35}}).ok,true)
});
test('P10-022 shot manifest hashes and immutable stable IDs',()=>{
 const a=buildShotManifest({id:'s',fps:[24,1],durationFrames:120,camera:{focalLengthMm:35}});assert.equal(a.contentHash,canonicalHash(a.shot));
});
test('P10-023 world stream enforces budget and stable proximity',()=>{
 const w=load('project_world.json').world;const s=streamWorld(w,120,64,256);assert.equal(s.ok,true);assert.ok(s.usedMiB<=256);assert.equal(s.cells[0].id,'w-1');
});
test('P10-024 insufficient world budget fails closed',()=>{
 const w=load('project_world.json').world;assert.equal(streamWorld(w,120,64,0).ok,false)
});
test('P10-025 duplicate world cell id rejected',()=>{
 const w=structuredClone(load('project_world.json').world);w.cells.push({...w.cells[0]});assert.equal(streamWorld(w,0,0,200).ok,false)
});
test('P10-026 ledger chain append and tamper detection',()=>{
 const l=makeLedger();appendLedger(l,'SCENE_CREATED',{scene:'one'});appendLedger(l,'SHOT_APPROVED',{id:'two'});assert.equal(verifyLedger(l),true);l.entries[0].payload.scene='attack';assert.equal(verifyLedger(l),false)
});
test('P10-027 canonical hash independent of object keys order',()=>{
 assert.equal(canonicalHash({b:1,a:{z:2,x:3}}),canonicalHash({a:{x:3,z:2},b:1}))
});
test('P10-028 CSV spreadsheet injection prevented',()=>{
 assert.match(toSafeCsv([['shot','=HYPERLINK("evil")']]),/'=HYPERLINK/)
});
test('P10-029 production readiness gated by signed-off masters and rights',()=>{
 assert.equal(calculateReadiness({tasks:[{id:'a',status:'DONE'}],rightsClearance:true,technicalQc:true,humanApproval:false}).canRelease,false)
});
test('P10-030 full validated media project is compilable',()=>{
 assert.equal(validateProject(load('project_cinematic.json'),roles).ok,true)
});
test('P10-031 child animation project requires additional safeguards',()=>{
 assert.equal(validateProject(load('project_child_animation.json'),roles).ok,true)
});
test('P10-032 AAA world project stays valid',()=>{
 assert.equal(validateProject(load('project_world.json'),roles).ok,true)
});
test('P10-033 film production project stays valid',()=>{
 assert.equal(validateProject(load('project_film.json'),roles).ok,true)
});
test('P10-034 explicit production requires adult label',()=>{
 const p=load('project_film.json');p.explicit=true;p.audience='FAMILY';assert.equal(validateProject(p,roles).ok,false)
});
test('P10-035 project with undefined asset refs fails',()=>{
 const p=load('project_cinematic.json');p.shots[0].assetRefs=['unknown'];assert.equal(validateProject(p,roles).ok,false)
});

test('P10-036 portable cinematic interchange uses rational frames without rounding',async()=>{
 const {buildCinematicInterchange}=await import('../src/interchange.mjs');
 const p=load('project_cinematic.json');const r=buildCinematicInterchange(p,'GODOT');
 assert.equal(r.engine,'GODOT');assert.equal(r.shots[0].startFrame,0);
 assert.equal(r.shots[1].startFrame,144);assert.deepEqual(r.shots[0].fps,[24,1]);
});
test('P10-037 unavailable engine rejects explicit interchange',async()=>{
 const {buildCinematicInterchange}=await import('../src/interchange.mjs');
 assert.throws(()=>buildCinematicInterchange(load('project_cinematic.json'),'NOT_A_REAL_ENGINE'),/UNSUPPORTED_ENGINE/);
});
test('P10-038 world interchange exports content-addressed cells',async()=>{
 const {buildWorldInterchange}=await import('../src/interchange.mjs');
 const r=buildWorldInterchange(load('project_world.json'),'GODOT');
 assert.equal(r.cells.length,4);assert.match(r.cells[0].assetHash,/^sha256:/);
});
test('P10-039 engine export must not silently accept wrong track',async()=>{
 const {buildCinematicInterchange}=await import('../src/interchange.mjs');
 assert.throws(()=>buildCinematicInterchange(load('project_world.json'),'GODOT'),/WRONG_TRACK/);
});
test('P10-040 geodesic route connects neighboring cells deterministically',async()=>{
 const {shortestGeodesicPath}=await import('../src/geodesic.mjs');
 const w=load('project_world.json').world;
 assert.deepEqual(shortestGeodesicPath(w,'w-0','w-3').path,['w-0','w-1','w-3']);
});
test('P10-041 terrain cost changes geodesic route',async()=>{
 const {shortestGeodesicPath}=await import('../src/geodesic.mjs');
 const w=structuredClone(load('project_world.json').world);w.cells.find(c=>c.id==='w-1').terrainCost=50;
 assert.deepEqual(shortestGeodesicPath(w,'w-0','w-3').path,['w-0','w-2','w-3']);
});
test('P10-042 disconnected world has no fabricated route',async()=>{
 const {shortestGeodesicPath}=await import('../src/geodesic.mjs');
 const w={cellSize:100,cells:[{id:'a',x:0,y:0},{id:'b',x:12,y:0}]};
 assert.equal(shortestGeodesicPath(w,'a','b').ok,false);
});
test('P10-043 reject negative traversal weights',async()=>{
 const {shortestGeodesicPath}=await import('../src/geodesic.mjs');
 const w=structuredClone(load('project_world.json').world);w.cells[1].terrainCost=-1;
 assert.equal(shortestGeodesicPath(w,'w-0','w-1').ok,false);
});
test('P10-044 mixed shot fps cannot be merged as raw frame indices',async()=>{
 const {buildCinematicInterchange}=await import('../src/interchange.mjs');
 const p=structuredClone(load('project_cinematic.json'));p.shots[1].fps=[25,1];
 assert.throws(()=>buildCinematicInterchange(p,'GODOT'),/MIXED_FPS_REQUIRE_CONFORM/);
});
test('P10-045 reject duplicate coordinates in world manifest',()=>{
 const w=structuredClone(load('project_world.json').world);w.cells[2].x=w.cells[0].x;w.cells[2].y=w.cells[0].y;
 assert.equal(streamWorld(w,0,0,500).ok,false);
});
test('P10-046 do not infer non-PL minor work authorization',()=>{
 const r=checkMinorCompliance({jurisdiction:'??',performers:[{id:'minor',age:10,paid:true,documents:{}}]});
 assert.equal(r.ok,false);
});
