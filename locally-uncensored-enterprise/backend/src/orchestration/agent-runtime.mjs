import {executeGraph} from './graph-runner.mjs';
import {SearchGateway} from '../mcp/search-gateway.mjs';
import {GvisorRunner} from '../sandbox/gvisor.mjs';
const fail=()=>{throw Error('Runtime request denied')};
const exact=(q,fields)=>q&&typeof q==='object'&&!Array.isArray(q)&&Object.keys(q).length===fields.length&&fields.every(k=>Object.hasOwn(q,k));
export function createAgentRuntime({aim,permission,classification,search,sandbox}){
  if(typeof aim?.check!=='function'||typeof permission!=='function'||typeof classification!=='function')fail();
  return Object.freeze({async run(graph,inputs,token,limits={}){
    if(typeof token!=='string'||!token.length||token.length>16384||!Array.isArray(graph?.nodes)||graph.nodes.length>256||!inputs||typeof inputs!=='object'||Array.isArray(inputs))fail();
    const snapshot=structuredClone(graph),raw=JSON.stringify(inputs);if(typeof raw!=='string'||Buffer.byteLength(raw)>1048576)fail();const args=JSON.parse(raw);
    if(!exact(args,snapshot.nodes.map(n=>n.id)))fail();
    for(const n of snapshot.nodes){const q=args[n.id];if(n.tool==='web_search_plus'){if(!exact(q,['query','intent']))fail()}else if(n.tool==='sandbox_execute'){if(!exact(q,['language','code']))fail()}else fail()}
    const permits=new Map();
    const tools=new Map([
      ['web_search_plus',async({node,signal})=>{const p=permits.get(node.id);permits.delete(node.id);if(!p||signal.aborted)fail();const q=args[node.id],label=await classification({principal:p,query:q.query,signal});if(signal.aborted)fail();const gateway=new SearchGateway({...search,authorize:async()=>!signal.aborted});return gateway.search({...q,classification:label})}],
      ['sandbox_execute',async({node,signal})=>{const p=permits.get(node.id);permits.delete(node.id);if(!p||signal.aborted)fail();const runner=new GvisorRunner({...sandbox,authorize:async()=>!signal.aborted});return runner.execute(args[node.id])}]
    ]);
    const authorize=async({tenant,agent,node,signal})=>{const principal=await aim.check(token,{tenant,agent,action:'assign_tasks'});if(!principal||principal.tenant!==tenant||principal.agent!==agent||signal.aborted)return false;const decision=await permission({principal,tool:node.tool,input:structuredClone(args[node.id]),signal});if(decision!=='allow'||signal.aborted)return false;permits.set(node.id,principal);return true};
    return executeGraph(snapshot,{deadlineMs:limits.deadlineMs,maxOutputBytes:limits.maxOutputBytes,signal:limits.signal,authorize,tools});
  }});
}
