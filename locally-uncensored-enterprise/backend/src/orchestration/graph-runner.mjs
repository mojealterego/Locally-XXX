const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const valid=x=>typeof x==='string'&&ID.test(x);
const fail=()=>{throw Error('Invalid graph or tool registry')};
function validate(g,tools){
  if(!g||!valid(g.tenant)||!valid(g.agent)||!Array.isArray(g.nodes)||g.nodes.length<1||g.nodes.length>256||!Array.isArray(g.order)||g.order.length!==g.nodes.length||!(tools instanceof Map))fail();
  const nodes=new Map();let edges=0;
  for(const n of g.nodes){if(!n||!valid(n.id)||nodes.has(n.id)||!valid(n.tool)||typeof tools.get(n.tool)!=='function'||!Number.isSafeInteger(n.timeoutMs)||n.timeoutMs<100||n.timeoutMs>600000||!Array.isArray(n.dependsOn)||n.dependsOn.length>64||!n.dependsOn.every(valid)||new Set(n.dependsOn).size!==n.dependsOn.length)fail();edges+=n.dependsOn.length;if(edges>4096)fail();nodes.set(n.id,Object.freeze({id:n.id,tool:n.tool,timeoutMs:n.timeoutMs,dependsOn:Object.freeze([...n.dependsOn])}))}
  const seen=new Set();const order=[...g.order];for(const id of order){const n=nodes.get(id);if(!n||seen.has(id)||n.dependsOn.some(d=>!seen.has(d)))fail();seen.add(id)}
  return {tenant:g.tenant,agent:g.agent,nodes,order};
}
async function bounded(fn,signal){if(signal.aborted)throw signal.reason;let listener;try{return await Promise.race([Promise.resolve().then(()=>{if(signal.aborted)throw signal.reason;return fn()}),new Promise((_,reject)=>{listener=()=>reject(signal.reason);signal.addEventListener('abort',listener,{once:true})})])}finally{signal.removeEventListener('abort',listener)}}
export async function executeGraph(graph,{authorize,tools,deadlineMs=60000,maxOutputBytes=1024*1024,signal}={}){
  if(typeof authorize!=='function'||!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>3600000||!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1||maxOutputBytes>16*1024*1024)fail();
  const registry=new Map(tools),g=validate(graph,registry),control=new AbortController(),timer=setTimeout(()=>control.abort(Error('Graph deadline exceeded')),deadlineMs),global=signal?AbortSignal.any([signal,control.signal]):control.signal;const outputs=new Map();let bytes=0;
  try{for(const id of g.order){const node=g.nodes.get(id),step=new AbortController(),tick=setTimeout(()=>step.abort(Error('Tool timeout')),node.timeoutMs),local=AbortSignal.any([global,step.signal]),context=Object.freeze({tenant:g.tenant,agent:g.agent,node,signal:local});try{
    if(await bounded(()=>authorize(context),local)!==true)throw Error('Tool denied');
    const parents=Object.fromEntries(node.dependsOn.map(d=>[d,structuredClone(outputs.get(d))]));const value=await bounded(()=>registry.get(node.tool)({...context,parents}),local);
    const raw=JSON.stringify(value);if(typeof raw!=='string'||(bytes+=Buffer.byteLength(raw))>maxOutputBytes)throw Error('Graph output budget exceeded');outputs.set(id,JSON.parse(raw));
  }finally{clearTimeout(tick)}}
  return Object.fromEntries(outputs)}finally{clearTimeout(timer)}
}
