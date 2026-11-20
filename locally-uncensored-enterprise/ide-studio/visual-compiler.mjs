import ts from 'typescript';
import {createHash} from 'node:crypto';
const F=ts.factory;
const ID=/^[a-z][a-z0-9-]{0,63}$/;
const TYPES=new Set(['screen','text','heading','button']);
function reject(){throw Error('Invalid visual graph')}
function exact(v,keys){return v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))}
function label(v){return typeof v==='string'&&v.trim().length>0&&Buffer.byteLength(v,'utf8')<=512&&v.length<=200}
function normalize(graph){
 if(!exact(graph,['projectId','nodes','edges'])||!ID.test(graph.projectId)||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)||graph.nodes.length<1||graph.nodes.length>128||graph.edges.length>128)reject();
 const ids=new Map(),edges=[];
 for(const n of graph.nodes){const fields=n?.type==='button'?['id','type','label','action']:['id','type','label'];if(!exact(n,fields)||typeof n.id!=='string'||!ID.test(n.id)||ids.has(n.id)||!TYPES.has(n.type)||!label(n.label))reject();if(n.type==='button'&&(!exact(n.action,['kind','target'])||n.action.kind!=='navigate'||typeof n.action.target!=='string'||!ID.test(n.action.target)))reject();ids.set(n.id,n)}
 const screens=[...ids.values()].filter(n=>n.type==='screen').sort((a,b)=>a.id.localeCompare(b.id,'en'));if(screens.length<1||screens.length>12)reject();for(const n of ids.values())if(n.type==='button'&&ids.get(n.action.target)?.type!=='screen')reject();
 const parents=new Map();for(const e of graph.edges){if(!exact(e,['source','target'])||typeof e.source!=='string'||typeof e.target!=='string'||ids.get(e.source)?.type!=='screen'||!ids.has(e.target)||ids.get(e.target).type==='screen'||parents.has(e.target))reject();parents.set(e.target,e.source);edges.push({source:e.source,target:e.target})}
 if(parents.size!==ids.size-screens.length)reject();
 return {projectId:graph.projectId,nodes:[...ids.values()].sort((a,b)=>a.id.localeCompare(b.id,'en')).map(n=>n.type==='button'?{id:n.id,type:n.type,label:n.label,action:{...n.action}}:{id:n.id,type:n.type,label:n.label}),edges:edges.sort((a,b)=>a.source.localeCompare(b.source,'en')||a.target.localeCompare(b.target,'en')),screens};
}
const id=s=>F.createIdentifier(s);
const string=s=>F.createStringLiteral(s);
const react=(name,args)=>F.createCallExpression(F.createPropertyAccessExpression(id('React'),id(name)),undefined,args);
const prop=(key,value)=>F.createPropertyAssignment(id(key),value);
const obj=(p)=>F.createObjectLiteralExpression(p);
function nodeElement(n){const props=[prop('key',string(n.id))];if(n.type==='button'){
 props.push(prop('type',string('button')));
 props.push(prop('onClick',F.createArrowFunction(undefined,undefined,[],undefined,F.createToken(ts.SyntaxKind.EqualsGreaterThanToken),F.createCallExpression(id('setScreen'),undefined,[string(n.action.target)]))));
 }
 const tag=n.type==='heading'?'h2':n.type==='text'?'p':'button';return react('createElement',[string(tag),obj(props),string(n.label)]);
}
function screenElement(n,children){const screenChildren=[react('createElement',[string('h1'),obj([]),string(n.label)]),...children.map(nodeElement)];const element=react('createElement',[string('section'),obj([prop('key',string(n.id))]),...screenChildren]);return F.createConditionalExpression(F.createBinaryExpression(id('screen'),F.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),string(n.id)),F.createToken(ts.SyntaxKind.QuestionToken),element,F.createToken(ts.SyntaxKind.ColonToken),F.createNull())}
export function compileAppGraph(graph){const normalized=normalize(graph);const {projectId,nodes,edges,screens}=normalized;const first=screens[0].id;
 const stateDecl=F.createVariableStatement(undefined,F.createVariableDeclarationList([F.createVariableDeclaration(F.createArrayBindingPattern([F.createBindingElement(undefined,undefined,id('screen')),F.createBindingElement(undefined,undefined,id('setScreen'))]),undefined,undefined,react('useState',[string(first)]))],ts.NodeFlags.Const));
 const sections=screens.map(s=>screenElement(s,nodes.filter(n=>edges.some(e=>e.source===s.id&&e.target===n.id))));
 const ret=F.createReturnStatement(react('createElement',[string('main'),obj([prop('className',string('omega-generated-app'))]),...sections]));
 const fn=F.createFunctionDeclaration([F.createModifier(ts.SyntaxKind.ExportKeyword),F.createModifier(ts.SyntaxKind.DefaultKeyword)],undefined,'GeneratedApp',undefined,[],undefined,F.createBlock([stateDecl,ret],true));
 const imp=F.createImportDeclaration(undefined,F.createImportClause(false,undefined,F.createNamespaceImport(id('React'))),string('react'));
 const file=F.createSourceFile([imp,fn],F.createToken(ts.SyntaxKind.EndOfFileToken),ts.NodeFlags.None); file.fileName='GeneratedApp.tsx';
 const source=ts.createPrinter({newLine:ts.NewLineKind.LineFeed}).printFile(file);
 const digest=createHash('sha256').update(source).digest('hex');const graphDigest=createHash('sha256').update(JSON.stringify({projectId,nodes,edges})).digest('hex');
 return Object.freeze({projectId,source,sha256:digest,graphSha256:graphDigest,nodeCount:nodes.length,screenCount:screens.length})
}
