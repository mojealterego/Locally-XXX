export type ReviewStatus='PENDING'|'REVIEWED'|'APPROVED'|'REJECTED'|'EXPIRED';
export interface ReviewDraft {id:string;agent:string;revision:number;name:string;role:string;tools:string[]}
export interface ReviewResult {id:string;tenant:string;status:ReviewStatus}
export interface ReviewDetails extends ReviewResult,ReviewDraft {subject:string;digest:string}
export interface ReviewClientConfig {base:string;token:()=>string|Promise<string>;fetchImpl?:typeof fetch}
export class ReviewClient {constructor(config:ReviewClientConfig);get(id:string):Promise<ReviewDetails>;submit(draft:ReviewDraft):Promise<ReviewResult>;decide(id:string,digest:string,approved:boolean):Promise<ReviewResult>}
