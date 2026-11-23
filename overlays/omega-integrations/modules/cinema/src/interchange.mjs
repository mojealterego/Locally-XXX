/** Portable manifests for adapters; NO Godot/Unreal plugin or real engine scenes are emitted. */
import {canonicalHash,verifyNarrative,validateShot} from './core.mjs';
const ENGINES=new Set(['GODOT','UNREAL']);
function validateEngine(engine){if(!ENGINES.has(engine))throw new Error('UNSUPPORTED_ENGINE:'+engine);}
export function buildCinematicInterchange(project,engine){
 validateEngine(engine);
 if(project?.track!=='GAME_CINEMATIC')throw new Error('WRONG_TRACK:GAME_CINEMATIC_REQUIRED');
 const validation=verifyNarrative(project.narrative);
 if(!validation.ok)throw new Error('NARRATIVE_INVALID:'+validation.errors.join('|'));
 let startFrame=0;
 const sequenceFps=project.shots[0]?.fps;
 const shots=project.shots.map(s=>{
  const v=validateShot(s);if(!v.ok)throw new Error('INVALID_SHOT:'+v.errors.join('|'));
  if(s.fps[0]*sequenceFps[1]!==sequenceFps[0]*s.fps[1])throw new Error('MIXED_FPS_REQUIRE_CONFORM');
  const out={shotId:s.id,startFrame,durationFrames:s.durationFrames,fps:[...s.fps],camera:{...s.camera},assetRefs:[...(s.assetRefs??[])],narrativeNode:s.narrativeNode??null};
  startFrame+=s.durationFrames;
  return out;
 });
 const manifest={format:'omega.cinematic.interchange.v1',engine,projectId:project.projectId,shots,narrative:structuredClone(project.narrative),totalFrames:startFrame};
 return {...manifest,integrityHash:canonicalHash(manifest)};
}
export function buildWorldInterchange(project,engine){
 validateEngine(engine);
 if(project?.track!=='AAA_WORLD')throw new Error('WRONG_TRACK:AAA_WORLD_REQUIRED');
 const cells=project.world?.cells;
 if(!Array.isArray(cells))throw new Error('WORLD_CELLS_REQUIRED');
 const manifest={format:'omega.world.interchange.v1',engine,projectId:project.projectId,cellSize:project.world.cellSize,
  cells:cells.map(c=>({id:c.id,x:c.x,y:c.y,assetHash:c.assetHash,memoryMiB:c.memoryMiB}))};
 return {...manifest,integrityHash:canonicalHash(manifest)};
}
