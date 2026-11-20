import {createRequire} from 'node:module';
import {lstatSync,readdirSync,readFileSync,realpathSync} from 'node:fs';
import {resolve,relative,posix,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const ext=['.ts','.tsx','.js','.jsx','.mjs','.cjs','.mts','.cts'];
const skip=new Set(['node_modules','dist','build','target','coverage','vendor']);
const hash=x=>createHash('sha256').update(x).digest('hex');
export function buildIndex(directory,{maxFiles=4000,maxBytes=32*1024*1024}={}){
  if(!Number.isSafeInteger(maxFiles)||maxFiles<1||maxFiles>20000||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>128*1024*1024)throw Error('Invalid index limits');
  const root=resolve(directory);if(realpathSync(root)!==root||!lstatSync(root).isDirectory())throw Error('Unsafe root');
  const files=[],edges=[],imports=new Map();let bytes=0,visited=0;
  function walk(dir){for(const item of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
    if(++visited>100000)throw Error('Walk limit exceeded');
    if(item.name.startsWith('.')||skip.has(item.name)||item.isSymbolicLink())continue;
    const path=resolve(dir,item.name);if(item.isDirectory()){walk(path);continue;}
    if(!item.isFile()||!ext.includes(extname(path)))continue;
    const size=lstatSync(path).size;if(size>512*1024||files.length>=maxFiles||bytes+size>maxBytes)throw Error('Source index limit exceeded');
    const raw=readFileSync(path);if(raw.length!==size)throw Error('Source changed');bytes+=size;
    const name=relative(root,path).split('\\').join('/');const source=ts.createSourceFile(name,new TextDecoder('utf-8',{fatal:true}).decode(raw),ts.ScriptTarget.Latest,true);
    const deps=new Set(),symbols=new Set();let count=0;
    function visit(n){if(++count>500000)throw Error('AST node limit exceeded');
      if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))deps.add(n.moduleSpecifier.text);
      if(ts.isCallExpression(n)&&((n.expression.kind===ts.SyntaxKind.ImportKeyword)||(ts.isIdentifier(n.expression)&&n.expression.text==='require'))&&n.arguments.length===1&&ts.isStringLiteral(n.arguments[0]))deps.add(n.arguments[0].text);
      if((ts.isFunctionDeclaration(n)||ts.isClassDeclaration(n)||ts.isInterfaceDeclaration(n)||ts.isTypeAliasDeclaration(n)||ts.isVariableDeclaration(n))&&n.name&&ts.isIdentifier(n.name))symbols.add(n.name.text);
      ts.forEachChild(n,visit);
    }visit(source);
    files.push({path:name,sha256:hash(raw),symbols:[...symbols].sort(),diagnostics:source.parseDiagnostics.length});imports.set(name,deps);
  }}walk(root);
  files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  const names=new Set(files.map(f=>f.path));
  for(const f of files){const targets=new Set();for(const spec of imports.get(f.path)){
    if(!spec.startsWith('./')&&!spec.startsWith('../'))continue;
    const base=posix.normalize(posix.join(posix.dirname(f.path),spec));if(base.startsWith('../')||base==='..')continue;
    const stem=base.replace(/\.(m?js|cjs|jsx)$/,'');
    const candidates=[base,...ext.map(e=>stem+e),...ext.map(e=>base+'/index'+e)];const target=candidates.find(p=>names.has(p));if(target)targets.add(target);
  }for(const to of [...targets].sort())edges.push([f.path,to]);}
  return {schema:1,files,edges};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{if(process.argv.length!==3)throw Error('Usage: node scripts/ast-index.mjs ROOT');console.log(JSON.stringify(buildIndex(process.argv[2])))}catch(e){console.error(e.message);process.exitCode=1}}
