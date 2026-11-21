const MODELS=new Set(['veo-3.1-generate-001','veo-3.1-fast-generate-001']);
const PROJECT=/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const deny=()=>{throw Error('Untrusted provider payload')};
export class ProviderFailure extends Error {constructor(code){super('Google Vertex operation unavailable');this.name='ProviderFailure';this.status=code}}
function endpoint(projectId,model,suffix){if(typeof projectId!=='string'||!PROJECT.test(projectId)||!MODELS.has(model))deny();return `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/${model}:${suffix}`}
function opPrefix(projectId,model){return `projects/${projectId}/locations/us-central1/publishers/google/models/${model}/operations/`}
function operation(name,projectId,model){const pre=opPrefix(projectId,model);if(typeof name!=='string'||!name.startsWith(pre)||!/^[-a-zA-Z0-9_]{8,128}$/.test(name.slice(pre.length)))deny();return name}
export class VertexVeo {
 #enabled;#fetch;#token;#timeout;
 constructor({enabled=false,fetchImpl=fetch,tokenProvider,timeoutMs=20000}={}){if(typeof enabled!=='boolean'||typeof fetchImpl!=='function'||typeof tokenProvider!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>60000)deny();this.#enabled=enabled;this.#fetch=fetchImpl;this.#token=tokenProvider;this.#timeout=timeoutMs}
 async #call(projectId,model,endpointName,payload,signal){if(!this.#enabled)throw Error('Video provider disabled');const token=await this.#token();if(typeof token!=='string'||token.length<8||token.length>8192||/[\x00-\x20\x7f]/.test(token))deny();let r;
  try{r=await this.#fetch(endpoint(projectId,model,endpointName),{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',accept:'application/json'},body:JSON.stringify(payload),redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(this.#timeout)]):AbortSignal.timeout(this.#timeout)})}
  catch{throw new ProviderFailure(0)}
  if(!r||!r.ok)throw new ProviderFailure(Number.isInteger(r?.status)?r.status:0);
  if(r.headers?.get('content-type')?.split(';')[0].trim()!=='application/json')deny();if(!r.body||typeof r.body.getReader!=='function')deny();const reader=r.body.getReader();let body='',size=0;const decoder=new TextDecoder('utf8',{fatal:true});try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>262144)deny();body+=decoder.decode(part.value,{stream:true})}body+=decoder.decode()}finally{try{await reader.cancel()}catch{}reader.releaseLock()}let parsed;try{parsed=JSON.parse(body)}catch{deny()}if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))deny();return parsed;
 }
 async generate(compiled,{signal}={}){if(!compiled||compiled.classification!=='public'||!Number.isSafeInteger(compiled.durationSeconds)||![4,6,8].includes(compiled.durationSeconds)||!['16:9','9:16'].includes(compiled.aspectRatio)||typeof compiled.prompt!=='string'||!compiled.prompt.length||Buffer.byteLength(compiled.prompt)>8192||typeof compiled.storageUri!=='string'||!/^gs:\/\/[a-z0-9._-]+\/[a-zA-Z0-9_/-]+\/$/.test(compiled.storageUri))deny();const body={instances:[{prompt:compiled.prompt}],parameters:{storageUri:compiled.storageUri,sampleCount:1,aspectRatio:compiled.aspectRatio,durationSeconds:compiled.durationSeconds}};
  const response=await this.#call(compiled.projectId,compiled.model,'predictLongRunning',body,signal);return {name:operation(response.name,compiled.projectId,compiled.model)};
 }
 async poll({projectId,model,operationName},{signal}={}){const name=operation(operationName,projectId,model);const data=await this.#call(projectId,model,'fetchPredictOperation',{operationName:name},signal);if(data.name!==name||typeof data.done!=='boolean')deny();if(!data.done)return {state:'RUNNING'};
  if(data.error)return {state:'FAILED',failureCode:'PROVIDER_ERROR'};
  const r=data.response;if(!r||typeof r!=='object'||Array.isArray(r))deny();if(Number.isSafeInteger(r.raiMediaFilteredCount)&&r.raiMediaFilteredCount>0)return {state:'FAILED',failureCode:'FILTERED'};
  if(!Array.isArray(r.videos)||r.videos.length!==1)return {state:'FAILED',failureCode:'PROVIDER_ERROR'};
  const result=r.videos[0];if(result?.mimeType!=='video/mp4'||typeof result.gcsUri!=='string'||!/^gs:\/\/[a-z0-9][a-z0-9._-]{2,61}\/[a-zA-Z0-9_/-]+\.mp4$/.test(result.gcsUri)||result.gcsUri.includes('..'))deny();return {state:'SUCCEEDED',artifactUri:result.gcsUri};
 }
}
