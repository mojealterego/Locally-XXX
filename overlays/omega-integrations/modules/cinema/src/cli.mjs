#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {validateProject, streamWorld, planTasks, canonicalHash, calculateReadiness} from './core.mjs';
import {loadRoleCatalogue} from './roles.mjs';
import {buildCinematicInterchange,buildWorldInterchange} from './interchange.mjs';
import {shortestGeodesicPath} from './geodesic.mjs';
function main(args){
 const [cmd, file, ...rest]=args;
 if(!['validate','stream','plan','export-cinematic','export-world','route'].includes(cmd)||!file)throw new Error('Usage: node src/cli.mjs validate|stream|plan|export-cinematic|export-world|route <project.json> [args]');
 const project=JSON.parse(readFileSync(resolve(file),'utf8'));
 let result;
 if(cmd==='export-cinematic'){
   result=buildCinematicInterchange(project,rest[0]??'GODOT');
 }else if(cmd==='export-world'){
   result=buildWorldInterchange(project,rest[0]??'GODOT');
 }else if(cmd==='route'){
   if(rest.length!==2)throw new Error('route requires fromCellId toCellId');
   result=shortestGeodesicPath(project.world,rest[0],rest[1]);
 }else if(cmd==='validate'){
  result={projectId:project.projectId,validation:validateProject(project,loadRoleCatalogue()),readiness:calculateReadiness(project),sha256:canonicalHash(project)};
 }else if(cmd==='plan')result={projectId:project.projectId,taskOrder:planTasks(project.tasks)};
 else{
  const [x,y,mem]=rest.map(Number);
  if(rest.length!==3)throw new Error('stream requires x y budgetMiB');
  result=streamWorld(project.world,x,y,mem);
 }
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return (result.validation && !result.validation.ok)||result.ok===false ? 2:0;
}
try{process.exitCode=main(process.argv.slice(2));}catch(e){process.stderr.write(String(e?.message??e)+'\n');process.exitCode=1;}
