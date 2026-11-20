import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';

const ID=/^[a-z][a-z0-9_-]{1,63}$/;
const SHA=/^[0-9a-f]{64}$/;
const fail=(reason)=>{throw new Error('Training dataset: '+reason)};
const digest=s=>createHash('sha256').update(s).digest('hex');
const keys=(row,allowed)=>Object.keys(row).every(k=>allowed.includes(k));
export function normalizeExample(row){
 if(!row||typeof row!=='object'||Array.isArray(row)||!keys(row,['instruction','input','output','source','license']))fail('invalid row fields');
 for(const k of ['instruction','output','source','license'])if(typeof row[k]!=='string'||!row[k].trim())fail('missing '+k);
 if(row.input!==undefined&&typeof row.input!=='string')fail('invalid input');
 if(!/^[A-Za-z0-9][A-Za-z0-9-.+_]{0,79}$/.test(row.license))fail('license identifier');
 for(const k of ['instruction','input','output'])if(row[k]!==undefined&&(Buffer.byteLength(row[k])>8192||row[k].includes('\0')))fail('row too long');
 if(Buffer.byteLength(row.source)>512||Buffer.byteLength(row.license)>80)fail('provenance too long');
 const instruction=row.instruction.trim(),input=(row.input??'').trim(),output=row.output.trim();
 if(!instruction||!output)fail('empty content');
 return Object.freeze({instruction,input,output,source:row.source.trim(),license:row.license});
}
export function prepareExamples(jsonl,{evalPercent=20,minTrain=1,minEval=1}={}){
 if(typeof jsonl!=='string'||Buffer.byteLength(jsonl)>16777216||!Number.isInteger(evalPercent)||evalPercent<5||evalPercent>40||!Number.isInteger(minTrain)||minTrain<1||!Number.isInteger(minEval)||minEval<1)fail('input bounds');
 const lines=jsonl.split(/\r?\n/).filter(x=>x.trim());if(lines.length>10000||lines.length<minTrain+minEval)fail('dataset size');
 const unique=new Map();for(const line of lines){if(Buffer.byteLength(line)>24576)fail('line too long');let r;try{r=normalizeExample(JSON.parse(line))}catch(e){fail('invalid JSONL record: '+e.message)}
 const canonical=JSON.stringify(r),key=digest(JSON.stringify([r.instruction,r.input,r.output]));
 if(!unique.has(key))unique.set(key,{key,canonical,record:r});
 else if(unique.get(key).canonical!==canonical)fail('duplicate content with conflicting provenance');
 }
 const examples=[...unique.values()].sort((a,b)=>a.key.localeCompare(b.key,'en'));
 const train=[],evalRows=[];
 for(const e of examples){const bucket=parseInt(e.key.slice(0,8),16)%100;if(bucket<evalPercent)evalRows.push(e);else train.push(e)}
 if(train.length<minTrain||evalRows.length<minEval)fail('insufficient deterministic split; add distinct records');
 const encode=x=>x.map(e=>JSON.stringify({text:`Instruction:\n${e.record.instruction}\nInput:\n${e.record.input}\nResponse:\n${e.record.output}`})).join('\n')+'\n';
 const trainText=encode(train),evalText=encode(evalRows);
 return Object.freeze({trainText,evalText,manifest:Object.freeze({format:'omega-sft-v1',samples:examples.length,train:train.length,eval:evalRows.length,evalPercent,trainSha256:digest(trainText),evalSha256:digest(evalText),sourceSha256:digest(jsonl),sources:[...new Set(examples.map(e=>e.record.source))].sort(),licenses:[...new Set(examples.map(e=>e.record.license))].sort()})});
}
export async function writePreparedDataset(jsonl,outputDir,options={}){
 const result=prepareExamples(jsonl,options),dir=resolve(outputDir);
 // The output directory must not already exist; a prior dataset is never overwritten.
 try{await mkdir(dir,{mode:0o700})}catch{fail('destination must be new and parent must exist')}
 try{await Promise.all([['train.jsonl',result.trainText],['eval.jsonl',result.evalText],['manifest.json',JSON.stringify(result.manifest,null,2)+'\n']].map(([name,value])=>writeFile(join(dir,name),value,{mode:0o600,flag:'wx'})))}
 catch(e){await rm(dir,{recursive:true,force:true});throw e}
 return result.manifest;
}
export function validateTrainingConfig(config){
 if(!config||typeof config!=='object'||Array.isArray(config))fail('invalid config');
 const {runId,modelPath,maxSteps,seqLength,rank,alpha,dropout,learningRate,mode,seed}=config;
 if(typeof runId!=='string'||!ID.test(runId)||typeof modelPath!=='string'||!modelPath.startsWith('/')||modelPath.includes('\0'))fail('invalid run/model');
 for(const [v,lo,hi] of [[maxSteps,1,100000],[seqLength,128,8192],[rank,1,256],[alpha,1,1024],[seed,0,2147483647]])if(!Number.isSafeInteger(v)||v<lo||v>hi)fail('hyperparameter range');
 if(!Number.isFinite(dropout)||dropout<0||dropout>=1||!Number.isFinite(learningRate)||learningRate<=0||learningRate>0.01||!['lora','qlora'].includes(mode))fail('invalid optimizer/mode');
 return Object.freeze({runId,modelPath,maxSteps,seqLength,rank,alpha,dropout,learningRate,mode,seed});
}
export async function validatePreparedFiles(dir){const path=resolve(dir);const manifest=JSON.parse(await readFile(join(path,'manifest.json'),'utf8'));if(manifest.format!=='omega-sft-v1'||!SHA.test(manifest.trainSha256)||!SHA.test(manifest.evalSha256))fail('manifest invalid');for(const [file,key] of [['train.jsonl','trainSha256'],['eval.jsonl','evalSha256']]){const data=await readFile(join(path,file));if(data.length>16777216||digest(data)!==manifest[key])fail('tampered dataset')}return manifest}
