import {runComfy} from './media-queue.mjs';
import {setTimeout as sleep} from 'node:timers/promises';
const bounded=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
/** Explicitly started local scheduler. SQLite claims are shared with manual execution and other processes. */
export class MediaScheduler{
 #active=new Map();#closed=false;#failure=null;#loop=false;
 constructor(queue,{runner=runComfy,maxParallel=2}={}){if(!queue||typeof runner!=='function'||!bounded(maxParallel,1,16))throw Error('SCHEDULER_INVALID');this.queue=queue;this.runner=runner;this.maxParallel=maxParallel}
 tick(){if(this.#closed)return 0;if(this.#failure)throw this.#failure;let count=0;while(this.#active.size<this.maxParallel){const c=this.queue.claimNext();if(!c)break;const ctl=new AbortController();const task={ctl,promise:null};this.#active.set(c.id,task);task.promise=this.#execute(c,ctl).finally(()=>this.#active.delete(c.id));count++}return count}
 async #execute(c,ctl){try{const b=await this.runner(c,{signal:ctl.signal});if(ctl.signal.aborted)throw Error('SCHEDULER_ABORTED');this.queue.complete(c.id,c.token,b)}catch{try{this.queue.unknown(c.id,c.token)}catch(e){this.#failure=e;for(const task of this.#active.values())task.ctl.abort()}}}
 async settleOne(){if(this.#active.size)await Promise.race([...this.#active.values()].map(x=>x.promise));if(this.#failure)throw this.#failure}
 async run({signal,intervalMs=1000}={}){if(this.#loop||this.#closed||!bounded(intervalMs,100,30000)||!(signal instanceof AbortSignal))throw Error('SCHEDULER_INVALID');this.#loop=true;try{while(!signal.aborted&&!this.#closed){this.tick();await sleep(intervalMs,undefined,{signal})}}catch(e){if(!signal.aborted||e.name!=='AbortError')throw e}finally{this.#loop=false;await this.stop({abort:true})}}
 async stop({abort=false}={}){this.#closed=true;if(abort)for(const task of this.#active.values())task.ctl.abort();await Promise.all([...this.#active.values()].map(x=>x.promise));if(this.#failure)throw this.#failure}
}
/** Recovery never resubmits a prompt. Missing/incomplete/error history leaves UNKNOWN. */
export async function recoverComfy(queue,id,{signal,timeoutMs=10000}={}){const c=queue.recoveryClaim(id);if(!c)return false;let b;try{b=await runComfy(c,{signal,timeoutMs,recoverOnly:true})}catch{return false}return b!==null&&queue.recover(id,c.worker.id,b)}
