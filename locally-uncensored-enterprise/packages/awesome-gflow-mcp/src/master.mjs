import {createHash} from 'node:crypto';

const ID=/^[a-z][a-z0-9_-]{0,63}$/;
const PROJECT=/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const GCS=/^gs:\/\/[a-z0-9][a-z0-9._-]{2,61}\/(?:[a-zA-Z0-9_-]+\/){1,12}$/;
const MODEL=new Set(['veo-3.1-generate-001','veo-3.1-fast-generate-001']);
const DLP=/(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-proj-[a-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|(?:api[_-]?key|password|secret|authorization\s*:)\s*[=:]\s*\S{6,})/i;
const deny=()=>{throw Error('Invalid public scene manifest')};
const exact=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).sort().join(',')===keys.slice().sort().join(',');
const plain=(x,max)=>typeof x==='string'&&x.length>0&&x.length<=max&&Buffer.byteLength(x,'utf8')<=max*4&&!/[\x00-\x08\x0b-\x1f\x7f<>]/.test(x)&&!DLP.test(x);
const ident=(x)=>typeof x==='string'&&ID.test(x);
function clean(x){
 if(!exact(x,['version','projectId','metadata','entities','scenes'])||x.version!==1||typeof x.projectId!=='string'||!PROJECT.test(x.projectId))deny();
 const m=x.metadata;if(!exact(m,['model','aspectRatio','storageUri','classification'])||!MODEL.has(m.model)||!['16:9','9:16'].includes(m.aspectRatio)||m.classification!=='public'||typeof m.storageUri!=='string'||!GCS.test(m.storageUri)||m.storageUri.includes('..'))deny();
 if(!Array.isArray(x.entities)||x.entities.length>20||!Array.isArray(x.scenes)||x.scenes.length<1||x.scenes.length>24)deny();
 const entities=x.entities.map(e=>{if(!exact(e,['id','name','visualDescription'])||!ident(e.id)||!plain(e.name,80)||!plain(e.visualDescription,600))deny();return Object.freeze({id:e.id,name:e.name,visualDescription:e.visualDescription})});
 const ids=new Set(entities.map(e=>e.id));if(ids.size!==entities.length)deny();
 const scenes=x.scenes.map(s=>{if(!exact(s,['id','durationSeconds','actionPrompt'])||!ident(s.id)||![4,6,8].includes(s.durationSeconds)||!plain(s.actionPrompt,4000))deny();for(const tag of s.actionPrompt.matchAll(/@([a-z][a-z0-9_-]*)/g))if(!ids.has(tag[1]))deny();return Object.freeze({id:s.id,durationSeconds:s.durationSeconds,actionPrompt:s.actionPrompt})});
 if(new Set(scenes.map(s=>s.id)).size!==scenes.length)deny();
 return Object.freeze({version:1,projectId:x.projectId,metadata:Object.freeze({...m}),entities:Object.freeze(entities),scenes:Object.freeze(scenes)});
}
export const compileMaster=manifest=>clean(manifest);
export function compileScene(manifest,sceneId){const m=clean(manifest);if(!ident(sceneId))deny();const scene=m.scenes.find(s=>s.id===sceneId);if(!scene)deny();const used=[];const text=scene.actionPrompt.replace(/@([a-z][a-z0-9_-]*)/g,(_tag,id)=>{const e=m.entities.find(x=>x.id===id);if(!e)deny();if(!used.includes(id))used.push(id);return e.name});const context=used.map(id=>{const e=m.entities.find(x=>x.id===id);return `${e.name}: ${e.visualDescription}`}).join('\n');const prompt=(context?`Characters (visual consistency):\n${context}\n\n`:'')+'Scene action and camera: '+text;
 if(Buffer.byteLength(prompt,'utf8')>8192)deny();
 const compiled={projectId:m.projectId,model:m.metadata.model,storageUri:m.metadata.storageUri,aspectRatio:m.metadata.aspectRatio,classification:'public',sceneId:scene.id,durationSeconds:scene.durationSeconds,prompt};
 return Object.freeze({...compiled,sha256:createHash('sha256').update(JSON.stringify(compiled)).digest('hex')});
}
