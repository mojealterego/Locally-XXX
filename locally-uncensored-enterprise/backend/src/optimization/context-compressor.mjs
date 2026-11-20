import {createHash} from 'node:crypto';
import {allocateHistoricalTokens,historicalWeight} from './token-budget.mjs';
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const fail=()=>{throw Error('Invalid context contract')};
export async function compressContext({system,messages,maxTokens,outputReserve,recent=4,decay=0.35,count,summarize,pinned=[]}){
  if(typeof system!=='string'||!Array.isArray(messages)||messages.length>256||!Number.isSafeInteger(maxTokens)||maxTokens<1||maxTokens>1048576||!Number.isSafeInteger(outputReserve)||outputReserve<0||outputReserve>=maxTokens||!Number.isSafeInteger(recent)||recent<0||recent>256||!Number.isFinite(decay)||decay<=0||decay>10||typeof count!=='function'||typeof summarize!=='function'||!Array.isArray(pinned)||pinned.length>256)fail();
  const source=structuredClone(messages),seen=new Set();let size=Buffer.byteLength(system);for(const m of source){if(!m||typeof m.id!=='string'||!ID.test(m.id)||seen.has(m.id)||!['user','assistant'].includes(m.role)||typeof m.content!=='string')fail();seen.add(m.id);size+=Buffer.byteLength(m.content);if(size>4194304)fail()}if(size>4194304||pinned.some(id=>!seen.has(id)))fail();
  const protectedIds=new Set([...pinned,...source.slice(Math.max(0,source.length-recent)).map(m=>m.id)]),selected=new Map();for(const m of source)if(protectedIds.has(m.id))selected.set(m.id,{role:m.role,content:m.content});
  const render=()=>[{role:'system',content:system},...source.flatMap(m=>selected.has(m.id)?[selected.get(m.id)]:[])];
  const measure=async m=>{const n=await count(structuredClone(m));if(!Number.isSafeInteger(n)||n<0)fail();return n};const budget=maxTokens-outputReserve;let tokens=await measure(render());if(tokens>budget)throw Error('Protected context exceeds token budget');
  const historical=source.map((m,i)=>({m,i})).filter(({m})=>!protectedIds.has(m.id));
  const quotas=historical.length?allocateHistoricalTokens(budget-tokens,historical.map(({i})=>historicalWeight(source.length-1-i,decay))):[];
  const archive=[];
  for(let j=historical.length-1;j>=0;j--){const {m}=historical[j];const originalTokens=await measure([{role:m.role,content:m.content}]);const target=Math.min(quotas[j],originalTokens);const record={...m,sha256:createHash('sha256').update(JSON.stringify([m.id,m.role,m.content])).digest('hex'),target,retained:false};archive.unshift(record);if(target<=0)continue;
    const summary=await summarize(Object.freeze({id:m.id,role:m.role,content:m.content,target}));if(typeof summary!=='string'||!summary.trim()||Buffer.byteLength(summary)>262144)continue;const item={role:'assistant',content:JSON.stringify({historicalSummary:summary,source:m.id,sha256:record.sha256})};if(await measure([{role:'assistant',content:summary}])>target)continue;selected.set(m.id,item);const next=await measure(render());if(next>budget){selected.delete(m.id);continue}tokens=next;record.retained=true;
  }
  return {messages:render(),tokens,outputReserve,archive};
}
