import {compileScene} from './master.mjs';
import {ProviderFailure} from './vertex.mjs';
const DENIED=()=>{throw Error('Cloud video operation denied')};
export class FlowStudio{
 #jobs;#provider;#authorize;
 constructor({jobs,provider,authorize}={}){if(typeof jobs?.reserve!=='function'||typeof jobs?.get!=='function'||typeof provider?.generate!=='function'||typeof provider?.poll!=='function'||typeof authorize!=='function')DENIED();this.#jobs=jobs;this.#provider=provider;this.#authorize=authorize}
 async generate({tenant,manifest,sceneId,idempotencyKey,signal}={}){
  const compiled=compileScene(manifest,sceneId);
  if(await this.#authorize(Object.freeze({tenant,projectId:compiled.projectId,model:compiled.model,sceneId,action:'generate',digest:compiled.sha256,signal}))!==true||signal?.aborted)DENIED();
  const job=this.#jobs.reserve(tenant,idempotencyKey,compiled.sha256,compiled.model,compiled.storageUri);
  if(!job.created)return {state:job.state,operationName:job.operationName,artifactUri:job.artifactUri,failureCode:job.failureCode};
  try{const response=await this.#provider.generate(compiled,{signal});const saved=this.#jobs.transition(tenant,idempotencyKey,'SUBMITTING','SUBMITTED',{operationName:response.name});return {state:saved.state,operationName:saved.operationName}}
  catch{try{this.#jobs.transition(tenant,idempotencyKey,'SUBMITTING','UNKNOWN')}catch{}throw Error('Video submission outcome uncertain; manual reconciliation required')}
 }
 status({tenant,idempotencyKey}={}){const row=this.#jobs.get(tenant,idempotencyKey);if(!row)DENIED();return {state:row.state,operationName:row.operationName,artifactUri:row.artifactUri,failureCode:row.failureCode}}
 async poll({tenant,idempotencyKey,signal}={}){const row=this.#jobs.get(tenant,idempotencyKey);if(!row||!['SUBMITTED','RUNNING','SUCCEEDED','FAILED'].includes(row.state))DENIED();// Validate operation belongs to the same local job: never accept client-provided URLs or operation names.
  const match=/^projects\/([a-z][a-z0-9-]{4,28}[a-z0-9])\/locations\/us-central1\/publishers\/google\/models\/(veo-3\.1-(?:fast-)?generate-001)\/operations\/[a-zA-Z0-9_-]{8,128}$/.exec(row.operationName??'');if(!match||match[2]!==row.model)DENIED();
  if(await this.#authorize(Object.freeze({tenant,projectId:match[1],model:row.model,action:'read',idempotencyKey,signal}))!==true||signal?.aborted)DENIED();if(['SUCCEEDED','FAILED'].includes(row.state))return this.status({tenant,idempotencyKey});
  const status=await this.#provider.poll({projectId:match[1],model:row.model,operationName:row.operationName},{signal});
  if(status.artifactUri&&!status.artifactUri.startsWith(row.storagePrefix))DENIED();
  const stored=this.#jobs.transition(tenant,idempotencyKey,row.state,status.state,{artifactUri:status.artifactUri??null,failureCode:status.failureCode??null});return {state:stored.state,operationName:stored.operationName,artifactUri:stored.artifactUri,failureCode:stored.failureCode};
 }
 async pollUntilDone({tenant,idempotencyKey,attempts=8,baseDelayMs=1000,sleep=ms=>new Promise(r=>setTimeout(r,ms)),signal}={}){if(!Number.isSafeInteger(attempts)||attempts<1||attempts>20||!Number.isSafeInteger(baseDelayMs)||baseDelayMs<50||baseDelayMs>10000||typeof sleep!=='function')DENIED();let state;for(let i=0;i<attempts;i++){if(signal?.aborted)DENIED();try{state=await this.poll({tenant,idempotencyKey,signal})}catch(e){if(!(e instanceof ProviderFailure)||e.status!==429)throw e;state={state:'RUNNING'}}if(state.state!=='RUNNING')return state;if(i<attempts-1)await sleep(Math.min(30000,baseDelayMs*2**i))}return state}
}
