#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {assertProject,Workflow,compileIntentGraph,compileNarrative,planAdaptiveAudio} from './index.mjs';
const [command,path]=process.argv.slice(2);
try{
 if(command==='demo'){console.log(JSON.stringify({engine:'Aether Studio control plane',status:'REFERENCE_ONLY',brief:compileIntentGraph('A dark sci-fi horror story on a space station, gravity anomalies'),limitations:['No model generation','No executable engine build','No actor capture']},null,2));}
 else if(command==='validate'||command==='plan'){if(!path)throw Error('File required');const x=JSON.parse(readFileSync(path,'utf8'));assertProject(x);const result=command==='validate'?{status:'VALID',project_id:x.project_id}:{status:'PLAN_ONLY',ready:new Workflow(x).ready(),tasks:x.tasks.length};console.log(JSON.stringify(result,null,2));}
 else if(command==='audio'){const x=JSON.parse(readFileSync(path,'utf8'));console.log(JSON.stringify(planAdaptiveAudio(x),null,2));}
 else if(command==='narrative'){const x=JSON.parse(readFileSync(path,'utf8'));console.log(JSON.stringify(compileNarrative(x),null,2));}
 else{console.error('Usage: node src/cli.mjs demo|validate <project.json>|plan <project.json>|audio <audio.json>|narrative <graph.json>');process.exitCode=2}
}catch(error){console.error(JSON.stringify({error:error.name,message:error.message}));process.exitCode=1}
