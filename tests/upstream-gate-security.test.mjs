import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyUpstream } from '../scripts/upstream-gate.mjs';

const git = (p, ...args) => execFileSync('git', ['-C', p, ...args], { encoding:'utf8' }).trim();
function fixture(t, nested = false) {
  const root = mkdtempSync(join(tmpdir(), 'omega-gate-security-'));
  t.after(() => rmSync(root, {recursive:true, force:true}));
  const source = nested ? join(root, 'fake-source') : root;
  mkdirSync(join(source, 'src', 'api'), {recursive:true});
  mkdirSync(join(source, 'src-tauri'), {recursive:true});
  for (const name of ['README.md','src/App.tsx','src/api/rag.ts','src-tauri/Cargo.toml']) writeFileSync(join(source,name), 'trusted\n');
  writeFileSync(join(source,'LICENSE'),'GNU AFFERO GENERAL PUBLIC LICENSE\n');
  writeFileSync(join(source,'package.json'), JSON.stringify({version:'2.6.7',license:'AGPL-3.0-only'}));
  writeFileSync(join(source,'.gitignore'),'node_modules/\n');
  git(root,'init','-q','-b','main');
  git(root,'config','user.name','Fixture');
  git(root,'config','user.email','fixture@example.invalid');
  git(root,'add','.'); git(root,'commit','-qm','base');
  return {root,source,sha:git(root,'rev-parse','HEAD')};
}
const verify = f => verifyUpstream({source:f.source,expectedSha:f.sha});
test('SEC-GATE-01 clean exact worktree accepted', t => assert.equal(verify(fixture(t)).ok,true));
test('SEC-GATE-02 ancestor Git checkout is rejected even with matching HEAD', t => {
  const f=fixture(t,true); const r=verify(f); assert.equal(r.ok,false); assert.match(r.errors.join(' '), /worktree root/i);
});
test('SEC-GATE-03 untracked source is rejected',t=>{
  const f=fixture(t); writeFileSync(join(f.source,'src','injected.ts'),'untracked'); const r=verify(f); assert.equal(r.ok,false); assert.match(r.errors.join(' '),/untracked/i);
});
test('SEC-GATE-04 ignored installed dependencies are allowed',t=>{
  const f=fixture(t); mkdirSync(join(f.source,'node_modules')); writeFileSync(join(f.source,'node_modules','dependency.js'),'fixture'); assert.equal(verify(f).ok,true);
});
test('SEC-GATE-05 assume-unchanged flags cannot suppress source modification detection',t=>{
  const f=fixture(t); git(f.source,'update-index','--assume-unchanged','src/App.tsx'); writeFileSync(join(f.source,'src','App.tsx'),'changed'); const r=verify(f); assert.equal(r.ok,false); assert.match(r.errors.join(' '),/index flags/i);
});
test('SEC-GATE-06 skip-worktree flags are rejected',t=>{
  const f=fixture(t); git(f.source,'update-index','--skip-worktree','src/App.tsx'); const r=verify(f); assert.equal(r.ok,false); assert.match(r.errors.join(' '),/index flags/i);
});
test('SEC-GATE-07 symbolic source root is rejected', {skip:process.platform==='win32'}, t=>{
  const f=fixture(t); const link=join(f.root,'alias'); symlinkSync(f.root,link,'dir'); const r=verifyUpstream({source:link,expectedSha:f.sha}); assert.equal(r.ok,false); assert.match(r.errors.join(' '),/symbolic/i);
});
test('SEC-GATE-08 real initialized submodule with .git file is accepted',t=>{
  const origin=fixture(t); const root=mkdtempSync(join(tmpdir(),'omega-gate-parent-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  git(root,'init','-q','-b','main');
  git(root,'-c','protocol.file.allow=always','submodule','add','-q',origin.source,'upstream/locally-uncensored');
  const source=join(root,'upstream','locally-uncensored');
  const r=verifyUpstream({source,expectedSha:origin.sha}); assert.equal(r.ok,true,JSON.stringify(r));
});
