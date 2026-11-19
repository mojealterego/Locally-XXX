import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync,chmodSync,existsSync,statSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {prepareStage} from '../scripts/staged-runtime.mjs';
const SHA='a'.repeat(40);
function fixture(t,missing=[]){
  const root=mkdtempSync(join(tmpdir(),'omega-stage-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const stage=join(root,'migration','staged','locally-uncensored');
  mkdirSync(join(root,'docs'),{recursive:true}); mkdirSync(stage,{recursive:true});
  const records={'package.json':'{}\n','src/main.js':'export const x=1;\n','scripts/setup.sh':'#!/bin/sh\n','docs/demo.gif':'GIF89a','docs/social-preview.png':'fixture png'};
  const files=Object.entries(records).map(([path,text])=>{
    const bytes=Buffer.from(text), mode=path.endsWith('.sh')?'100755':'100644';
    if(!missing.includes(path)){const dest=join(stage,path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,bytes);chmodSync(dest,mode==='100755'?0o755:0o644);}
    return {path,mode,bytes:bytes.length,git_sha1:createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')};
  });
  const index={schema:1,source_commit:SHA,file_count:files.length,total_bytes:files.reduce((s,f)=>s+f.bytes,0),files};
  const save=()=>writeFileSync(join(root,'docs','UPSTREAM_FILE_INDEX.json'),JSON.stringify(index)); save();
  return {root,stage,index,save,options:{root,expectedSha:SHA}};
}
test('STAGE-01 verifies complete staged bytes without writing runtime',t=>{const f=fixture(t);const r=prepareStage(f.options);assert.equal(r.status,'complete');assert.equal(r.files,5);assert.equal(existsSync(join(f.root,'runtime')),false);});
test('STAGE-02 missing documentation denied by default',t=>{const f=fixture(t,['docs/demo.gif']);assert.throws(()=>prepareStage(f.options),/Missing/);});
test('STAGE-03 explicit opt-in permits only two known documentation assets',t=>{const f=fixture(t,['docs/demo.gif','docs/social-preview.png']);const r=prepareStage({...f.options,allowMissingDocs:true});assert.equal(r.status,'documentation-incomplete');assert.deepEqual(r.missing,['docs/demo.gif','docs/social-preview.png']);});
test('STAGE-04 missing runtime source cannot be waived',t=>{const f=fixture(t,['src/main.js']);assert.throws(()=>prepareStage({...f.options,allowMissingDocs:true}),/Missing/);});
test('STAGE-05 modified same-length source is rejected before copying',t=>{const f=fixture(t);writeFileSync(join(f.stage,'src/main.js'),'export const x=2;\n');assert.throws(()=>prepareStage({...f.options,apply:true}),/checksum/);assert.equal(existsSync(join(f.root,'runtime')),false);});
test('STAGE-06 extra file rejected',t=>{const f=fixture(t);writeFileSync(join(f.stage,'injected.js'),'evil');assert.throws(()=>prepareStage(f.options),/Unexpected/);});
test('STAGE-07 symlink to source rejected',t=>{const f=fixture(t);rmSync(join(f.stage,'src/main.js'));symlinkSync(join(f.stage,'package.json'),join(f.stage,'src/main.js'));assert.throws(()=>prepareStage(f.options),/symlink|Unsafe/);});
test('STAGE-08 malformed index path and duplicate rejected',t=>{const f=fixture(t);f.index.files[0].path='../escape';f.save();assert.throws(()=>prepareStage(f.options),/path/i);f.index.files[0].path=f.index.files[1].path;f.save();assert.throws(()=>prepareStage(f.options),/Duplicate/);});
test('STAGE-09 stage parent symlink rejected',t=>{const f=fixture(t);const parent=join(f.root,'migration','staged');rmSync(parent,{recursive:true});mkdirSync(join(f.root,'other'));symlinkSync(join(f.root,'other'),parent);assert.throws(()=>prepareStage(f.options),/symlink|Unsafe/);});
test('STAGE-10 materialization creates new isolated directories and preserves bytes',t=>{const f=fixture(t);const a=prepareStage({...f.options,apply:true});const b=prepareStage({...f.options,apply:true});assert.notEqual(a.output,b.output);assert.deepEqual(readFileSync(join(a.output,'src/main.js')),readFileSync(join(f.stage,'src/main.js')));assert.equal(statSync(join(a.output,'scripts/setup.sh')).mode&0o111,0o111);assert.equal(a.files,5);});
test('STAGE-11 executable mode mutation denied',t=>{const f=fixture(t);chmodSync(join(f.stage,'scripts/setup.sh'),0o644);assert.throws(()=>prepareStage(f.options),/mode/);});
test('STAGE-12 symlink output parent denied',t=>{const f=fixture(t);mkdirSync(join(f.root,'other'));symlinkSync(join(f.root,'other'),join(f.root,'runtime'));assert.throws(()=>prepareStage({...f.options,apply:true}),/symlink|Unsafe/);});
test('STAGE-13 invalid CLI flags rejected',()=>{const r=spawnSync(process.execPath,['scripts/staged-runtime.mjs','check','--unsafe'],{encoding:'utf8'});assert.equal(r.status,2);assert.match(r.stderr,/Usage/);});
