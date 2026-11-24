// Trusted single-operator adapter. Not a tenant-facing cloud route.
import {parseUpstreamSse} from './providers.mjs';

const URL = 'http://127.0.0.1:8788/v1/chat/completions';
const reject = () => { throw new Error('OMEGA local gateway rejected request'); };

export function makeOmegaLocalRequest(messages, token, maxTokens = 512) {
  if (typeof token !== 'string' || !/^[!-~]{32,512}$/.test(token)
      || !Array.isArray(messages) || messages.length < 1 || messages.length > 34
      || !Number.isInteger(maxTokens) || maxTokens < 16 || maxTokens > 4096) reject();
  let bytes = 0;
  let next = 'user';
  const checked = messages.map((message, index) => {
    if (!message || Object.keys(message).sort().join(',') !== 'content,role'
        || typeof message.content !== 'string') reject();
    bytes += Buffer.byteLength(message.content, 'utf8');
    if (bytes > 16384) reject();
    if (!(index === 0 && message.role === 'system')) {
      if (message.role !== next || !message.content.trim()) reject();
      next = next === 'user' ? 'assistant' : 'user';
    }
    return {role: message.role, content: message.content};
  });
  if (next !== 'assistant') reject();
  return {url: URL, options: {
    method: 'POST', redirect: 'error',
    headers: {authorization: 'Bearer ' + token, 'content-type': 'application/json', accept:'text/event-stream'},
    body: JSON.stringify({model:'omega-local',messages:checked,max_tokens:maxTokens,n:1,stream:true})
  }};
}

export async function* omegaLocalStream(messages, token, {
  maxTokens = 512, fetchImpl = fetch, signal
} = {}) {
  const {url, options} = makeOmegaLocalRequest(messages, token, maxTokens);
  const deadline = AbortSignal.timeout(120000);
  let response;
  try {
    response = await fetchImpl(url, {...options, signal: signal ? AbortSignal.any([signal,deadline]) : deadline});
  } catch { reject(); }
  if (!response?.ok || !response.body
      || response.headers.get('x-omega-provider') !== 'local'
      || response.headers.get('content-type')?.split(';')[0].trim() !== 'text/event-stream') reject();
  yield* parseUpstreamSse(response.body, 'openai');
}
