import { createHash, randomBytes, randomUUID } from 'node:crypto';

export function formatJson(input, indent = 2) {
  if (!Number.isInteger(indent) || indent < 0 || indent > 8) throw new RangeError('indent must be 0..8');
  return JSON.stringify(JSON.parse(input), null, indent);
}

export function encodeBase64(input) {
  return Buffer.from(input, 'utf8').toString('base64');
}

export function decodeBase64(input) {
  if (typeof input !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input))
    throw new TypeError('invalid canonical Base64');
  const bytes = Buffer.from(input, 'base64');
  const decoded = bytes.toString('utf8');
  if (!Buffer.from(decoded, 'utf8').equals(bytes)) throw new TypeError('invalid UTF-8');
  return decoded;
}

export function inspectJwt(token) {
  if (typeof token !== 'string' || token.length > 65536) throw new TypeError('invalid token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new TypeError('expected compact JWS');
  const decode = part => {
    if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new TypeError('invalid Base64URL');
    const bytes = Buffer.from(part, 'base64url');
    if (bytes.toString('base64url') !== part) throw new TypeError('noncanonical Base64URL');
    return JSON.parse(bytes.toString('utf8'));
  };
  const header = decode(parts[0]);
  const payload = decode(parts[1]);
  if (!header || Array.isArray(header) || typeof header !== 'object' || !payload || Array.isArray(payload) || typeof payload !== 'object')
    throw new TypeError('JWT objects required');
  return { header, payload, signaturePresent: parts[2].length > 0, verified: false };
}

export function digest(input, algorithm = 'sha256') {
  if (!['sha256', 'sha512', 'sha1', 'md5'].includes(algorithm)) throw new TypeError('unsupported digest');
  return createHash(algorithm).update(input, 'utf8').digest('hex');
}

export function generatePassword(length = 24, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*') {
  if (!Number.isInteger(length) || length < 12 || length > 1024) throw new RangeError('length must be 12..1024');
  if (typeof alphabet !== 'string' || new Set(alphabet).size !== alphabet.length || alphabet.length < 2 || alphabet.length > 256)
    throw new TypeError('invalid alphabet');
  const threshold = 256 - (256 % alphabet.length);
  let output = '';
  while (output.length < length) {
    for (const value of randomBytes(Math.max(32, length - output.length))) {
      if (value < threshold) output += alphabet[value % alphabet.length];
      if (output.length === length) break;
    }
  }
  return output;
}

export function uuidV4() { return randomUUID(); }

export const tools = Object.freeze({
  'json.format': formatJson,
  'base64.encode': encodeBase64,
  'base64.decode': decodeBase64,
  'jwt.inspect': inspectJwt,
  'hash.digest': digest,
  'password.generate': generatePassword,
  'uuid.v4': uuidV4
});
