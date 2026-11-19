import { createHash } from 'node:crypto';
import { PINNED_UPSTREAM_SHA } from './upstream-gate.mjs';

export const PINNED_INDEX_SHA256 = '63ceddf8e29aac9a80a2245f263dd464ec5eb21b3de7516cc728313d90eba0ee';

export function resolveIndexDigest(expectedSha, expectedIndexSha256) {
  if (typeof expectedSha !== 'string' || !/^[a-f0-9]{40}$/.test(expectedSha)) throw Error('Invalid expected source commit');
  const digest = expectedIndexSha256 === undefined && expectedSha === PINNED_UPSTREAM_SHA ? PINNED_INDEX_SHA256 : expectedIndexSha256;
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw Error('Missing or invalid trusted index digest');
  if (expectedSha === PINNED_UPSTREAM_SHA && digest !== PINNED_INDEX_SHA256) throw Error('Cannot override production index digest');
  return digest;
}

export function assertIndexBytes(bytes, digest) {
  if (!Buffer.isBuffer(bytes) || createHash('sha256').update(bytes).digest('hex') !== digest) throw Error('Source index digest mismatch');
}
