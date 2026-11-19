import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, symlink, chmod, rename, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyPinnedSnapshot, validateSnapshotPath } from '../scripts/snapshot-integrity.mjs';

const SHA = 'a'.repeat(40);
const sha = (algorithm, data) => createHash(algorithm).update(data).digest('hex');
const gitSha = data => sha('sha1', Buffer.concat([Buffer.from('blob ' + data.length + '\0'), data]));

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'omega-snapshot-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vendor = join(root, 'vendor', 'locally-uncensored');
  await mkdir(join(root, 'docs'), { recursive: true });
  await mkdir(join(vendor, 'src'), { recursive: true });
  const body = Buffer.from('const result = 42;\n');
  await writeFile(join(vendor, 'src', 'main.js'), body);
  const files = [{ path: 'src/main.js', mode: '100644', bytes: body.length, git_sha1: gitSha(body) }];
  const index = { schema: 1, source_commit: SHA, file_count: 1, total_bytes: body.length, files };
  const manifest = { schema: 1, source_commit: SHA, files: files.map(f => ({ ...f, sha256: sha('sha256', body) })) };
  const indexPath = join(root, 'docs', 'UPSTREAM_FILE_INDEX.json');
  const manifestPath = join(vendor, '.omega-source-manifest.json');
  const options = { root, expectedSha: SHA };
  const save = async () => {
    const bytes = JSON.stringify(index);
    await writeFile(indexPath, bytes);
    options.expectedIndexSha256 = sha('sha256', bytes);
    await writeFile(manifestPath, JSON.stringify(manifest));
  };
  await save();
  return { root, vendor, index, manifest, indexPath, manifestPath, body, save, options };
}

test('accepts a complete byte-identical pinned snapshot', async t => {
  const f = await fixture(t);
  const got = await verifyPinnedSnapshot(f.options);
  assert.equal(got.ok, true, JSON.stringify(got));
  assert.equal(got.filesChecked, 1);
  assert.equal(got.bytesChecked, f.body.length);
});

test('rejects a fake manifest that removes trusted indexed file', async t => {
  const f = await fixture(t);
  f.manifest.files = [];
  await f.save();
  const got = await verifyPinnedSnapshot(f.options);
  assert.equal(got.ok, false);
  assert.match(got.errors.join(' '), /count|missing/i);
});

test('rejects malicious rewrite of both bytes and the local self-manifest', async t => {
  const f = await fixture(t);
  const body = Buffer.from('evil bytes');
  await writeFile(join(f.vendor, 'src', 'main.js'), body);
  Object.assign(f.manifest.files[0], { sha256: sha('sha256', body), bytes: body.length, git_sha1: gitSha(body) });
  await f.save();
  const got = await verifyPinnedSnapshot(f.options);
  assert.equal(got.ok, false);
  assert.match(got.errors.join(' '), /mismatch/i);
});

test('detects extra unindexed files rather than silently accepting them', async t => {
  const f = await fixture(t);
  await writeFile(join(f.vendor, 'injected.js'), 'console.log(1)');
  const got = await verifyPinnedSnapshot(f.options);
  assert.equal(got.ok, false);
  assert.match(got.errors.join(' '), /Unexpected/i);
});

test('detects symlink escape within vendor tree', async t => {
  const f = await fixture(t);
  await symlink(join(f.vendor, 'src', 'main.js'), join(f.vendor, 'shortcut.js'));
  const got = await verifyPinnedSnapshot(f.options);
  assert.equal(got.ok, false);
  assert.match(got.errors.join(' '), /symlink/i);
});

test('rejects altered authoritative file index and commit mismatch', async t => {
  const f = await fixture(t);
  f.index.files[0].git_sha1 = 'f'.repeat(40);
  await f.save();
  assert.equal((await verifyPinnedSnapshot(f.options)).ok, false);
  f.index.files[0].git_sha1 = gitSha(f.body);
  await f.save();
  assert.equal((await verifyPinnedSnapshot({ ...f.options, expectedSha: 'b'.repeat(40) })).ok, false);
});

