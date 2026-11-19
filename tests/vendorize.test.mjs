import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
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

function installed(t) {
  const f = fixture(t); vendorize({ root: f.root, source: f.source, expectedSha: f.sha, apply: true });
  const dest = join(f.root, 'vendor', 'locally-uncensored');
  const manifestPath = join(dest, '.omega-source-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return { ...f, dest, manifest, save: () => writeFileSync(manifestPath, JSON.stringify(manifest)), manifestPath };
}

test('VENDOR-07 rejects a self-consistent forged manifest and file on reimport', t => {
  const f = installed(t); const bytes = Buffer.from('tampered'); writeFileSync(join(f.dest, 'README.md'), bytes);
  const entry = f.manifest.files.find(x => x.path === 'README.md');
  Object.assign(entry, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), git_sha1: createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex') }); f.save();
  assert.equal(verifyVendor({ root: f.root, expectedSha: f.sha }).ok, false);
  assert.throws(() => vendorize({ root: f.root, source: f.source, expectedSha: f.sha, apply: true }), /does not match/);
});
test('VENDOR-08 rejects deleted file and corresponding missing manifest record', t => {
  const f = installed(t); rmSync(join(f.dest, 'README.md')); f.manifest.files = f.manifest.files.filter(x => x.path !== 'README.md'); f.save();
  assert.equal(verifyVendor({ root: f.root, expectedSha: f.sha }).ok, false);
});
test('VENDOR-09 rejects unexpected unindexed files', t => {
  const f = installed(t); writeFileSync(join(f.dest, 'injected.js'), 'evil');
  assert.equal(verifyVendor({ root: f.root, expectedSha: f.sha }).ok, false);
});
test('VENDOR-10 rejects changed executable mode on POSIX', {skip: process.platform === 'win32'}, t => {
  const f = installed(t); chmodSync(join(f.dest, 'README.md'), 0o755);
  assert.equal(verifyVendor({ root: f.root, expectedSha: f.sha }).ok, false);
});
test('VENDOR-11 rejects symlinked manifest even when bytes match', t => {
  const f = installed(t); const alternate = join(f.root, 'manifest.json'); writeFileSync(alternate, readFileSync(f.manifestPath)); rmSync(f.manifestPath); symlinkSync(alternate, f.manifestPath);
  assert.equal(verifyVendor({ root: f.root, expectedSha: f.sha }).ok, false);
});
