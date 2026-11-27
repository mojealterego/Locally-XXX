/** Aether's existing narrative compiler and transition evaluator, with a bounded local game contract. */
import {assert,isObj,NotAllowedError} from './contracts.mjs';
import {compileNarrative,decideNextScene} from './narrative.mjs';
const exact=(v,keys)=>isObj(v)&&Object.keys(v).sort().join(',')===keys;
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!v.includes('\u0000');
const id=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v)&&!['constructor','prototype'].includes(v);
const key=v=>id(v)&&/^[A-Za-z][\w]{0,63}$/.test(v);
const scalar=v=>typeof v==='boolean'||typeof v==='string'&&v.length<=500&&!v.includes('\u0000')||typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1000000;
const enabled=(choice,state)=>Object.entries(choice.when).every(([k,v])=>Object.hasOwn(state,k)&&state[k]===v);
export function compileGame(raw){
 assert(exact(raw,'initial_state,nodes,schema_version,start,title')&&raw.schema_version==='omega.game.narrative.v1'&&text(raw.title,200)&&id(raw.start)&&isObj(raw.initial_state)&&Array.isArray(raw.nodes)&&raw.nodes.length>=1&&raw.nodes.length<=128,'Invalid game');
 assert(Object.keys(raw.initial_state).length<=64&&Object.entries(raw.initial_state).every(([k,v])=>key(k)&&scalar(v)),'Invalid initial state');
 let size=raw.title.length;const state=raw.initial_state;
 for(const scene of raw.nodes){
  assert(exact(scene,'choices,ending,id,text')&&id(scene.id)&&text(scene.text,4000)&&typeof scene.ending==='boolean'&&Array.isArray(scene.choices)&&scene.choices.length<=12&&scene.ending===(scene.choices.length===0),'Invalid scene');
  size+=scene.text.length;
  for(const c of scene.choices){
   assert(exact(c,'effects,id,label,target,when')&&id(c.id)&&id(c.target)&&text(c.label,200)&&isObj(c.when)&&isObj(c.effects),'Invalid choice');
   assert(Object.keys(c.when).length<=64&&Object.keys(c.effects).length<=64,'Choice state limit');
   for(const [k,v] of Object.entries(c.when)){assert(key(k)&&Object.hasOwn(state,k)&&scalar(v)&&typeof v===typeof state[k],'Invalid predicate');size+=k.length+(typeof v==='string'?v.length:16)}
   for(const [k,v] of Object.entries(c.effects)){assert(key(k)&&Object.hasOwn(state,k)&&typeof state[k]==='number'&&Number.isFinite(v)&&Math.abs(v)<=1000,'Invalid effect');size+=k.length+16}
   size+=c.label.length;
  }
  assert(size<=250000,'Game size limit');
 }
 return compileNarrative(raw);
}
export function createPlaytest(raw){
 const graph=compileGame(raw),nodes=new Map(graph.nodes.map(n=>[n.id,n]));let sceneId=graph.start,state=structuredClone(graph.initial_state),history=[];
 const snapshot=()=>{const scene=nodes.get(sceneId);return structuredClone({title:graph.title,scene,state,ending:scene.ending,choices:scene.choices.filter(c=>enabled(c,state)),history});};
 return Object.freeze({snapshot,choose(choiceId){if(!id(choiceId)||history.length>=graph.nodes.length-1)throw new NotAllowedError('Choice denied');const next=decideNextScene(graph,sceneId,choiceId,state);history.push({from:sceneId,choice:choiceId,to:next.scene_id});sceneId=next.scene_id;state=next.state;return snapshot()},reset(){sceneId=graph.start;state=structuredClone(graph.initial_state);history=[];return snapshot()}});
}
