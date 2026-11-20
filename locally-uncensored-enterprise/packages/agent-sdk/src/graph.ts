/** Pure workflow compiler. Authorization input must originate from a verified server-side principal. */
export interface Grant {tenant:string;agent:string;tools:readonly string[]}
export interface NodeSpec {id:string;dependsOn:readonly string[];tool:string;timeoutMs:number}
export interface CompiledGraph {tenant:string;agent:string;nodes:readonly Readonly<NodeSpec>[];order:readonly string[]}
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
function validId(x:unknown):x is string{return typeof x==='string'&&ID.test(x)}
function record(x:unknown):x is Record<string,unknown>{return typeof x==='object'&&x!==null&&!Array.isArray(x)}
function fail(reason:string):never{throw new Error(reason)}
export function compileGraph(input:unknown,grant:Grant):Readonly<CompiledGraph>{
  if(!validId(grant.tenant)||!validId(grant.agent)||!Array.isArray(grant.tools)||grant.tools.length>256||!grant.tools.every(validId))fail('Invalid trusted grant');
  if(!record(input)||input.tenant!==grant.tenant||input.agent!==grant.agent||!Array.isArray(input.nodes)||input.nodes.length<1||input.nodes.length>256)fail('Unauthorized identity or graph limit');
  const tools=new Set(grant.tools);const nodes=new Map<string,Readonly<NodeSpec>>();let edges=0;
  for(const raw of input.nodes){
    if(!record(raw)||!validId(raw.id)||nodes.has(raw.id)||!validId(raw.tool)||!tools.has(raw.tool)||typeof raw.timeoutMs!=='number'||!Number.isSafeInteger(raw.timeoutMs)||raw.timeoutMs<100||raw.timeoutMs>600000||!Array.isArray(raw.dependsOn)||raw.dependsOn.length>64||!raw.dependsOn.every(validId)||new Set(raw.dependsOn).size!==raw.dependsOn.length)fail('Invalid or unauthorized node');
    edges+=raw.dependsOn.length;if(edges>4096)fail('Edge limit exceeded');
    nodes.set(raw.id,Object.freeze({id:raw.id,tool:raw.tool,timeoutMs:raw.timeoutMs,dependsOn:Object.freeze([...raw.dependsOn].sort())}));
  }
  const linked=new Map<string,string[]>(),indegree=new Map<string,number>();
  for(const [id,n] of nodes){indegree.set(id,n.dependsOn.length);for(const dep of n.dependsOn){if(!nodes.has(dep)||dep===id)fail('Unknown or recursive dependency');const list=linked.get(dep)??[];list.push(id);linked.set(dep,list)}}
  const ready=[...nodes.keys()].filter(id=>indegree.get(id)===0).sort(),order:string[]=[];
  while(ready.length){const id=ready.shift()!;order.push(id);for(const next of linked.get(id)??[]){const degree=indegree.get(next)!-1;indegree.set(next,degree);if(degree===0)ready.push(next)}ready.sort()}
  if(order.length!==nodes.size)fail('Dependency cycle');
  return Object.freeze({tenant:grant.tenant,agent:grant.agent,order:Object.freeze(order),nodes:Object.freeze([...nodes.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0))});
}
