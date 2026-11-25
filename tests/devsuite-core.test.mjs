import test from 'node:test';
import assert from 'node:assert/strict';
import { formatJson, encodeBase64, decodeBase64, inspectJwt, digest, generatePassword, uuidV4, tools } from '../scripts/devsuite-core.mjs';

test('JSON formatting and invalid input', () => {
  assert.equal(formatJson('{"a":1}'), '{\n  "a": 1\n}');
  assert.throws(() => formatJson('{'), SyntaxError);
  assert.throws(() => formatJson('{}', 20), RangeError);
});

test('Base64 round trip Unicode and reject malformed data', () => {
  assert.equal(decodeBase64(encodeBase64('Zażółć 🦊')), 'Zażółć 🦊');
  assert.throws(() => decodeBase64('a'), TypeError);
  assert.throws(() => decodeBase64('/w=='), TypeError);
});

test('JWT inspection never claims signature verification', () => {
  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
  const jwt = enc({alg:'HS256',typ:'JWT'}) + '.' + enc({sub:'123',exp:123456}) + '.signature';
  const result = inspectJwt(jwt);
  assert.equal(result.payload.sub, '123');
  assert.equal(result.verified, false);
  assert.throws(() => inspectJwt('invalid'), TypeError);
});

test('digest uses known SHA-256 vector and rejects unknown algorithm', () => {
  assert.equal(digest('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.throws(() => digest('abc', 'none'), TypeError);
});

test('password generation and UUID v4', () => {
  const password = generatePassword(48, 'abc123');
  assert.equal(password.length, 48);
  assert.match(password, /^[abc123]+$/);
  assert.throws(() => generatePassword(2), RangeError);
  assert.match(uuidV4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('registry exposes real functions', () => {
  assert.equal(Object.keys(tools).length, 7);
  for (const value of Object.values(tools)) assert.equal(typeof value, 'function');
});
