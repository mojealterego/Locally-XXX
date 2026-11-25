import test from 'node:test';
import assert from 'node:assert/strict';
import {executeLocalTool, LocalToolError} from '../apps/web/devsuite-service.mjs';

test('DEV-GATE-01 JSON utility reachable through native tool dispatcher', () => {
  const r = executeLocalTool({tool: 'json.format', args: {input: '{"ą":1}'}});
  assert.equal(r.result, '{\n  "ą": 1\n}');
});

test('DEV-GATE-02 safe Base64, hash and UUID', () => {
  const encoded = executeLocalTool({tool: 'base64.encode', args: {input: 'Łódź'}}).result;
  assert.equal(executeLocalTool({tool: 'base64.decode', args: {input: encoded}}).result, 'Łódź');
  assert.equal(executeLocalTool({tool: 'hash.digest', args: {input: 'abc'}}).result, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.match(executeLocalTool({tool: 'uuid.v4'}).result, /^[0-9a-f-]{36}$/);
});

test('DEV-GATE-03 rejects prototype injection, unknown tools, extra fields and arbitrary algorithms', () => {
  for (const x of [{tool: '__proto__'}, {tool: 'hash.digest', args: {input: 'abc', algorithm: 'sha999'}},
    {tool: 'uuid.v4', args: {unexpected: 1}}, Object.assign(Object.create(null), {tool: 'uuid.v4'})]) {
    assert.throws(() => executeLocalTool(x), LocalToolError);
  }
});

test('DEV-GATE-04 enforces input size and password parameters', () => {
  assert.throws(() => executeLocalTool({tool: 'base64.encode', args: {input: 'x'.repeat(40000)}}), LocalToolError);
  assert.throws(() => executeLocalTool({tool: 'password.generate', args: {length: 2}}), LocalToolError);
  const password=executeLocalTool({tool:'password.generate', args:{length:32,alphabet:'abc'}}).result;
  assert.equal(password.length,32);
  assert.match(password,/^[abc]+$/);
});

test('DEV-GATE-EXT-01 routes extended tools under same strict input policy',()=>{
 const item=executeLocalTool({tool:'ipv4.cidr',args:{input:'192.168.10.21/24'}});
 assert.equal(item.result.network,'192.168.10.0');
 assert.equal(executeLocalTool({tool:'html.escape',args:{input:'<test>'}}).result,'&lt;test&gt;');
 assert.throws(()=>executeLocalTool({tool:'ipv4.cidr',args:{input:'10.0.0.1/24',algorithm:'sha256'}}),LocalToolError);
});
test('DEV-GATE-05 JWT decode never implies verification', () => {
  const x = o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = x({alg:'HS256'})+'.'+x({sub:'user'})+'.sig';
  const info = executeLocalTool({tool:'jwt.inspect',args:{input:token}}).result;
  assert.equal(info.payload.sub,'user');
  assert.equal(info.verified,false);
});
