import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync,
  writeFileSync, renameSync, rmSync, openSync, closeSync, unlinkSync, chmodSync,
  constants, fstatSync, readSync, readdirSync,
} from 'node:fs';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINNED_UPSTREAM_SHA, verifyUpstream } from './upstream-gate.mjs';
import { verifyPinnedSnapshot } from './snapshot-integrity.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MANIFEST = '.omega-source-manifest.json';
const MAX_FILES = 20_000;
const MAX_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_FILE = 64 * 1024 ** 2;
const MAX_METADATA = 8 * 1024 ** 2;

export function safeGitPath(path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || /[\\:\x00-\x1f\x7f]/.test(path)) {
    throw new Error(`Invalid Git path: ${JSON.stringify(path)}`);
  }
  const segments = path.split('/');
  if (segments.some(x => !x || x === '.' || x === '..' || x.toLowerCase() === '.git' || x === MANIFEST)) {
    throw new Error(`Invalid Git path: ${JSON.stringify(path)}`);
  }
  return path;
}

function hash(algorithm, bytes) { return createHash(algorithm).update(bytes).digest('hex'); }
function gitBlobHash(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
function trackedFiles(source) {
  const data = execFileSync('git', ['-C', source, 'ls-files', '--stage', '-z'], {
    encoding: 'utf8', timeout: 20_000, maxBuffer: 16 * 1024 * 1024,
  });
  const records = data.split('\0').filter(Boolean);
  if (records.length > MAX_FILES) throw new Error(`Too many tracked files: ${records.length}`);
  return records.map(record => {
    const tab = record.indexOf('\t');
    if (tab < 0) throw new Error('Malformed git index record');
    const [mode, sha, stage] = record.slice(0, tab).split(' ');
    const path = safeGitPath(record.slice(tab + 1));
    if (!['100644', '100755'].includes(mode) || stage !== '0' || !/^[0-9a-f]{40}$/.test(sha)) {
      throw new Error(`Unsupported Git mode, stage or hash: ${path}`);
    }
    return { path, mode, git_sha1: sha };
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function assertDirectory(path) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Unsafe directory or symlink: ' + path);
  return path;
}

function sourcePath(root, path) {
  const parts = safeGitPath(path).split('/');
  const name = parts.pop();
  let parent = assertDirectory(root);
  for (const part of parts) parent = assertDirectory(join(parent, part));
  return join(parent, name);
}

function readRegular(path, limit, mode) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw Error('Unsafe file, symlink or size limit: ' + path);
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.dev !== stat.dev || before.ino !== stat.ino || before.size > limit) throw Error('File identity or size mismatch: ' + path);
    if (mode && process.platform !== 'win32' && Boolean(before.mode & 0o111) !== (mode === '100755')) throw Error('Executable mode mismatch: ' + path);
    const bytes = Buffer.alloc(before.size);
    for (let offset = 0; offset < bytes.length;) {
      const n = readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!n) throw Error('Truncated file: ' + path);
      offset += n;
    }
    const after = fstatSync(fd);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw Error('File changed during read: ' + path);
    return bytes;
  } finally { closeSync(fd); }
}

function sourceInventory(source) {
  let bytesTotal = 0;
  const files = trackedFiles(source).map(entry => {
    const path = sourcePath(source, entry.path);
    const bytes = readRegular(path, Math.min(MAX_FILE, MAX_BYTES - bytesTotal), entry.mode);
    bytesTotal += bytes.length;
    if (gitBlobHash(bytes) !== entry.git_sha1) throw new Error(`Git blob SHA mismatch: ${entry.path}`);
    return { ...entry, bytes: bytes.length, sha256: hash('sha256', bytes) };
  });
  return { files, bytesTotal };
}

function verifyVendorTree(dest, expectedSha, inventory) {
  const errors = [];
  let manifest;
  try {
    assertDirectory(dest);
    manifest = JSON.parse(readRegular(join(dest, MANIFEST), MAX_METADATA).toString('utf8'));
    if (manifest.schema !== 1 || manifest.source_commit !== expectedSha || !Array.isArray(manifest.files)) throw Error('Invalid manifest schema or source commit');
    if (!inventory.files.length || manifest.files.length !== inventory.files.length) throw Error('Manifest count mismatch');
    const trusted = new Map(inventory.files.map(entry => [entry.path, entry]));
    const seen = new Set();
    for (const record of manifest.files) {
      const path = safeGitPath(record.path);
      const entry = trusted.get(path);
      if (seen.has(path) || !entry || ['bytes','mode','git_sha1','sha256'].some(key => entry[key] !== record[key])) throw Error('Manifest metadata mismatch: ' + path);
      seen.add(path);
      const bytes = readRegular(sourcePath(dest, path), entry.bytes, entry.mode);
      if (bytes.length !== entry.bytes || gitBlobHash(bytes) !== entry.git_sha1 || hash('sha256', bytes) !== entry.sha256) throw Error('Checksum mismatch: ' + path);
    }
    const stack = [['', dest]];
    let entries = 0;
    while (stack.length) {
      const [prefix, dir] = stack.pop(); assertDirectory(dir);
      for (const name of readdirSync(dir)) {
        if (++entries > 2 * MAX_FILES) throw Error('Directory entry limit exceeded');
        const rel = prefix ? prefix + '/' + name : name;
        const path = join(dir, name), stat = lstatSync(path);
        if (stat.isSymbolicLink()) throw Error('Unexpected symlink: ' + rel);
        if (stat.isDirectory()) stack.push([rel, path]);
        else if (!stat.isFile() || (rel !== MANIFEST && !seen.has(rel))) throw Error('Unexpected file: ' + rel);
      }
    }
  } catch (error) { errors.push(error.message); }
  return { ok: errors.length === 0, sourceSha: manifest?.source_commit ?? null, files: manifest?.files?.length ?? 0, errors };
}

