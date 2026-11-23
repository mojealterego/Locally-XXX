/** OMEGA P10 - deterministic reference contracts. Node.js >=22, no external dependencies.
 * NOT a game renderer, video editor, adult-content generator or a legal clearance service.
 */
import {createHash} from 'node:crypto';

const TRACKS=new Set(['FILM_TV','CHILD_ANIMATION','GAME_CINEMATIC','AAA_WORLD']);
const CHILD_AUDIENCES=new Set(['AGE_0_2','AGE_3_5','AGE_6_8','AGE_9_12','AGE_13_17']);
const AUDIENCES=new Set([...CHILD_AUDIENCES,'FAMILY','ADULT']);
const RATINGS=new Set(['G','PG','TEEN','ADULT']);
const SHA256=/^sha256:[0-9a-f]{64}$/;
const ID=/^[a-z][a-z0-9_-]{0,79}$/;
const ok=(errors,warnings=[])=>({ok:errors.length===0,errors,warnings});

function canon(v) {
 if(v===null || typeof v==='string' || typeof v==='boolean') return JSON.stringify(v);
 if(typeof v==='number') {
   if(!Number.isFinite(v)) throw new TypeError('NON_FINITE_NUMBER');
   return JSON.stringify(v);
 }
 if(Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
 if(typeof v==='object'){
   const keys=Object.keys(v).sort();
   if(keys.some(k=>k==='__proto__'||k==='constructor'))throw new Error('UNSAFE_KEY');
   return `{${keys.map(k=>`${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
 }
 throw new TypeError('UNSUPPORTED_CANONICAL_TYPE');
}
export const canonicalHash=(value)=>createHash('sha256').update(canon(value),'utf8').digest('hex');

export function classifyAudience(project){
 const errors=[];
 if(!TRACKS.has(project?.track))errors.push('UNKNOWN_PRODUCTION_TRACK');
 if(!AUDIENCES.has(project?.audience))errors.push('UNKNOWN_AUDIENCE');
 if(!RATINGS.has(project?.rating))errors.push('UNKNOWN_RATING');
 if(project?.track==='CHILD_ANIMATION' && project?.audience==='ADULT')errors.push('CHILD_CONTENT_AUDIENCE_CONFLICT');
 if(project?.track==='CHILD_ANIMATION' && project?.rating==='ADULT')errors.push('CHILD_ANIMATION_RATING_CONFLICT');
 if(project?.explicit===true){
   if(project?.rating!=='ADULT' || project?.audience!=='ADULT' || project?.track==='CHILD_ANIMATION')errors.push('EXPLICIT_CONTENT_RESTRICTED_TO_ADULT_PRODUCTION');
   for(const person of project?.performers??[]) if(!Number.isInteger(person.age) || person.age<18) errors.push('EXPLICIT_PERFORMER_MUST_BE_18_PLUS:'+String(person.id));
 }
 return ok(errors);
}

/** Presence of paperwork in a manifest is only a workflow precondition; requires independent verification. */
export function checkMinorCompliance(project){
 const errors=[];const missing=[];
 const performers=Array.isArray(project?.performers)?project.performers:[];
 for(const performer of performers){
   if(!Number.isInteger(performer.age)||performer.age<0||performer.age>120){errors.push('INVALID_PERFORMER_AGE:'+String(performer.id));continue;}
   if(performer.paid && performer.age<16 && project?.jurisdiction!=='PL'){errors.push('JURISDICTION_SPECIFIC_REVIEW_REQUIRED:'+String(performer.id));}
   if(project?.jurisdiction==='PL' && performer.paid && performer.age<16){
     const req=['guardianConsent','inspectorPermit','psychOpinion','medicalClearance'];
     if(performer.schoolOpinionRequired!==false)req.push('schoolOpinion');
     for(const k of req)if(performer.documents?.[k]!==true){missing.push(k);errors.push('MISSING_MINOR_WORK_DOCUMENT:'+performer.id+':'+k);}
   }
 }
 return {...ok(errors),missing,legalCertification:false};
}

export function validateRoleAssignments(assignments, catalogue){
 const errors=[];const validIds=new Set(catalogue.map(r=>r.id));const seen=new Set();
 if(!Array.isArray(assignments))return ok(['CREW_MUST_BE_ARRAY']);
 for(const a of assignments){
  if(typeof a?.personId!=='string'||!a.personId.trim())errors.push('EMPTY_PERSON_ID');
  if(!validIds.has(a?.roleId))errors.push('UNKNOWN_ROLE:'+String(a?.roleId));
  const k=`${a?.personId}|${a?.roleId}`;
  if(seen.has(k))errors.push('DUPLICATE_ROLE_ASSIGNMENT:'+k);
  seen.add(k);
 }
 return ok(errors);
}

export function planTasks(tasks){
 if(!Array.isArray(tasks))throw new Error('TASKS_MUST_BE_ARRAY');
 const nodes=new Map();
 for(const t of tasks){
  if(!t||typeof t.id!=='string'||!ID.test(t.id)||nodes.has(t.id))throw new Error('INVALID_OR_DUPLICATE_TASK_ID');
  if(!Array.isArray(t.needs)||t.needs.some(n=>typeof n!=='string'))throw new Error('INVALID_TASK_DEPENDENCIES');
  nodes.set(t.id,t);
 }
 const indegree=new Map([...nodes.keys()].map(k=>[k,0]));const next=new Map([...nodes.keys()].map(k=>[k,[]]));
 for(const t of nodes.values()){
  for(const dep of new Set(t.needs)){
   if(!nodes.has(dep))throw new Error(`UNKNOWN_DEP:${dep}`);
   indegree.set(t.id,indegree.get(t.id)+1);next.get(dep).push(t.id);
  }
 }
 const ready=[...nodes.keys()].filter(id=>indegree.get(id)===0).sort();const order=[];
 while(ready.length){
  const id=ready.shift();order.push(id);
  for(const child of next.get(id).sort()){
   indegree.set(child,indegree.get(child)-1);
   if(indegree.get(child)===0){ready.push(child);ready.sort();}
  }
 }
 if(order.length!==nodes.size)throw new Error('TASK_DEPENDENCY_CYCLE');
 return order;
}

export function verifyNarrative(narrative){
 const errors=[];
 if(!narrative || !Array.isArray(narrative.nodes))return ok(['NARRATIVE_INVALID']);
 const nodes=new Map();
 for(const node of narrative.nodes){
  if(!node?.id || nodes.has(node.id))errors.push('DUPLICATE_OR_EMPTY_NODE');
  else nodes.set(node.id,node);
 }
 if(!nodes.has(narrative.root))errors.push('ROOT_MISSING');
 for(const node of nodes.values()){
  if(!Array.isArray(node.edges)){errors.push('EDGES_INVALID:'+node.id);continue;}
  if(node.ending && node.edges.length)errors.push('ENDING_HAS_EDGES:'+node.id);
  if(!node.ending && !node.edges.length)errors.push('DEAD_END:'+node.id);
  for(const e of node.edges)if(!nodes.has(e?.to))errors.push('UNKNOWN_TARGET:'+node.id+':'+e?.to);
  if(node.qte && (!node.edges.some(e=>e.outcome==='SUCCESS')||!node.edges.some(e=>e.outcome==='FAILURE'))){
   errors.push('QTE_MISSING_SUCCESS_OR_FAILURE_PATH:'+node.id);
  }
 }
 const color=new Map();const reached=new Set();
 function visit(id){
  const state=color.get(id)||0;
  if(state===1){errors.push('NARRATIVE_CYCLE:'+id);return;}
  if(state===2)return;
  color.set(id,1);reached.add(id);
  for(const edge of nodes.get(id)?.edges??[])if(nodes.has(edge.to))visit(edge.to);
  color.set(id,2);
 }
 if(nodes.has(narrative.root))visit(narrative.root);
 for(const id of nodes.keys())if(!reached.has(id))errors.push('UNREACHABLE_NODE:'+id);
 return ok([...new Set(errors)]);
}

export function validateShot(shot){
 const errors=[];
 if(!shot?.id || typeof shot.id!=='string')errors.push('SHOT_ID_REQUIRED');
 if(!Array.isArray(shot?.fps)||shot.fps.length!==2||!shot.fps.every(x=>Number.isSafeInteger(x)&&x>0))errors.push('INVALID_RATIONAL_FPS');
 if(!Number.isSafeInteger(shot?.durationFrames)||shot.durationFrames<=0)errors.push('INVALID_SHOT_DURATION_FRAMES');
 if(!Number.isFinite(shot?.camera?.focalLengthMm)||shot.camera.focalLengthMm<=0||shot.camera.focalLengthMm>2000)errors.push('INVALID_FOCAL_LENGTH');
 if(shot?.camera?.fStop!==undefined && (!(shot.camera.fStop>0) || !Number.isFinite(shot.camera.fStop)))errors.push('INVALID_FSTOP');
 if(shot?.assetRefs!==undefined&&!Array.isArray(shot.assetRefs))errors.push('INVALID_ASSET_REFS');
 return ok(errors);
}
export function buildShotManifest(shot){
 const report=validateShot(shot);if(!report.ok)throw new Error(report.errors.join(';'));
 const frozen=structuredClone(shot);
 return {schemaVersion:'1.0',shot:frozen,contentHash:canonicalHash(frozen),durationSeconds:(shot.durationFrames*shot.fps[1])/shot.fps[0]};
}

/** Content-addressed world tile selection. A geometrical approximation, not a renderer. */
export function streamWorld(world,cameraX,cameraY,budgetMiB){
 const errors=[];
 if(!world||!Number.isFinite(world.cellSize)||world.cellSize<=0)errors.push('INVALID_CELL_SIZE');
 if(!Array.isArray(world?.cells))errors.push('CELLS_MUST_BE_ARRAY');
 if(!Number.isFinite(cameraX)||!Number.isFinite(cameraY))errors.push('INVALID_CAMERA');
 if(!Number.isSafeInteger(budgetMiB)||budgetMiB<=0)errors.push('INVALID_BUDGET');
 if(errors.length)return {...ok(errors),cells:[],usedMiB:0};
 const ids=new Set(); const coords=new Set();
 for(const c of world.cells){
  if(typeof c.id!=='string'||ids.has(c.id))errors.push('DUPLICATE_OR_INVALID_CELL_ID');
  ids.add(c.id);
  const coordKey=`${c.x}:${c.y}`;if(coords.has(coordKey))errors.push('DUPLICATE_CELL_COORDINATES');coords.add(coordKey);
  if(!Number.isSafeInteger(c.x)||!Number.isSafeInteger(c.y)||!Number.isSafeInteger(c.memoryMiB)||c.memoryMiB<=0)errors.push('INVALID_CELL_GEOMETRY:'+c.id);
  if(!SHA256.test(c.assetHash))errors.push('INVALID_CELL_HASH:'+c.id);
 }
 if(errors.length)return {...ok(errors),cells:[],usedMiB:0};
 const ordered=world.cells.map(c=>({...c,distanceSquared:(cameraX-c.x*world.cellSize)**2+(cameraY-c.y*world.cellSize)**2}))
   .sort((a,b)=>a.distanceSquared-b.distanceSquared || a.id.localeCompare(b.id,'en'));
 if(ordered.length && ordered[0].memoryMiB>budgetMiB)return {...ok(['NEAREST_CELL_EXCEEDS_BUDGET']),cells:[],usedMiB:0};
 const loaded=[];let usedMiB=0;
 for(const c of ordered)if(usedMiB+c.memoryMiB<=budgetMiB){usedMiB+=c.memoryMiB;loaded.push(c);}
 return {...ok([]),cells:loaded,usedMiB};
}

export function makeLedger(){return {schemaVersion:'1.0',entries:[]};}
export function appendLedger(ledger,domain,payload){
 if(typeof domain!=='string'||!domain || !ledger || !Array.isArray(ledger.entries))throw new Error('INVALID_LEDGER');
 if(!verifyLedger(ledger))throw new Error('LEDGER_CORRUPTED');
 const copy=structuredClone(payload);
 const index=ledger.entries.length;
 const previousHash=index?ledger.entries[index-1].entryHash:'0'.repeat(64);
 const entry={index,previousHash,domain,payload:copy};
 entry.entryHash=canonicalHash(entry);
 ledger.entries.push(entry);
 return structuredClone(entry);
}
export function verifyLedger(ledger){
 if(!Array.isArray(ledger?.entries))return false;
 let previousHash='0'.repeat(64);
 for(const [i,e] of ledger.entries.entries()){
   if(e?.index!==i||e?.previousHash!==previousHash||typeof e?.entryHash!=='string')return false;
   const {entryHash,...rest}=e;
   try{if(canonicalHash(rest)!==entryHash)return false;}catch{return false;}
   previousHash=entryHash;
 }
 return true;
}

export function calculateReadiness(project){
 const issues=[];
 if(!project?.rightsClearance)issues.push('RIGHTS_CLEARANCE_NOT_APPROVED');
 if(!project?.technicalQc)issues.push('TECHNICAL_QC_NOT_APPROVED');
 if(!project?.humanApproval)issues.push('HUMAN_APPROVAL_REQUIRED');
 if(!Array.isArray(project?.tasks)||project.tasks.some(t=>t.status!=='DONE'))issues.push('PRODUCTION_TASKS_NOT_COMPLETE');
 return {canRelease:issues.length===0,issues};
}

export function toSafeCsv(rows){
 const escapeValue=(v)=>{
  let text=String(v??'');
  if(/^[\s\uFEFF]*[=+@\-\t\r]/u.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
 };
 return rows.map(row=>row.map(escapeValue).join(',')).join('\r\n')+'\r\n';
}

export function validateProject(project,roleCatalogue){
 const errors=[];const warnings=[];
 if(!project||typeof project!=='object'||Array.isArray(project))return ok(['PROJECT_NOT_OBJECT']);
 if(project.schemaVersion!=='1.0')errors.push('UNSUPPORTED_SCHEMA_VERSION');
 if(!ID.test(project.projectId??''))errors.push('INVALID_PROJECT_ID');
 if(!project.name || typeof project.name!=='string')errors.push('INVALID_PROJECT_NAME');
 errors.push(...classifyAudience(project).errors);
 errors.push(...validateRoleAssignments(project.crew,roleCatalogue).errors);
 errors.push(...checkMinorCompliance(project).errors);
 if(project.track==='CHILD_ANIMATION'){
  for(const k of ['editorialReview','guardianReview','accessibilityReview'])if(project.childSafeguarding?.[k]!==true)errors.push('CHILD_SAFEGUARDING_MISSING:'+k);
 }
 try{planTasks(project.tasks);}catch(e){errors.push('TASK_PIPELINE:'+e.message);}
 const assetIds=new Set();
 if(!Array.isArray(project.assets))errors.push('ASSETS_MUST_BE_ARRAY');
 else for(const asset of project.assets){
   if(!asset?.id || assetIds.has(asset.id))errors.push('INVALID_OR_DUPLICATE_ASSET_ID');
   assetIds.add(asset?.id);
   if(!SHA256.test(asset.hash))errors.push('INVALID_ASSET_HASH:'+asset.id);
 }
 const shotIds=new Set();
 if(!Array.isArray(project.shots))errors.push('SHOTS_MUST_BE_ARRAY');
 else for(const shot of project.shots){
  errors.push(...validateShot(shot).errors.map(e=>shot.id+':'+e));
  if(shotIds.has(shot.id))errors.push('DUPLICATE_SHOT_ID:'+shot.id);
  shotIds.add(shot.id);
  for(const ref of shot.assetRefs??[])if(!assetIds.has(ref))errors.push('UNKNOWN_SHOT_ASSET:'+shot.id+':'+ref);
 }
 if(project.track==='GAME_CINEMATIC'){
   const v=verifyNarrative(project.narrative);errors.push(...v.errors);
   const validIds=new Set(project.narrative?.nodes?.map(n=>n.id)??[]);
   for(const shot of project.shots??[])if(shot.narrativeNode && !validIds.has(shot.narrativeNode))errors.push('UNKNOWN_SHOT_NARRATIVE_NODE:'+shot.id);
 }
 if(project.track==='AAA_WORLD'){
  const w=streamWorld(project.world,0,0,Number.MAX_SAFE_INTEGER);
  errors.push(...w.errors.map(e=>'WORLD:'+e));
 }
 if(!project.rightsClearance)warnings.push('RIGHTS_CLEARANCE_PENDING');
 if(!project.technicalQc)warnings.push('TECHNICAL_QC_PENDING');
 if(!project.humanApproval)warnings.push('HUMAN_APPROVAL_PENDING');
 return ok([...new Set(errors)],warnings);
}
