/** Fractional weights model attention priority; actual token usage MUST be measured by the target tokenizer. */
const fail=()=>{throw Error('Invalid token allocation contract')};
export function historicalWeight(age,decay=0.35,minWeight=0.1){
 if(!Number.isSafeInteger(age)||age<0||age>100000||!Number.isFinite(decay)||decay<=0||decay>10||!Number.isFinite(minWeight)||minWeight<=0||minWeight>1)fail();
 return Math.max(minWeight,Math.exp(-decay*age));
}
/** Largest-remainder apportionment; sum equals integer budget, ties go to older segments for deterministic allocation. */
export function allocateHistoricalTokens(budget,weights){
 if(!Number.isSafeInteger(budget)||budget<0||budget>1048576||!Array.isArray(weights)||weights.length<1||weights.length>256||weights.some(x=>!Number.isFinite(x)||x<=0||x>1))fail();
 const total=weights.reduce((a,b)=>a+b,0);if(!Number.isFinite(total)||total<=0)fail();
 const exact=weights.map(w=>budget*w/total),grants=exact.map(Math.floor),used=grants.reduce((a,b)=>a+b,0);
 const remaining=budget-used;
 const order=weights.map((_,i)=>i).sort((a,b)=>exact[b]-Math.floor(exact[b])-exact[a]+Math.floor(exact[a])||a-b);
 for(let i=0;i<remaining;i++)grants[order[i]]++;
 return Object.freeze(grants);
}
