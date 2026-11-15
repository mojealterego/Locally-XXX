import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, lstatSync, readFileSync, mkdirSync, mkdtempSync,
  writeFileSync, renameSync, rmSync, openSync, closeSync, unlinkSync, chmodSync,
} from 'node:fs';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINNED_UPSTREAM_SHA, verifyUpstream } from './upstream-gate.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MANIFEST = '.omega-source-manifest.json';
const MAX_FILES = 20_000;
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

export function safeGitPath(path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || /[\\:\0]/.test(path)) {
    throw new Error(`Invalid Git path: ${JSON.stringify(path)}`);
  }
  const segments = path.split('/');
  if (segments.some(x => !x || x === '.' || x === '..' || x === '.git')) {
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

function sourceInventory(source) {
  let bytesTotal = 0;
  const files = trackedFiles(source).map(entry => {
    const path = join(source, ...entry.path.split('/'));
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Refusing symlink or non-file: ${entry.path}`);
    bytesTotal += stat.size;
    if (bytesTotal > MAX_BYTES) throw new Error('Source exceeds 2 GiB import limit');
    const bytes = readFileSync(path);
    if (gitBlobHash(bytes) !== entry.git_sha1) throw new Error(`Git blob SHA mismatch: ${entry.path}`);
    return { ...entry, bytes: bytes.length, sha256: hash('sha256', bytes) };
  });
  return { files, bytesTotal };
}

export function verifyVendor({ root = ROOT, expectedSha = PINNED_UPSTREAM_SHA } = {}) {
  const dest = join(resolve(root), 'vendor', 'locally-uncensored');
  const errors = [];
  let manifest;
  try {
    if (lstatSync(dest).isSymbolicLink()) throw new Error('Vendor directory is a symlink');
    manifest = JSON.parse(readFileSync(join(dest, MANIFEST), 'utf8'));
    if (manifest.schema !== 1 || manifest.source_commit !== expectedSha || !Array.isArray(manifest.files)) {
      throw new Error('Invalid manifest schema or source commit');
    }
    if (manifest.files.length > MAX_FILES) throw new Error('Too many manifest entries');
    const seen = new Set();
    for (const entry of manifest.files) {
      safeGitPath(entry.path);
      if (seen.has(entry.path)) throw new Error(`Duplicate path: ${entry.path}`);
      seen.add(entry.path);
      const target = join(dest, ...entry.path.split('/'));
      const stat = lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Invalid file: ${entry.path}`);
      const bytes = readFileSync(target);
      if (bytes.length !== entry.bytes || hash('sha256', bytes) !== entry.sha256) {
        throw new Error(`Checksum mismatch: ${entry.path}`);
      }
    }
  } catch (error) { errors.push(error.message); }
  return { ok: errors.length === 0, sourceSha: manifest?.source_commit ?? null, files: manifest?.files?.length ?? 0, errors };
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
      const verified = verifyVendor({ root: projectRoot, expectedSha });
      if (!verified.ok) throw new Error(`Existing vendor copy does not match: ${verified.errors.join('; ')}`);
      return { files: verified.files, bytes: inventory.bytesTotal, written: false, sourceSha: expectedSha };
    }
    staging = mkdtempSync(join(parent, '.omega-stage-'));
    for (const entry of inventory.files) {
      const from = join(sourceDir, ...entry.path.split('/'));
      const to = join(staging, ...entry.path.split('/'));
      mkdirSync(dirname(to), { recursive: true });
      const bytes = readFileSync(from);
      if (bytes.length !== entry.bytes || hash('sha256', bytes) !== entry.sha256) {
        throw new Error(`Source changed during import: ${entry.path}`);
      }
      writeFileSync(to, bytes, { flag: 'wx', mode: entry.mode === '100755' ? 0o755 : 0o644 });
      chmodSync(to, entry.mode === '100755' ? 0o755 : 0o644);
    }
    const manifest = { schema: 1, source_commit: expectedSha, source_repository: 'mojealterego/locally-uncensored', files: inventory.files };
    writeFileSync(join(staging, MANIFEST), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
    if (existsSync(destination)) throw new Error('Destination appeared during import');
    renameSync(staging, destination);
    staging = null;
    const verified = verifyVendor({ root: projectRoot, expectedSha });
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
    const result = flags.includes('--check') ? verifyVendor() : vendorize({ apply: flags.includes('--apply') });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.ok === false) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
