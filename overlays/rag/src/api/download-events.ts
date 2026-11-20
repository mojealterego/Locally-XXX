export interface Transfer { progress:number; total:number; speed:number; status:string }
export function etaSeconds(d:Transfer):number|null {
  if(d.status!=='downloading'||![d.progress,d.total,d.speed].every(Number.isFinite)||d.progress<0||d.total<=0||d.speed<=0||d.progress>d.total)return null;
  const eta=Math.ceil((d.total-d.progress)/d.speed);return Number.isSafeInteger(eta)?eta:null;
}
export class StreamGeneration {
  private id=0; private active=false;
  begin():number {this.active=true;return ++this.id}
  stop():void {this.active=false;++this.id}
  current(id:number):boolean {return this.active&&this.id===id}
}
const statuses=new Set(['connecting','downloading','pausing','paused','complete','error','cancelled']);
export function isDownloadSnapshot(value:unknown):boolean {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const entries=Object.entries(value);if(entries.length>4096)return false;
  return entries.every(([key,v])=>{
    if(['__proto__','prototype','constructor'].includes(key)||!key||key.length>4096||!v||typeof v!=='object')return false;
    return typeof v.filename==='string'&&v.filename.length<=4096&&statuses.has(v.status)&&[v.progress,v.total,v.speed].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0);
  });
}
