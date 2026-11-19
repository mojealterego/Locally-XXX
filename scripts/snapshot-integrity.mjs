import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINNED_UPSTREAM_SHA } from './upstream-gate.mjs';
import { resolveIndexDigest, assertIndexBytes } from './index-trust.mjs';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_COMMIT = PINNED_UPSTREAM_SHA;
const MAX_METADATA_BYTES = 8 * 1024 ** 2;
const MAX_FILES = 20_000;
const MAX_BYTES = 2 * 1024 ** 3;
const MANIFEST = '.omega-source-manifest.json';

export function validateSnapshotPath(path) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || /[\\:\x00-\x1f\x7f]/.test(path)) {
    throw new Error('Invalid snapshot path');
  }
  const parts = path.split('/');
  if (parts.some(x => !x || x === '.' || x === '..' || x.toLowerCase() === '.git' || x === MANIFEST)) {
    throw new Error('Unsafe snapshot path: ' + path);
  }
  return path;
}

function readIndexEntry(entry, { sha256 = false } = {}) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid manifest record');
  const path = validateSnapshotPath(entry.path);
  if (!['100644', '100755'].includes(entry.mode) ||
      !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 ||
      typeof entry.git_sha1 !== 'string' || !/^[0-9a-f]{40}$/.test(entry.git_sha1)) {
    throw new Error('Invalid file metadata: ' + path);
  }
  if (sha256 && (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256))) {
    throw new Error('Invalid SHA-256: ' + path);
  }
  return entry;
}

async function assertDirectory(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('Unsafe directory or symlink: ' + path);
}

async function readMetadata(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Unsafe metadata file or symlink: ' + path);
  if (stat.size > MAX_METADATA_BYTES) throw Error('Metadata size limit exceeded: ' + path);
  const handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0));
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.dev !== stat.dev || before.ino !== stat.ino || before.size > MAX_METADATA_BYTES) throw Error('Metadata identity or size mismatch: ' + path);
    const data = Buffer.alloc(before.size);
    for (let offset = 0; offset < data.length;) {
      const { bytesRead } = await handle.read(data, offset, data.length - offset, offset);
      if (!bytesRead) throw Error('Truncated metadata: ' + path);
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw Error('Metadata mutated during read: ' + path);
    return data;
  } finally { await handle.close(); }
}

async function hashFile(vendor, item) {
  const parts = item.path.split('/');
  let parent = vendor;
  for (const part of parts.slice(0, -1)) {
    parent = join(parent, part);
    const s = await lstat(parent);
    if (s.isSymbolicLink() || !s.isDirectory()) throw new Error('Unsafe parent path: ' + item.path);
  }
  const target = join(vendor, ...parts);
  const s = await lstat(target);
  if (s.isSymbolicLink() || !s.isFile()) throw new Error('Unsafe model file: ' + item.path);
  const handle = await open(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0));
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.dev !== s.dev || before.ino !== s.ino || before.size !== item.bytes) throw new Error('File size or identity mismatch: ' + item.path);
    if (process.platform !== 'win32' && Boolean(before.mode & 0o111) !== (item.mode === '100755')) throw Error('Executable mode mismatch: ' + item.path);
    const sha256 = createHash('sha256');
    const gitHash = createHash('sha1').update('blob ' + before.size + '\0');
    const stream = handle.createReadStream({ highWaterMark: 1024 * 1024, autoClose: false });
    for await (const chunk of stream) {
      sha256.update(chunk);
      gitHash.update(chunk);
    }
    const after = await handle.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || after.ino !== before.ino) {
      throw new Error('File mutated during verification: ' + item.path);
    }
    return { sha256: sha256.digest('hex'), git_sha1: gitHash.digest('hex') };
  } finally { await handle.close(); }
}

