import {ValidationError,NotAllowedError,isObj,nonblank,assert} from './contracts.mjs';
export {ValidationError,NotAllowedError} from './contracts.mjs';
export {compileNarrative,decideNextScene} from './narrative.mjs';
/** Aether Studio control-plane reference. Does not render or compile AAA games. Node >=22. */
import {createHmac, createHash, timingSafeEqual} from 'node:crypto';
import {existsSync,openSync,closeSync,readFileSync,writeSync,fsyncSync} from 'node:fs';

const AGENTS=new Set(['DIRECTOR','NARRATIVE','ART','SYSTEMS','INTEGRATOR','QA','PROFILER','RELEASE','AUDIO']);
const KINDS=new Set(['TASK_ASSIGN','TASK_RESULT','QA_RESULT','ASSET_REFERENCE','RELEASE_REQUEST','CONTROL_UPDATE']);
function canonical(x){
  if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
  if(x!==null&&typeof x==='object'){
    assert(isObj(x),'Only plain JSON objects allowed');
    return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
  }
  assert(x===null||['string','number','boolean'].includes(typeof x),'Non-JSON value');
  if(typeof x==='number')assert(Number.isFinite(x),'Non-finite JSON number');
  return JSON.stringify(x);
}
export const sha256Hex=x=>createHash('sha256').update(x).digest('hex');
const mac=(secret,x)=>createHmac('sha256',secret).update(canonical(x)).digest('hex');
function safeCompareHex(a,b){if(typeof a!=='string'||typeof b!=='string'||!/^[a-f0-9]{64}$/.test(a)||!/^[a-f0-9]{64}$/.test(b))return false;return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'))}
function assertEnvelope(input){
 assert(isObj(input),'packet must be plain object');assert(input.schema_version==='1.0','Unsupported NeuroBus schema version');
 for(const k of ['packet_id','tenant_id','project_id','source_agent','target_agent','kind','idempotency_key'])assert(nonblank(input[k]),'Invalid envelope '+k);
 assert(/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(input.packet_id),'Invalid packet UUID');
 assert(AGENTS.has(input.source_agent)&&AGENTS.has(input.target_agent),'Unknown agent');
 assert(KINDS.has(input.kind),'Unknown packet kind');
 assert(Number.isSafeInteger(input.issued_at_ms)&&input.issued_at_ms>=0,'Invalid timestamp');
 assert(Number.isSafeInteger(input.ttl_ms)&&input.ttl_ms>=100&&input.ttl_ms<=3_600_000,'Invalid TTL');
 assert(isObj(input.payload),'Invalid payload');
 assert(Array.isArray(input.attachments)&&input.attachments.length<=32,'Invalid attachments');
 for(const a of input.attachments){assert(isObj(a)&&Object.keys(a).every(k=>['asset_id','sha256','media_type','bytes'].includes(k)),'Attachment must be a content-addressed asset descriptor');assert(nonblank(a.asset_id)&&/^[a-f0-9]{64}$/.test(a.sha256)&&nonblank(a.media_type)&&Number.isSafeInteger(a.bytes)&&a.bytes>=0,'Invalid attachment descriptor')}
 const d=input.dramatic_context;
 if(d!==undefined){assert(isObj(d)&&nonblank(d.scene_id)&&typeof d.emotional_tone==='string'&&d.emotional_tone.length<=120,'Invalid dramatic context');assert(Number.isFinite(d.tension_index)&&d.tension_index>=0&&d.tension_index<=1,'Invalid tension');assert(Array.isArray(d.player_choice_butterfly_effect_vector)&&d.player_choice_butterfly_effect_vector.length===4&&d.player_choice_butterfly_effect_vector.every(v=>Number.isFinite(v)&&Math.abs(v)<=1),'Invalid butterfly effect vector')}
 canonical(input);
}
export function createEnvelope(packet,secret){assert(nonblank(secret),'HMAC key required');assertEnvelope(packet);const body=structuredClone(packet);return {...body,mac_sha256:mac(secret,body)}}
export function verifyEnvelope(packet,secret,now=Date.now()){
 assert(isObj(packet),'Invalid signed envelope');const {mac_sha256,...body}=packet;
 assertEnvelope(body);if(!safeCompareHex(mac_sha256,mac(secret,body)))throw new NotAllowedError('Envelope HMAC mismatch');
 if(now<body.issued_at_ms||now>body.issued_at_ms+body.ttl_ms)throw new NotAllowedError('Envelope outside validity interval');
 return structuredClone(body);
}
/** Single-writer, local append-only HMAC journal; NOT a distributed multi-writer log. */
export class EventJournal{
 constructor(file,secret){assert(nonblank(secret),'Journal secret required');this.file=file;this.secret=secret;this.entries=[];this.byIdempotency=new Map();this.head='0'.repeat(64);if(existsSync(file)){
    const raw=readFileSync(file,'utf8');if(raw.length&&!raw.endsWith('\n'))throw new NotAllowedError('Journal contains partial record');
    for(const line of raw.split('\n').filter(Boolean)){
      let entry;try{entry=JSON.parse(line)}catch{throw new NotAllowedError('Corrupt journal JSON')}
      const {mac_sha256,...body}=entry;
      if(body.seq!==this.entries.length+1||body.prev_sha256!==this.head||!safeCompareHex(mac_sha256,mac(secret,body)))throw new NotAllowedError('Journal integrity mismatch');
      this._remember(body.event);this.entries.push(body);this.head=sha256Hex(canonical(entry));
    }
  }}
 _remember(event){assert(isObj(event)&&nonblank(event.idempotency_key)&&nonblank(event.type)&&nonblank(event.project_id)&&nonblank(event.tenant_id)&&nonblank(event.task_id),'Invalid journal event');const e=this.byIdempotency.get(event.idempotency_key);if(e&&canonical(e)!==canonical(event))throw new NotAllowedError('Idempotency key collision');if(e)throw new NotAllowedError('Duplicate journal line');this.byIdempotency.set(event.idempotency_key,event)}
 append(event){assert(isObj(event)&&nonblank(event.idempotency_key),'Invalid event');const e=this.byIdempotency.get(event.idempotency_key);if(e){if(canonical(e)===canonical(event))return false;throw new NotAllowedError('Idempotency key collision')}
  for(const k of ['type','project_id','tenant_id','task_id'])assert(nonblank(event[k]),'Invalid journal event '+k);canonical(event);
  const body={seq:this.entries.length+1,prev_sha256:this.head,event:structuredClone(event)};
  const entry={...body,mac_sha256:mac(this.secret,body)};
  const fd=openSync(this.file,'a',0o600);
  try{writeSync(fd,canonical(entry)+'\n');fsyncSync(fd)}finally{closeSync(fd)}
  this.entries.push(body);this.byIdempotency.set(event.idempotency_key,structuredClone(event));this.head=sha256Hex(canonical(entry));return true;
 }
}
function validateTasks(tasks){
 assert(Array.isArray(tasks)&&tasks.length>0&&tasks.length<=200,'Tasks must be 1..200');const ids=new Set();
 for(const t of tasks){assert(isObj(t)&&nonblank(t.id)&&nonblank(t.agent)&&AGENTS.has(t.agent),'Invalid task');assert(!ids.has(t.id),'Duplicate task identifier');ids.add(t.id);assert(nonblank(t.kind)&&Array.isArray(t.dependencies)&&Number.isFinite(t.cost_units)&&t.cost_units>=0&&t.cost_units<=1e7,'Invalid task workload')}
 for(const t of tasks)for(const dep of t.dependencies)assert(ids.has(dep)&&dep!==t.id,'Unknown or self dependency');
 const state=new Map();const map=new Map(tasks.map(t=>[t.id,t]));
 function visit(id){if(state.get(id)==='active')throw new ValidationError('Cyclic dependency graph');if(state.get(id)==='done')return;state.set(id,'active');for(const dep of map.get(id).dependencies)visit(dep);state.set(id,'done')}
 for(const t of tasks)visit(t.id);
}
export function assertProject(p){
 assert(isObj(p)&&p.schema_version==='1.0','Project schema version must be 1.0');
 for(const k of ['project_id','tenant_id','title','target_engine'])assert(nonblank(p[k]),'Invalid '+k);
 assert(['CHILD','TEEN','MATURE','ADULT'].includes(p.rating),'Explicit content rating required');
 assert(Number.isFinite(p.compute_budget_units)&&p.compute_budget_units>=0&&p.compute_budget_units<=1e7,'Invalid compute budget');
 assert(Number.isSafeInteger(p.revision)&&p.revision>=1,'Invalid revision');
 assert(Array.isArray(p.tags)&&p.tags.length<=64&&p.tags.every(nonblank),'Invalid project tags');
 if(p.rating==='CHILD'&&p.tags.some(t=>/adult|explicit|violence-extreme|sexual/i.test(t)))throw new NotAllowedError('Age suitability mismatch');
 assert(isObj(p.style_profile)&&Array.isArray(p.style_profile.palette)&&p.style_profile.palette.every(x=>/^#[0-9a-fA-F]{6}$/.test(x)),'Invalid style profile');
 assert(Number.isFinite(p.style_profile.realism)&&p.style_profile.realism>=0&&p.style_profile.realism<=1&&nonblank(p.style_profile.lighting),'Invalid style metrics');
 assert(isObj(p.content_rights)&&typeof p.content_rights.voice_consent==='boolean'&&typeof p.content_rights.likeness_consent==='boolean'&&Array.isArray(p.content_rights.licenses),'Invalid rights manifest');
 validateTasks(p.tasks);canonical(p);return true;
}
export class Workflow{
 constructor(project,options={}){assertProject(project);this.project=structuredClone(project);this.max_attempts=options.max_attempts??3;assert(Number.isSafeInteger(this.max_attempts)&&this.max_attempts>=1&&this.max_attempts<=10,'Invalid attempt budget');this.states=new Map(project.tasks.map(t=>[t.id,{status:'PENDING',attempts:0,digest:null}]));this.spent=0;this.approver=null;}
 task(id){const t=this.project.tasks.find(x=>x.id===id);if(!t)throw new ValidationError('Unknown task');return t}
 state(id){this.task(id);return this.states.get(id).status}
 ready(){return this.project.tasks.filter(t=>this.states.get(t.id).status==='PENDING'&&t.dependencies.every(d=>this.states.get(d).status==='PASS'))}
 start(id){const t=this.task(id),s=this.states.get(id);if(s.status!=='PENDING'||!t.dependencies.every(d=>this.states.get(d).status==='PASS'))throw new NotAllowedError('Task not ready');if(this.spent+t.cost_units>this.project.compute_budget_units)throw new NotAllowedError('Compute budget exceeded');this.spent+=t.cost_units;s.attempts++;s.status='RUNNING';return {id,attempt:s.attempts,spent:this.spent};}
 complete(id,passed,digest){this.task(id);const s=this.states.get(id);if(s.status!=='RUNNING')throw new NotAllowedError('Task not running');assert(typeof passed==='boolean','Pass must be boolean');if(passed)assert(typeof digest==='string'&&/^sha256:[a-f0-9]{64}$/.test(digest),'Invalid artifact digest');s.digest=passed?digest:null;s.status=passed?'PASS':(s.attempts<this.max_attempts?'PENDING':'BLOCKED');return s.status}
 approveRelease(actor){assert(nonblank(actor),'Approver required');this.approver=actor}
 release(){if(!this.project.tasks.every(t=>this.states.get(t.id).status==='PASS')||!this.approver)throw new NotAllowedError('Cannot release without tests and human approval');return {status:'PLAN_APPROVED_NOT_BUILT',approved_by:this.approver,artifact_digests:Object.fromEntries([...this.states].map(([k,v])=>[k,v.digest]))}}
}
export function compileIntentGraph(text){assert(typeof text==='string'&&text.length>0&&text.length<100_000,'Invalid brief');const t=text.toLowerCase();const evidence=[];const find=(regex,tag)=>{if(regex.test(t)){evidence.push({rule:tag,source:'brief'});return true}return false};const scifi=find(/sci[ -]?fi|space|cosmic|kosmicz|stacji kosmiczn/,'sci-fi');const horror=find(/horror|terr(or|or)|groz|strasz/,'horror');const gravity=find(/gravit|grawit|anomal/,'gravity');return {schema_version:'1.0',theme:scifi&&horror?'sci-fi-horror':scifi?'sci-fi':horror?'horror':'unspecified',gravity:gravity?'anomalous':'unspecified',confidence:'rule-based-low',evidence};}
export function authorizeAsset(a){assert(isObj(a)&&nonblank(a.type)&&nonblank(a.owner),'Invalid asset');if(!nonblank(a.license))throw new NotAllowedError('Explicit asset license required');if(['voice_clone','face_capture','performance_capture','likeness'].includes(a.type)&&a.consent!==true)throw new NotAllowedError('Explicit performer rights required');return true;}
export function planAdaptiveAudio(input){assert(isObj(input),'Invalid audio cue');const {bpm,beats_per_bar,now_ms,from,to,intensity,stems}=input;assert(Number.isFinite(bpm)&&bpm>=40&&bpm<=240,'Invalid BPM');assert([2,3,4,5,6,7,8,9,12].includes(beats_per_bar),'Invalid meter');assert(Number.isFinite(now_ms)&&now_ms>=0&&now_ms<1e12,'Invalid time');assert(nonblank(from)&&nonblank(to),'Invalid segment');assert(Number.isFinite(intensity)&&intensity>=0&&intensity<=1,'Invalid intensity');assert(Array.isArray(stems)&&stems.length<=32&&stems.every(nonblank),'Invalid stems');const bar=60_000/bpm*beats_per_bar;const switch_at_ms=Math.ceil((now_ms+1e-9)/bar)*bar;return {transition:'BAR_QUANTIZED',from,to,bpm,beats_per_bar,switch_at_ms,stem_mix:Object.fromEntries(stems.map((s,i)=>[s,Math.min(1,Math.max(0,intensity*(i===0?1:0.8)))]))}}
export function changeDirectorSettings(project,change,expectedRevision){assertProject(project);if(expectedRevision!==project.revision)throw new NotAllowedError('Optimistic revision conflict');assert(isObj(change)&&Object.keys(change).length>0,'Invalid patch');for(const [k,v] of Object.entries(change))assert(['tension','world_brutality','empathy','pace'].includes(k)&&Number.isFinite(v)&&v>=0&&v<=1,'Invalid director control');return {project_id:project.project_id,revision:project.revision+1,settings:structuredClone(change),change_status:'PENDING_APPROVAL',invalidated:project.tasks.map(t=>t.id)}}
