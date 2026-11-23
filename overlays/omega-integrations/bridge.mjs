/**
 * OMEGA integration bridge v1: Aether Studio control plane -> P10 cinema manifests.
 * Produces planning artifacts only. No renderer, compiler or provider is invoked.
 * Node >=22, dependency-free. SPDX-License-Identifier: AGPL-3.0-only.
 */
import {
  assertProject, authorizeAsset, compileNarrative,
  planAdaptiveAudio, changeDirectorSettings, ValidationError,
} from './modules/studio/src/index.mjs';
import {
  validateProject, calculateReadiness, buildShotManifest, canonicalHash,
  planTasks, verifyNarrative,
} from './modules/cinema/src/core.mjs';
import {loadRoleCatalogue} from './modules/cinema/src/roles.mjs';

export class IntegrationError extends Error {
  constructor(code, details = '') { super(`${code}${details ? ': '+details : ''}`); this.name='IntegrationError'; this.code=code; }
}
const isPlain = value => value!==null && typeof value==='object' && !Array.isArray(value) && Object.getPrototypeOf(value)===Object.prototype;
const nonblank = value => typeof value==='string' && value.length>0 && value.length<=500 && value.trim().length>0;
function requirePlain(obj, code) { if(!isPlain(obj)) throw new IntegrationError(code); }
function checkedArray(value, max, code) { if(!Array.isArray(value)||value.length>max) throw new IntegrationError(code); }

/** Compiles verified *planning* manifests; never declares a compiled game. */
export function compileProductionIntegration(request) {
  requirePlain(request,'INVALID_REQUEST');
  const {studioProject,cinemaProject,assetRights,narrative,audioCue,sceneCrosswalk} = request;
  requirePlain(studioProject,'INVALID_STUDIO_PROJECT');
  requirePlain(cinemaProject,'INVALID_CINEMA_PROJECT');
  try { assertProject(studioProject); }
  catch(e){throw new IntegrationError('STUDIO_REJECTED',e.message);}
  if(studioProject.project_id!==cinemaProject.projectId)throw new IntegrationError('PROJECT_ID_MISMATCH');
  if(studioProject.rating==='CHILD' && cinemaProject.track!=='CHILD_ANIMATION')throw new IntegrationError('CHILD_TRACK_MISMATCH');
  if(cinemaProject.track==='CHILD_ANIMATION' && studioProject.rating!=='CHILD')throw new IntegrationError('CHILD_RATING_MISMATCH');
  if(cinemaProject.audience==='ADULT' && studioProject.rating==='CHILD')throw new IntegrationError('CHILD_AUDIENCE_CONFLICT');
  const checked=validateProject(cinemaProject,loadRoleCatalogue());
  if(!checked.ok)throw new IntegrationError('P10_REJECTED',checked.errors.join(','));
  checkedArray(assetRights,10_000,'INVALID_RIGHTS_LIST');
  const attestations=new Map();
  for(const item of assetRights){
    requirePlain(item,'INVALID_ATTESTATION');
    if(!nonblank(item.asset_id)||attestations.has(item.asset_id))throw new IntegrationError('DUPLICATE_OR_INVALID_ATTESTATION');
    try{authorizeAsset(item);}catch(e){throw new IntegrationError('RIGHTS_DENIED',e.message);}
    if(!/^sha256:[a-f0-9]{64}$/.test(item.hash??''))throw new IntegrationError('INVALID_ATTESTATION_HASH');
    attestations.set(item.asset_id,item);
  }
  for(const asset of cinemaProject.assets){
    const a=attestations.get(asset.id);
    if(!a || a.hash!==asset.hash)throw new IntegrationError('UNATTESTED_ASSET',asset.id);
  }
  for(const item of attestations.values()) {
    if(!cinemaProject.assets.some(asset=>asset.id===item.asset_id))throw new IntegrationError('ORPHAN_ATTESTATION',item.asset_id);
  }
  if(sceneCrosswalk!==undefined){
    requirePlain(sceneCrosswalk,'INVALID_SCENE_CROSSWALK');
    const ids=new Set(cinemaProject.narrative?.nodes?.map(n=>n.id)??[]);
    for(const [source,target] of Object.entries(sceneCrosswalk)) {
      if(!nonblank(source)||!nonblank(target)||!ids.has(target))throw new IntegrationError('INVALID_SCENE_LINK');
    }
  }
  let studioNarrative=null;
  if(narrative!==undefined){
    try{studioNarrative=compileNarrative(narrative);}catch(e){throw new IntegrationError('NARRATIVE_REJECTED',e.message);}
    if(sceneCrosswalk!==undefined){
      const ids=new Set(studioNarrative.nodes.map(n=>n.id));
      if(Object.keys(sceneCrosswalk).some(id=>!ids.has(id)))throw new IntegrationError('UNKNOWN_STUDIO_SCENE');
    }
  }
  let audioPlan=null;
  if(audioCue!==undefined){try{audioPlan=planAdaptiveAudio(audioCue);}catch(e){throw new IntegrationError('AUDIO_REJECTED',e.message);}}
  const narrativeCheck=cinemaProject.track==='GAME_CINEMATIC' ? verifyNarrative(cinemaProject.narrative):null;
  if(narrativeCheck&&!narrativeCheck.ok)throw new IntegrationError('P10_GRAPH_REJECTED',narrativeCheck.errors.join(','));
  const tasks=planTasks(cinemaProject.tasks);
  const readiness=calculateReadiness(cinemaProject);
  const shots=cinemaProject.shots.map(shot=>buildShotManifest(shot));
  const body={
    schema_version:'omega.integrated.production.v1',
    project_id:studioProject.project_id,
    tenant_id:studioProject.tenant_id,
    track:cinemaProject.track,
    source_revisions:{studio:studioProject.revision,cinema:cinemaProject.schemaVersion},
    status:'PLAN_ONLY_NOT_BUILT',
    release_state:readiness.canRelease?'PRECONDITIONS_MET_BUILD_NOT_VERIFIED':'BLOCKED_BY_RELEASE_GATES',
    release_issues:readiness.issues,
    tasks,
    scenes:shots,
    narrative:studioNarrative,
    audio:audioPlan,
    scene_crosswalk:sceneCrosswalk===undefined?null:structuredClone(sceneCrosswalk),
    asset_ids:cinemaProject.assets.map(a=>a.id).sort(),
    rights_attested_count:assetRights.length,
    engine_adapter:'NOT_CONNECTED',
    materialization:{renderer:'NOT_RUN',build:'NOT_RUN',qa_e2e:'NOT_RUN'},
  };
  return {...body, manifest_sha256:canonicalHash(body)};
}

