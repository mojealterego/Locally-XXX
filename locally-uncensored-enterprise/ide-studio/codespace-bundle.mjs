import {Workspace} from './workspace.mjs';
const OID=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const HEX=/^[0-9a-f]{64}$/;
const fail=()=>{throw Error('Invalid Codespace bundle')};
export async function importCodespaceBundle(payload){if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).sort().join(',')!=='commit,files,kind'||payload.kind!=='omega-codespace-v1'||typeof payload.commit!=='string'||!OID.test(payload.commit)||!Array.isArray(payload.files)||payload.files.length>64)fail();const w=new Workspace();for(const f of payload.files){if(!f||typeof f!=='object'||Object.keys(f).sort().join(',')!=='path,sha256,text'||typeof f.text!=='string'||typeof f.sha256!=='string'||!HEX.test(f.sha256))fail();const bytes=new TextEncoder().encode(f.text);const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);const actual=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');if(actual!==f.sha256)fail();w.add(f.path,f.text)}return w}
