import test from 'node:test';
import assert from 'node:assert/strict';
import {makeOmegaLocalRequest,omegaLocalStream} from '../src/cloud/omega-local.mjs';

const token = 'x'.repeat(32);
const messages = [{role:'user',content:'  żółć\n'}];
test('fixed loopback and preserved input', () => {
  const req = makeOmegaLocalRequest(messages,token);
  assert.equal(req.url,'http://127.0.0.1:8788/v1/chat/completions');
  assert.deepEqual(JSON.parse(req.options.body).messages,messages);
  assert.equal(JSON.parse(req.options.body).model,'omega-local');
  assert.equal(req.options.redirect,'error');
});
test('reject invalid history and token', () => {
  assert.throws(()=>makeOmegaLocalRequest(messages,'x'));
  assert.throws(()=>makeOmegaLocalRequest([{role:'assistant',content:'x'}],token));
  assert.throws(()=>makeOmegaLocalRequest([{role:'user',content:'x',tools:[]}],token));
  assert.throws(()=>makeOmegaLocalRequest(messages,token,4097));
});
const collect=async stream=>{let s='';for await(const chunk of stream)s+=chunk;return s;};
const response=(provider,body)=>new Response(body,{headers:{'content-type':'text/event-stream','x-omega-provider':provider}});
test('collect local SSE only after terminal event', async()=>{
  const fake=async()=>response('local','data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n');
  assert.equal(await collect(omegaLocalStream(messages,token,{fetchImpl:fake})),'OK');
});
test('reject cloud provider and incomplete stream',async()=>{
  await assert.rejects(collect(omegaLocalStream(messages,token,{fetchImpl:async()=>response('openai','data: [DONE]\n\n')})));
  await assert.rejects(collect(omegaLocalStream(messages,token,{fetchImpl:async()=>response('local','data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')})));
});
