import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vendorize, verifyVendor, safeGitPath } from '../scripts/vendorize.mjs';

function git(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'omega-vendor-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'upstream', 'locally-uncensored');
  mkdirSync(join(source, 'src', 'api'), { recursive: true });
  mkdirSync(join(source, 'src-tauri'), { recursive: true });
  for (const p of ['README.md', 'src/App.tsx', 'src/api/rag.ts', 'src-tauri/Cargo.toml']) {
    writeFileSync(join(source, p), `content of ${p}\n`);
  }
  writeFileSync(join(source, 'LICENSE'), 'GNU AFFERO GENERAL PUBLIC LICENSE\n');
  writeFileSync(join(source, 'package.json'), JSON.stringify({ license: 'AGPL-3.0-only', version: '2.6.7' }));
  mkdirSync(join(source, 'data'));
  writeFileSync(join(source, 'data', 'bytes.bin'), Buffer.from([0, 255, 128, 42]));
  git(source, 'init', '-q');
  git(source, 'config', 'user.name', 'Test');
  git(source, 'config', 'user.email', 'test@example.invalid');
  git(source, 'add', '.');
  git(source, 'commit', '-qm', 'test');
  return { root, source, sha: git(source, 'rev-parse', 'HEAD') };
}

test('dry run inventories tracked files without writing vendor tree', t => {
  const f = fixture(t);
  const r = vendorize({ root: f.root, source: f.source, expectedSha: f.sha, apply: false });
  assert.equal(r.files, 7);
  assert.equal(r.written, false);
  assert.equal(existsSync(join(f.root, 'vendor')), false);
});

test('apply produces verified deterministic bytes and idempotent repeat', t => {
  const f = fixture(t);
  const a = vendorize({ root: f.root, source: f.source, expectedSha: f.sha, apply: true });
  assert.equal(a.written, true);
  assert.deepEqual([...readFileSync(join(f.root, 'vendor', 'locally-uncensored', 'data', 'bytes.bin'))], [0, 255, 128, 42]);
  assert.equal(verifyVendor({ root: f.root, expectedSha: f.sha }).ok, true);
  const b = vendorize({ root: f.root, source: f.source, expectedSha: f.sha, apply: true });
  assert.equal(b.written, false);
  assert.equal(b.files, a.files);
});

test('modified vendor file fails verification and refuses overwrite', t => {
  const f = fixture(t);
  vendorize({ root: f.root, source: f.source, expectedSha: f.sha, apply: true });
  writeFileSync(join(f.root, 'vendor', 'locally-uncensored', 'README.md'), 'tampered');
  assert.equal(verifyVendor({ root: f.root, expectedSha: f.sha }).ok, false);
  assert.throws(() => vendorize({ root: f.root, source: f.source, expectedSha: f.sha, apply: true }), /does not match/);
});

test('source changed after git commit is rejected', t => {
  const f = fixture(t);
  writeFileSync(join(f.source, 'README.md'), 'tampered');
  assert.throws(() => vendorize({ root: f.root, source: f.source, expectedSha: f.sha, apply: true }), /local modifications/);
});

test('source symlink is rejected', t => {
  const f = fixture(t);
  symlinkSync('README.md', join(f.source, 'linked.txt'));
  git(f.source, 'add', 'linked.txt');
  git(f.source, 'commit', '-qm', 'add link');
  const sha = git(f.source, 'rev-parse', 'HEAD');
  assert.throws(() => vendorize({ root: f.root, source: f.source, expectedSha: sha, apply: true }), /symlink|Unsupported Git mode/);
});

test('path traversal and absolute paths are rejected', () => {
  for (const path of ['../outside', '/absolute', 'dir/../outside', 'dir\\outside', 'C:/drive', '']) {
    assert.throws(() => safeGitPath(path), /Invalid Git path/);
  }
  assert.equal(safeGitPath('src/zażółć.ts'), 'src/zażółć.ts');
});