/** Safe revision-aware re-directing: edits are pending approval, not applied. */
export function planDirectorChange(project, patch, expectedRevision) {
  try{return changeDirectorSettings(project,patch,expectedRevision)}
  catch(e){if(e instanceof ValidationError||e?.name==='NotAllowedError')throw new IntegrationError('DIRECTOR_REJECTED',e.message);throw e}
}

/** No external executor is started without an explicit adapter and authorization. */
export async function executeApprovedAdapter({manifest,adapter,approval,signal}) {
  requirePlain(manifest,'INVALID_MANIFEST');
  if(manifest.schema_version!=='omega.integrated.production.v1'||manifest.status!=='PLAN_ONLY_NOT_BUILT')throw new IntegrationError('MANIFEST_VERSION_REJECTED');
  const {manifest_sha256,...body}=manifest;
  if(manifest_sha256!==canonicalHash(body))throw new IntegrationError('MANIFEST_TAMPERED');
  if(approval!==true)throw new IntegrationError('HUMAN_APPROVAL_REQUIRED');
  if(signal?.aborted)throw new IntegrationError('CANCELLED');
  if(typeof adapter!=='function')throw new IntegrationError('ADAPTER_NOT_CONFIGURED');
  // Adapter owns actual renderer/build/test gates; no success is inferred from dispatch.
  const result=await adapter(structuredClone(manifest),{signal});
  requirePlain(result,'INVALID_ADAPTER_RESULT');
  if(result.status!=='BUILT_AND_VERIFIED'||!/^sha256:[a-f0-9]{64}$/.test(result.artifact_sha256??''))throw new IntegrationError('ADAPTER_EVIDENCE_REQUIRED');
  const ev=result.evidence;
  if(!isPlain(ev)||ev.artifact_sha256!==result.artifact_sha256 || !nonblank(ev.build_command)||!nonblank(ev.test_command)||!nonblank(ev.build_id)||ev.test_status!=='PASS')throw new IntegrationError('ADAPTER_EVIDENCE_REQUIRED');
  return {status:'EXTERNAL_ADAPTER_CLAIMS_VERIFIED_NOT_INDEPENDENTLY_CONFIRMED',artifact_sha256:result.artifact_sha256,adapter_evidence:structuredClone(ev)};
}
