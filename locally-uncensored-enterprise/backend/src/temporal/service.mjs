import {checkRef,normalizeDraft,taskDraft} from '../db/repository.mjs';
import {buildFlow,authorizedTask} from '../queues/review.mjs';
const denied=()=>{throw Error('Review request denied')};
const exact=(q,keys)=>q&&typeof q==='object'&&!Array.isArray(q)&&Object.keys(q).length===keys.length&&keys.every(k=>Object.hasOwn(q,k));
export class ReviewService {
  constructor(repo,permit,start){this.repo=repo;this.permit=permit;this.start=start}
  async submit(p,q){if(!exact(q,['id','agent','revision','name','role','tools']))denied();const r=checkRef({tenant:p?.tenant,id:q.id});const {id,...fields}=q;const d=normalizeDraft({...fields,subject:p.subject});if(!await this.permit.allowed(p,r.tenant,'create',d.agent))denied();const status=await this.repo.submit(r,d);if(['PENDING','REVIEWED'].includes(status))await this.start(r);return {...r,status}}
  async get(p,q){if(!exact(q,['id']))denied();const r=checkRef({tenant:p?.tenant,id:q.id});const t=await this.repo.get(r);if(!t||!await this.permit.allowed(p,r.tenant,'read',t.agent))denied();return {...r,status:t.status,...taskDraft(t)}}
  async decide(p,q){if(!exact(q,['id','digest','approved'])||typeof q.approved!=='boolean')denied();const r=checkRef({tenant:p?.tenant,id:q.id});const t=await this.repo.get(r);if(!t||taskDraft(t).digest!==q.digest||t.subject===p.subject||!await this.permit.allowed(p,r.tenant,'approve',t.agent))denied();const status=await this.repo.transition(r,q.digest,'REVIEWED',q.approved?'APPROVED':'REJECTED',p.subject);return {...r,status}}
}
export function reviewActivities(repo,permit,flow){return {
  async enqueue(r){const t=await authorizedTask(r,repo,permit);if(t.status!=='PENDING')return;const spec=buildFlow(r);const old=await flow.getFlow({id:spec.opts.jobId,queueName:spec.queueName,depth:1,maxChildren:3});if(!old){await flow.add(spec);return}const same=(node,v)=>node?.job?.id===v.opts.jobId&&node.job.name===v.name&&node.job.data?.tenant===r.tenant&&node.job.data?.id===r.id;if(!same(old,spec)||old.children?.length!==2||!spec.children.every(v=>old.children.some(n=>same(n,v))))denied()},
  async status(r){return (await authorizedTask(r,repo,permit)).status},
  async expire(r){const t=await authorizedTask(r,repo,permit);if(['APPROVED','REJECTED','EXPIRED'].includes(t.status))return t.status;return repo.transition(r,t.digest,t.status,'EXPIRED')}
}}
