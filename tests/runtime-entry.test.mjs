import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {planRuntime,runRuntime} from '../scripts/runtime-entry.mjs';
const options=t=>{const root=mkdtempSync(join(tmpdir(),'omega-runtime-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return {root,expectedSha:'a'.repeat(40)}};

test('RUNTIME-ENTRY-01 selects verified upstream without staged import',t=>{
 const opts=options(t);let touched=false;
 const result=planRuntime({...opts,verify:()=>({ok:true}),prepare:()=>{touched=true;throw Error('called')}});
 assert.equal(result.mode,'submodule');assert.equal(touched,false);
});
test('RUNTIME-ENTRY-02 chooses staged source for absent upstream',t=>{
 const opts=options(t);const result=planRuntime({...opts,verify:()=>({ok:false,errors:['not mounted']}),prepare:()=>({status:'complete',files:1112})});
 assert.equal(result.mode,'staged');assert.equal(result.verification.files,1112);
});
test('RUNTIME-ENTRY-03 rejects suspicious populated checkout without fallback',t=>{
 const opts=options(t),p=join(opts.root,'upstream','locally-uncensored');mkdirSync(p,{recursive:true});writeFileSync(join(p,'injected'),'x');
 assert.throws(()=>planRuntime({...opts,verify:()=>({ok:false,errors:['changed']}),prepare:()=>{throw Error('must not prepare')}}),/source rejected/);
});
test('RUNTIME-ENTRY-04 verified staged source forwards command to runner only after materialization',t=>{
 const opts=options(t);let called=0;
 const result=runRuntime('lint',{...opts,mode:'staged',prepare:({apply})=>{called++;return apply?{output:'/tmp/runtime-checked'}:{status:'complete'};},runner:(bin,args,options)=>{
  assert.equal(bin,process.platform==='win32'?'npm.cmd':'npm');assert.deepEqual(args,['--prefix','/tmp/runtime-checked','run','lint']);assert.equal(options.shell,false);return {status:0};
 }});
 assert.equal(result,0);assert.equal(called,2);
});
test('RUNTIME-ENTRY-05 rejects unsupported source mode and unknown action',t=>{
 const opts=options(t);assert.throws(()=>planRuntime({...opts,mode:'unsafe'}),/source mode/);
 assert.equal(runRuntime('arbitrary',opts),2);
});
