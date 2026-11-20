const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const BACKENDS=new Set(['cpu','cuda','metal','vulkan','opencl','npu','rocm']);
const uint=x=>Number.isSafeInteger(x)&&x>=0;
const fail=()=>{throw Error('Invalid resource request or insufficient capacity')};
export function kvBytes({layers,heads,headDim,context,bytesPerElement}){const values=[layers,heads,headDim,context,bytesPerElement];if(!values.every(v=>uint(v)&&v>0)||bytesPerElement>8)fail();return 2n*values.reduce((a,b)=>a*BigInt(b),1n)}
export class ResourceArbiter {
  #devices=new Map();#leases=new Map();#stamp=-Infinity;
  constructor({clock=()=>performance.now(),reserveBytes=536870912,ttlMs=5000}={}){if(typeof clock!=='function'||!uint(reserveBytes)||!uint(ttlMs)||!ttlMs)fail();this.clock=clock;this.reserveBytes=reserveBytes;this.ttlMs=ttlMs}
  update(devices){if(!Array.isArray(devices)||devices.length>64)fail();const next=new Map();for(const d of devices){if(!d||typeof d.id!=='string'||!ID.test(d.id)||next.has(d.id)||!BACKENDS.has(d.backend)||!uint(d.total)||!uint(d.free)||d.free>d.total||!['normal','hot','unknown'].includes(d.thermal))fail();next.set(d.id,Object.freeze({...d}))}const now=this.clock();if(!Number.isFinite(now)||now<this.#stamp)fail();this.#devices=next;this.#stamp=now}
  acquire(jobs){const now=this.clock();if(!Number.isFinite(now)||now<this.#stamp||now-this.#stamp>this.ttlMs||!Array.isArray(jobs)||jobs.length<1||jobs.length>2||this.#leases.size>=1024)fail();const backend=jobs[0]?.backend;if(!BACKENDS.has(backend))fail();let bytes=0;for(const j of jobs){if(!j||j.backend!==backend||![j.weights,j.kv,j.workspace].every(uint)||!j.weights)fail();bytes+=j.weights+j.kv+j.workspace;if(!uint(bytes))fail()}const used=new Map();for(const l of this.#leases.values())used.set(l.device,(used.get(l.device)??0)+l.bytes);const candidates=[...this.#devices.values()].filter(d=>d.backend===backend&&d.thermal==='normal').map(d=>({d,available:d.free-this.reserveBytes-(used.get(d.id)??0)})).filter(x=>x.available>=bytes).sort((a,b)=>a.available-b.available||(a.d.id<b.d.id?-1:a.d.id>b.d.id?1:0));if(!candidates.length)fail();const lease=Object.freeze({device:candidates[0].d.id,bytes,backend});this.#leases.set(lease,lease);return lease}
  release(lease){if(!this.#leases.delete(lease))fail()}
}
