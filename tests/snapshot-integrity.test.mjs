import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
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
  const save = async () => {
    await writeFile(indexPath, JSON.stringify(index));
    await writeFile(manifestPath, JSON.stringify(manifest));
  };
  await save();
  return { root, vendor, index, manifest, indexPath, manifestPath, body, save };
}

test('accepts a complete byte-identical pinned snapshot', async t => {
  const f = await fixture(t);
  const got = await verifyPinnedSnapshot({ root: f.root, expectedSha: SHA });
  assert.equal(got.ok, true, JSON.stringify(got));
  assert.equal(got.filesChecked, 1);
  assert.equal(got.bytesChecked, f.body.length);
});

test('rejects a fake manifest that removes trusted indexed file', async t => {
  const f = await fixture(t);
  f.manifest.files = [];
  await f.save();
  const got = await verifyPinnedSnapshot({ root: f.root, expectedSha: SHA });
  assert.equal(got.ok, false);
  assert.match(got.errors.join(' '), /count|missing/i);
});

test('rejects malicious rewrite of both bytes and the local self-manifest', async t => {
  const f = await fixture(t);
  const body = Buffer.from('evil bytes');
  await writeFile(join(f.vendor, 'src', 'main.js'), body);
  Object.assign(f.manifest.files[0], { sha256: sha('sha256', body), bytes: body.length, git_sha1: gitSha(body) });
  await f.save();
  const got = await verifyPinnedSnapshot({ root: f.root, expectedSha: SHA });
  assert.equal(got.ok, false);
  assert.match(got.errors.join(' '), /mismatch/i);
});

test('detects extra unindexed files rather than silently accepting them', async t => {
  const f = await fixture(t);
  await writeFile(join(f.vendor, 'injected.js'), 'console.log(1)');
  const got = await verifyPinnedSnapshot({ root: f.root, expectedSha: SHA });
  assert.equal(got.ok, false);
  assert.match(got.errors.join(' '), /Unexpected/i);
});

test('detects symlink escape within vendor tree', async t => {
  const f = await fixture(t);
  await symlink(join(f.vendor, 'src', 'main.js'), join(f.vendor, 'shortcut.js'));
  const got = await verifyPinnedSnapshot({ root: f.root, expectedSha: SHA });
  assert.equal(got.ok, false);
  assert.match(got.errors.join(' '), /symlink/i);
});

test('rejects altered authoritative file index and commit mismatch', async t => {
  const f = await fixture(t);
  f.index.files[0].git_sha1 = 'f'.repeat(40);
  await f.save();
  assert.equal((await verifyPinnedSnapshot({ root: f.root, expectedSha: SHA })).ok, false);
  f.index.files[0].git_sha1 = gitSha(f.body);
  await f.save();
  assert.equal((await verifyPinnedSnapshot({ root: f.root, expectedSha: 'b'.repeat(40) })).ok, false);
});

test('rejects path traversal and control characters', () => {
  for (const path of ['../secrets', 'a/../../secret', 'C:/secret', '/secret', 'a\\secret', 'foo//bar', 'a/./b', '.git/config', 'a\nfoo']) {
    assert.throws(() => validateSnapshotPath(path), /Invalid|Unsafe/);
  }
  assert.equal(validateSnapshotPath('src/zażółć.ts'), 'src/zażółć.ts');
});
