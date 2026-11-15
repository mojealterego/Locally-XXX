import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADER_BYTES = 24;
const GIB = 1024 ** 3;

export function parseGGUFHeader(data) {
  if (!Buffer.isBuffer(data) || data.length < HEADER_BYTES) throw new Error('GGUF header is truncated (minimum 24 bytes)');
  if (data.toString('ascii', 0, 4) !== 'GGUF') throw new Error('Invalid GGUF magic');
  const version = data.readUInt32LE(4);
  if (version !== 2 && version !== 3) throw new Error('Unsupported GGUF version: ' + version);
  const tensorCount = data.readBigUInt64LE(8);
  const metadataCount = data.readBigUInt64LE(16);
  if (tensorCount > 10_000_000n || metadataCount > 10_000_000n) throw new Error('GGUF header declares implausible entry counts');
  return { version, tensorCount: tensorCount.toString(), metadataCount: metadataCount.toString() };
}

/** Heuristic for disk file size, NOT a compatibility or inference benchmark. */
export function evaluateMemory(fileBytes, { ramGiB = 12, reserveGiB = 3, overheadFactor = 1.25 } = {}) {
  if (!Number.isSafeInteger(fileBytes) || fileBytes < 0) throw new RangeError('Invalid model size');
  if (![ramGiB, reserveGiB, overheadFactor].every(Number.isFinite) ||
      ramGiB <= 0 || reserveGiB < 0 || overheadFactor < 1) throw new RangeError('Invalid memory profile');
  const availableGiB = Math.max(0, ramGiB - reserveGiB);
  const estimatedPeakGiB = fileBytes / GIB * overheadFactor;
  const thresholdBytes = Math.floor(availableGiB * GIB / overheadFactor);
  return {
    ramGiB, reserveGiB, overheadFactor,
    estimatedPeakGiB: Number(estimatedPeakGiB.toFixed(3)),
    availableGiB: Number(availableGiB.toFixed(3)),
    thresholdBytes,
    fileOnlyWithinBudget: fileBytes <= thresholdBytes,
    qualification: 'Szacunek na podstawie rozmiaru pliku; nie jest testem inferencji, VRAM ani wydajności urządzenia.',
  };
}

export async function inspectGGUF(filePath, { sha256 = false, memoryProfile } = {}) {
  if (extname(filePath).toLowerCase() !== '.gguf') throw new Error('Only .gguf files can be inspected');
  const lst = await lstat(filePath);
  if (!lst.isFile() || lst.isSymbolicLink()) throw new Error('Model must be a regular file, not a symlink');
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const file = await open(filePath, flags);
  try {
    const before = await file.stat();
    if (!before.isFile()) throw new Error('Not a regular file');
    if (!Number.isSafeInteger(before.size)) throw new Error('Model file size exceeds safe integer range');
    const header = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await file.read(header, 0, HEADER_BYTES, 0);
    if (bytesRead !== HEADER_BYTES) throw new Error('GGUF header is truncated');
    const parsed = parseGGUFHeader(header);
    let digest = null;
    if (sha256) {
      const hash = createHash('sha256');
      const stream = file.createReadStream({ start: 0, highWaterMark: 1024 * 1024, autoClose: false });
      for await (const chunk of stream) hash.update(chunk);
      digest = hash.digest('hex');
    }
    const after = await file.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ino !== before.ino)
      throw new Error('Model file changed while being inspected');
    return {
      name: basename(filePath), bytes: before.size, ...parsed,
      ...(digest === null ? {} : { sha256: digest }),
      memory: evaluateMemory(before.size, memoryProfile),
    };
  } finally {
    await file.close();
  }
}

export async function scanGGUF(root, {
  sha256 = false, maxDepth = 12, maxEntries = 50_000, memoryProfile,
} = {}) {
  if (typeof root !== 'string' || !root.trim()) throw new TypeError('Model directory is required');
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > 64)
    throw new RangeError('Invalid maxDepth');
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 1_000_000)
    throw new RangeError('Invalid maxEntries');
  const top = resolve(root);
  const lst = await lstat(top);
  if (!lst.isDirectory() || lst.isSymbolicLink())
    throw new Error('Model root must be a real directory, not a symlink');
  const canonicalRoot = await realpath(top);
  const models = [], rejected = [];
  const stack = [{ directory: top, depth: 0 }];
  let visitedEntries = 0;
  while (stack.length) {
    const { directory, depth } = stack.pop();
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (++visitedEntries > maxEntries) throw new Error('Directory entry limit exceeded (' + maxEntries + ')');
      const absolute = join(directory, entry.name);
      const rel = relative(top, absolute).split(sep).join('/');
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) {
        rejected.push({ path: rel, reason: 'Symbolic links are not followed' });
        continue;
      }
      if (info.isDirectory()) {
        if (depth >= maxDepth) {
          rejected.push({ path: rel, reason: 'Maximum directory depth exceeded' });
        } else {
          const canonical = await realpath(absolute);
          if (canonical !== canonicalRoot && !canonical.startsWith(canonicalRoot + sep))
            rejected.push({ path: rel, reason: 'Directory escapes model root' });
          else stack.push({ directory: absolute, depth: depth + 1 });
        }
        continue;
      }
      if (extname(entry.name).toLowerCase() !== '.gguf') continue;
      try {
        models.push({ path: rel, ...await inspectGGUF(absolute, { sha256, memoryProfile }) });
      } catch (error) {
        rejected.push({ path: rel, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  models.sort((a, b) => a.path.localeCompare(b.path));
  rejected.sort((a, b) => a.path.localeCompare(b.path));
  return {
    schema: 1, directory: canonicalRoot, visitedEntries,
    files: models.length,
    bytes: models.reduce((total, model) => total + model.bytes, 0),
    models, rejected, status: rejected.length ? 'partial' : 'verified-headers',
    disclaimer: 'Zweryfikowano wyłącznie nagłówki GGUF i opcjonalne SHA-256; nie sprawdzono tensorów ani wykonania inferencji.',
  };
}

function parseCLI(argv) {
  if (!argv.length)
    throw new Error('Usage: node scripts/gguf-inventory.mjs <directory> [--sha256] [--ram-gib N] [--reserve-gib N]');
  const root = argv[0], profile = {};
  let sha256 = false;
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--sha256') { sha256 = true; continue; }
    if (flag === '--ram-gib' || flag === '--reserve-gib') {
      if (!argv[i + 1]) throw new Error('Missing value after ' + flag);
      const number = Number(argv[++i]);
      if (flag === '--ram-gib') profile.ramGiB = number;
      else profile.reserveGiB = number;
      continue;
    }
    throw new Error('Unknown flag: ' + flag);
  }
  evaluateMemory(0, profile);
  return { root, sha256, memoryProfile: profile };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseCLI(process.argv.slice(2));
    const result = await scanGGUF(options.root, options);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.rejected.length) process.exitCode = 2;
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  }
}