test('rejects path traversal and control characters', () => {
  for (const path of ['../secrets', 'a/../../secret', 'C:/secret', '/secret', 'a\\secret', 'foo//bar', 'a/./b', '.git/config', 'a\nfoo']) {
    assert.throws(() => validateSnapshotPath(path), /Invalid|Unsafe/);
  }
  assert.equal(validateSnapshotPath('src/zażółć.ts'), 'src/zażółć.ts');
});

test('SEC003-08 rejects synchronized rewrite of index, manifest and source', async t => {
  const f = await fixture(t); const trusted = { ...f.options };
  const bytes = Buffer.from('const result = 43;\n');
  await writeFile(join(f.vendor, 'src', 'main.js'), bytes);
  f.index.files[0].git_sha1 = gitSha(bytes);
  Object.assign(f.manifest.files[0], { git_sha1: gitSha(bytes), sha256: sha('sha256', bytes) });
  await f.save();
  const got = await verifyPinnedSnapshot(trusted);
  assert.equal(got.ok, false); assert.match(got.errors.join(' '), /index digest mismatch/i);
});
test('SEC003-09 rejects missing custom trust digest', async t => {
  const f = await fixture(t); const got = await verifyPinnedSnapshot({ root: f.root, expectedSha: SHA });
  assert.equal(got.ok, false); assert.match(got.errors.join(' '), /trusted index digest/i);
});
test('SEC003-10 rejects forged production index even with caller-supplied digest', async t => {
  const f = await fixture(t);
  f.index.source_commit = f.manifest.source_commit = '6d96ab92e827e0471586c6291c78067b495ef44a'; await f.save();
  const got = await verifyPinnedSnapshot({ root: f.root, expectedIndexSha256: f.options.expectedIndexSha256 });
  assert.equal(got.ok, false); assert.match(got.errors.join(' '), /production index digest/i);
});
test('SEC003-11 rejects modified executable mode on POSIX', {skip: process.platform === 'win32'}, async t => {
  const f = await fixture(t); await chmod(join(f.vendor, 'src', 'main.js'), 0o755);
  const got = await verifyPinnedSnapshot(f.options); assert.equal(got.ok, false); assert.match(got.errors.join(' '), /mode/i);
});
test('SEC003-12 rejects symlink in vendor parent', async t => {
  const f = await fixture(t); await rename(join(f.root, 'vendor'), join(f.root, 'other'));
  await symlink(join(f.root, 'other'), join(f.root, 'vendor'), 'dir');
  const got = await verifyPinnedSnapshot(f.options); assert.equal(got.ok, false); assert.match(got.errors.join(' '), /symlink/i);
});
test('SEC003-13 rejects symlinked index despite byte equality', async t => {
  const f = await fixture(t); const other = join(f.root, 'alternate.json'); await rename(f.indexPath, other); await symlink(other, f.indexPath);
  const got = await verifyPinnedSnapshot(f.options); assert.equal(got.ok, false); assert.match(got.errors.join(' '), /symlink/i);
});
test('SEC003-14 rejects a matching but empty inventory', async t => {
  const f = await fixture(t); f.index.files = []; f.index.file_count = 0; f.index.total_bytes = 0; f.manifest.files = [];
  await rm(join(f.vendor, 'src'), { recursive: true }); await f.save();
  const got = await verifyPinnedSnapshot(f.options); assert.equal(got.ok, false); assert.match(got.errors.join(' '), /count|empty/i);
});
test('SEC003-15 bounds manifest size before parsing JSON', async t => {
  const f = await fixture(t); await truncate(f.manifestPath, 9 * 1024 ** 2);
  const got = await verifyPinnedSnapshot(f.options); assert.equal(got.ok, false); assert.match(got.errors.join(' '), /size|limit/i);
});