async function detectExtras(vendor, known, maxFiles) {
  const extra = [];
  let entries = 0;
  const stack = [{ path: vendor, prefix: '' }];
  while (stack.length) {
    const current = stack.pop();
    await assertDirectory(current.path);
    for (const entry of await readdir(current.path, { withFileTypes: true })) {
      if (++entries > maxFiles) throw new Error('Directory entry safety limit exceeded');
      const rel = current.prefix ? current.prefix + '/' + entry.name : entry.name;
      const full = join(current.path, entry.name);
      const type = await lstat(full);
      if (type.isSymbolicLink()) {
        extra.push('Unexpected symlink: ' + rel);
      } else if (type.isDirectory()) {
        stack.push({ path: full, prefix: rel });
      } else if (!type.isFile()) {
        extra.push('Unsupported filesystem entry: ' + rel);
      } else if (!known.has(rel) && rel !== MANIFEST) {
        extra.push('Unexpected file: ' + rel);
      }
    }
  }
  return extra;
}

export async function verifyPinnedSnapshot({ root = PROJECT_ROOT, expectedSha = SOURCE_COMMIT, expectedIndexSha256 } = {}) {
  const errors = [];
  let filesChecked = 0, bytesChecked = 0;
  try {
    const digest = resolveIndexDigest(expectedSha, expectedIndexSha256);
    const project = resolve(root);
    const vendor = join(project, 'vendor', 'locally-uncensored');
    for (const dir of [project, join(project, 'docs'), join(project, 'vendor'), vendor]) await assertDirectory(dir);
    const indexBytes = await readMetadata(join(project, 'docs', 'UPSTREAM_FILE_INDEX.json'));
    assertIndexBytes(indexBytes, digest);
    const index = JSON.parse(indexBytes.toString('utf8'));
    const manifest = JSON.parse((await readMetadata(join(vendor, MANIFEST))).toString('utf8'));
    if (index.schema !== 1 || manifest.schema !== 1 ||
        index.source_commit !== expectedSha || manifest.source_commit !== expectedSha) {
      throw new Error('Source commit mismatch or invalid index schema');
    }
    if (!Array.isArray(index.files) || !Array.isArray(manifest.files) ||
        !index.files.length || index.files.length > MAX_FILES || manifest.files.length > MAX_FILES ||
        index.file_count !== index.files.length || index.files.length !== manifest.files.length) {
      throw new Error('Manifest file count mismatch');
    }
    const trusted = new Map();
    let total = 0;
    for (const entry of index.files) {
      const row = readIndexEntry(entry);
      if (trusted.has(row.path)) throw new Error('Duplicate index entry: ' + row.path);
      trusted.set(row.path, row);
      total += row.bytes;
      if (total > MAX_BYTES) throw new Error('Snapshot exceeds size budget');
    }
    if (total !== index.total_bytes) throw new Error('Indexed byte count mismatch');
    const local = new Map();
    for (const entry of manifest.files) {
      const row = readIndexEntry(entry, { sha256: true });
      if (local.has(row.path)) throw new Error('Duplicate manifest entry: ' + row.path);
      local.set(row.path, row);
    }
    for (const [path, expected] of trusted) {
      const actual = local.get(path);
      if (!actual || actual.bytes !== expected.bytes || actual.mode !== expected.mode || actual.git_sha1 !== expected.git_sha1) {
        errors.push('Manifest metadata mismatch: ' + path);
        continue;
      }
      try {
        const digest = await hashFile(vendor, expected);
        if (digest.git_sha1 !== expected.git_sha1 || digest.sha256 !== actual.sha256) {
          errors.push('Content checksum mismatch: ' + path);
        } else {
          filesChecked++;
          bytesChecked += expected.bytes;
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    for (const path of local.keys()) if (!trusted.has(path)) errors.push('Unexpected manifest entry: ' + path);
    errors.push(...await detectExtras(vendor, new Set(trusted.keys()), MAX_FILES * 2));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { ok: errors.length === 0, expectedSha, filesChecked, bytesChecked, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyPinnedSnapshot();
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.ok) process.exitCode = 1;
}
