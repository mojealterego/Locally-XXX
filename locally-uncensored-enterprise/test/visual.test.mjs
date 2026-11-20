import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import vm from 'node:vm';
import {compileAppGraph} from '../ide-studio/visual-compiler.mjs';
const base={projectId:'sample-app',nodes:[
{id:'home',type:'screen',label:'Start'},
{id:'about',type:'screen',label:'About'},
{id:'welcome',type:'text',label:'Hello <script>alert(1)</script> '},
{id:'go',type:'button',label:'Dalej',action:{kind:'navigate',target:'about'}},
{id:'info',type:'heading',label:'Informacje'}],edges:[{source:'home',target:'go'},{source:'home',target:'welcome'},{source:'about',target:'info'}]};
function compile(g){return compileAppGraph(g)}
test('AST01 deterministic compiled TypeScript/React source with canonical digest',()=>{const a=compile(base),b=compile({...base,nodes:[...base.nodes].reverse(),edges:[...base.edges].reverse()});assert.equal(a.source,b.source);assert.equal(a.sha256,b.sha256);assert.match(a.source,/React.createElement/);assert.equal(ts.createSourceFile('x.tsx',a.source,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0)});
test('AST02 escaped labels remain literal, navigation event changes target screen',()=>{const {source}=compile(base);let state='home';const React={createElement:(type,props,...children)=>({type,props,children}),useState:()=>[state,v=>{state=v}]};const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};vm.runInNewContext(js,{exports,require:n=>{assert.equal(n,'react');return React},Object}, {timeout:1000});const view=exports.default();const home=view.children.find(x=>x?.props?.key==='home');const button=home.children.find(x=>x?.type==='button');assert.equal(home.children.find(x=>x?.type==='p').children[0],base.nodes[3-1].label);button.props.onClick();assert.equal(state,'about');assert.ok(exports.default().children.find(x=>x?.props?.key==='about'))});
test('AST03 rejects malformed graphs, rogue edges, navigation injection and duplicate IDs',()=>{const bad=[{...base,projectId:'../bad'},{...base,nodes:[...base.nodes,{...base.nodes[0]}]},{...base,edges:[...base.edges,{source:'go',target:'home'}]},{...base,nodes:base.nodes.map(n=>n.id==='go'?{...n,action:{kind:'shell',target:'about'}}:n)},{...base,nodes:base.nodes.map(n=>n.id==='go'?{...n,action:{kind:'navigate',target:'unknown'}}:n)},{...base,edges:[...base.edges,{source:'about',target:'go'}]}];for(const g of bad)assert.throws(()=>compile(g))});
test('AST04 bounds UTF8 labels, rejects arbitrary user code',()=>{assert.throws(()=>compile({...base,nodes:base.nodes.map(n=>n.id==='info'?{...n,label:'😀'.repeat(1025)}:n)}));assert.throws(()=>compile({...base,nodes:base.nodes.map(n=>n.id==='go'?{...n,script:'alert(1)'}:n)}));assert.throws(()=>compile({...base,nodes:base.nodes.map(n=>n.id==='home'?{...n,style:'background:url(https://evil)'}:n)}))});
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('AST05 CLI emits real source and SHA256, rejects wrong input',()=>{const dir=mkdtempSync(join(tmpdir(),'omega-builder-'));try{const file=join(dir,'app.json');writeFileSync(file,JSON.stringify(base));const p=spawnSync(process.execPath,['ide-studio/compile-app.mjs',file],{cwd:new URL('../',import.meta.url),encoding:'utf8'});assert.equal(p.status,0,p.stderr);const data=JSON.parse(p.stdout);assert.equal(data.sha256,compile(base).sha256);assert.equal(data.nodeCount,base.nodes.length);assert.notEqual(spawnSync(process.execPath,['ide-studio/compile-app.mjs',join(dir,'nope')],{cwd:new URL('../',import.meta.url)}).status,0)}finally{rmSync(dir,{recursive:true,force:true})}});
