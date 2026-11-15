import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyUpstream, runUpstream } from '../scripts/upstream-gate.mjs';

function git(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', shell: false });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'locally-gate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'upstream', 'locally-uncensored');
  mkdirSync(join(source, 'src', 'api'), { recursive: true });
  mkdirSync(join(source, 'src-tauri'), { recursive: true });
  for (const p of ['README.md', 'src/App.tsx', 'src/api/rag.ts', 'src-tauri/Cargo.toml']) {
    writeFileSync(join(source, p), `fixture ${p}\n`);
  }
  writeFileSync(join(source, 'LICENSE'), 'GNU AFFERO GENERAL PUBLIC LICENSE\n');
  writeFileSync(join(source, 'package.json'), JSON.stringify({ version: '2.6.7', license: 'AGPL-3.0-only' }));
  const r = spawnSync('git', ['init', '-q', source], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  git(source, 'config', 'user.name', 'Test');
  git(source, 'config', 'user.email', 'test@example.invalid');
  git(source, 'add', '.');
  git(source, 'commit', '-qm', 'fixture');
  return { root, source, sha: git(source, 'rev-parse', 'HEAD') };
}

test('valid pinned clean source is accepted', t => {
  const f = fixture(t);
  const result = verifyUpstream({ source: f.source, expectedSha: f.sha });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.errors, []);
  assert.equal(runUpstream('verify', { root: f.root, expectedSha: f.sha }), 0);
});

test('missing submodule is rejected with recovery instructions', t => {
  const f = fixture(t);
  const result = verifyUpstream({ source: join(f.root, 'absent'), expectedSha: f.sha });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /git submodule update/);
});

test('different pinned commit fails closed', t => {
  const f = fixture(t);
  const result = verifyUpstream({ source: f.source, expectedSha: 'a'.repeat(40) });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /Commit mismatch/);
});

test('tracked source modifications are rejected', t => {
  const f = fixture(t);
  writeFileSync(join(f.source, 'src', 'App.tsx'), 'modified\n');
  const result = verifyUpstream({ source: f.source, expectedSha: f.sha });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /local modifications/);
});

test('missing application entrypoint is rejected', t => {
  const f = fixture(t);
  rmSync(join(f.source, 'src', 'App.tsx'));
  const result = verifyUpstream({ source: f.source, expectedSha: f.sha });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /Missing upstream file/);
});

test('invalid license is rejected', t => {
  const f = fixture(t);
  writeFileSync(join(f.source, 'LICENSE'), 'MIT\n');
  const result = verifyUpstream({ source: f.source, expectedSha: f.sha });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /AGPL-3.0 license/);
});

test('unknown action never executes npm', t => {
  const f = fixture(t);
  assert.equal(runUpstream('unrecognized', { root: f.root, expectedSha: f.sha }), 2);
});
