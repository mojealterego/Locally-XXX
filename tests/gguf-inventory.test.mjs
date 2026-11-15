import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseGGUFHeader, inspectGGUF, scanGGUF, evaluateMemory } from '../scripts/gguf-inventory.mjs';

function header(version = 3, tensors = 3n, kv = 5n) {
  const data = Buffer.alloc(24);
  data.write('GGUF', 0, 'ascii');
  data.writeUInt32LE(version, 4);
  data.writeBigUInt64LE(tensors, 8);
  data.writeBigUInt64LE(kv, 16);
  return data;
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'locally-gguf-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
test('parses GGUF v2/v3 64-bit header', () => {
  assert.deepEqual(parseGGUFHeader(header(2, 3n, 5n)),
    { version: 2, tensorCount: '3', metadataCount: '5' });
  assert.deepEqual(parseGGUFHeader(header(3, 100_000n, 500n)),
    { version: 3, tensorCount: '100000', metadataCount: '500' });
});
test('rejects invalid header and excessive count', () => {
  assert.throws(() => parseGGUFHeader(Buffer.from('GGUF')), /truncated/);
  assert.throws(() => parseGGUFHeader(Buffer.alloc(24)), /magic/);
  assert.throws(() => parseGGUFHeader(header(1)), /Unsupported/);
  assert.throws(() => parseGGUFHeader(header(3, 10_000_001n)), /implausible/);
});
test('streams model SHA-256 instead of buffering the full model', async t => {
  const root = await fixture(t);
  const bytes = Buffer.concat([header(), Buffer.alloc(1024, 0x55)]);
  const path = join(root, 'A.GGUF');
  await writeFile(path, bytes);
  const model = await inspectGGUF(path, { sha256: true });
  assert.equal(model.bytes, bytes.length);
  assert.equal(model.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(model.tensorCount, '3');
  assert.equal(model.memory.ramGiB, 12);
});
test('reports invalid header without claiming actual inference', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'nested'));
  await writeFile(join(root, 'nested', 'ok.gguf'), header());
  await writeFile(join(root, 'nested', 'broken.gguf'), Buffer.from('GGU'));
  await writeFile(join(root, 'notes.txt'), 'ignored');
  const result = await scanGGUF(root);
  assert.equal(result.files, 1);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.models.map(x => x.path), ['nested/ok.gguf']);
  assert.match(result.disclaimer, /inferencji/);
});
test('does not traverse symlink directories or model files', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'inner'));
  await writeFile(join(root, 'inner', 'ok.gguf'), header());
  await symlink('inner', join(root, 'link-dir'));
  await symlink(join(root, 'inner', 'ok.gguf'), join(root, 'link.gguf'));
  const result = await scanGGUF(root);
  assert.equal(result.files, 1);
  assert.equal(result.rejected.length, 2);
  assert.equal(result.rejected.every(e => e.reason.includes('Symbolic')), true);
  await assert.rejects(() => inspectGGUF(join(root, 'link.gguf')), /symlink|symbolic/i);
});
test('rejects symlink root', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'actual'));
  await symlink('actual', join(root, 'shortcut'));
  await assert.rejects(() => scanGGUF(join(root, 'shortcut')), /symlink/);
});
test('caps recursive traversal and reports the excluded directory', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'nested'));
  await writeFile(join(root, 'nested', 'deep.gguf'), header());
  const result = await scanGGUF(root, { maxDepth: 0 });
  assert.equal(result.files, 0);
  assert.match(result.rejected[0].reason, /depth/);
  await assert.rejects(() => scanGGUF(root, { maxEntries: 1 }), /limit exceeded/);
});
test('memory pressure estimate validates resource assumptions', () => {
  const bytes = 8 * 1024 ** 3;
  const result = evaluateMemory(bytes, { ramGiB: 12, reserveGiB: 3, overheadFactor: 1.25 });
  assert.equal(result.fileOnlyWithinBudget, false);
  assert.equal(result.thresholdBytes, Math.floor(9 * 1024 ** 3 / 1.25));
  assert.match(result.qualification, /Szacunek/);
  assert.throws(() => evaluateMemory(-1), RangeError);
  assert.throws(() => evaluateMemory(1, { ramGiB: 0 }), RangeError);
  assert.throws(() => evaluateMemory(1, { overheadFactor: 0.5 }), RangeError);
});
test('CLI emits JSON and rejects unsupported flags', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'mini.gguf'), header());
  const path = join(import.meta.dirname, '..', 'scripts', 'gguf-inventory.mjs');
  const ok = spawnSync(process.execPath, [path, root, '--sha256'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).models[0].path, 'mini.gguf');
  const fail = spawnSync(process.execPath, [path, root, '--unknown'], { encoding: 'utf8' });
  assert.equal(fail.status, 1);
  assert.match(fail.stderr, /Unknown flag/);
});