export function verifyVendor({ root = ROOT, expectedSha = PINNED_UPSTREAM_SHA, source = join(root, 'upstream', 'locally-uncensored') } = {}) {
  try {
    const gate = verifyUpstream({ source: resolve(source), expectedSha });
    if (!gate.ok) throw Error('Upstream verification failed: ' + gate.errors.join('; '));
    const project = assertDirectory(resolve(root));
    const dest = join(assertDirectory(join(project, 'vendor')), 'locally-uncensored');
    return verifyVendorTree(dest, expectedSha, sourceInventory(resolve(source)));
  } catch (error) { return { ok: false, sourceSha: null, files: 0, errors: [error.message] }; }
}

export function vendorize({
  root = ROOT,
  source = join(root, 'upstream', 'locally-uncensored'),
  expectedSha = PINNED_UPSTREAM_SHA,
  apply = false,
} = {}) {
  const projectRoot = resolve(root);
  const sourceDir = resolve(source);
  const gate = verifyUpstream({ source: sourceDir, expectedSha });
  if (!gate.ok) throw new Error(`Upstream verification failed: ${gate.errors.join('; ')}`);
  const inventory = sourceInventory(sourceDir);
  const parent = join(projectRoot, 'vendor');
  const destination = join(parent, 'locally-uncensored');
  if (!apply) return { files: inventory.files.length, bytes: inventory.bytesTotal, written: false, sourceSha: expectedSha };
  mkdirSync(parent, { recursive: true });
  const parentStat = lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error('Vendor parent must be a real directory');
  const lockPath = join(parent, '.omega-vendor.lock');
  const lock = openSync(lockPath, 'wx', 0o600);
  let staging = null;
  try {
    if (existsSync(destination)) {
      const verified = verifyVendorTree(destination, expectedSha, inventory);
      if (!verified.ok) throw new Error(`Existing vendor copy does not match: ${verified.errors.join('; ')}`);
      return { files: verified.files, bytes: inventory.bytesTotal, written: false, sourceSha: expectedSha };
    }
    staging = mkdtempSync(join(parent, '.omega-stage-'));
    for (const entry of inventory.files) {
      const from = sourcePath(sourceDir, entry.path);
      const to = join(staging, ...entry.path.split('/'));
      mkdirSync(dirname(to), { recursive: true });
      const bytes = readRegular(from, entry.bytes, entry.mode);
      if (bytes.length !== entry.bytes || hash('sha256', bytes) !== entry.sha256) {
        throw new Error(`Source changed during import: ${entry.path}`);
      }
      writeFileSync(to, bytes, { flag: 'wx', mode: entry.mode === '100755' ? 0o755 : 0o644 });
      chmodSync(to, entry.mode === '100755' ? 0o755 : 0o644);
    }
    const manifest = { schema: 1, source_commit: expectedSha, source_repository: 'mojealterego/locally-uncensored', files: inventory.files };
    writeFileSync(join(staging, MANIFEST), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
    const staged = verifyVendorTree(staging, expectedSha, inventory);
    if (!staged.ok) throw Error('Pre-publication verification failed: ' + staged.errors.join('; '));
    if (existsSync(destination)) throw new Error('Destination appeared during import');
    renameSync(staging, destination);
    staging = null;
    const verified = verifyVendorTree(destination, expectedSha, inventory);
    if (!verified.ok) throw new Error(`Post-import verification failed: ${verified.errors.join('; ')}`);
    return { files: inventory.files.length, bytes: inventory.bytesTotal, written: true, sourceSha: expectedSha };
  } finally {
    if (staging) rmSync(staging, { recursive: true, force: true });
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const flags = process.argv.slice(2);
    if (flags.some(f => !['--apply', '--check', '--dry-run'].includes(f)) || (flags.includes('--apply') && flags.includes('--check'))) {
      throw new Error('Usage: node scripts/vendorize.mjs [--dry-run | --apply | --check]');
    }
    const result = flags.includes('--check') ? await verifyPinnedSnapshot() : vendorize({ apply: flags.includes('--apply') });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.ok === false) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
