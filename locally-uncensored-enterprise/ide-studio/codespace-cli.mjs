#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {GitCodespace} from './codespace.mjs';
async function main(){const [cmd,root,commit,path,...rest]=process.argv.slice(2);if(rest.length||!['list','read','bundle'].includes(cmd)||!root||!commit||(cmd==='read'?!path:!!path))throw Error('Invalid arguments');const c=await GitCodespace.open({root,commit});if(cmd==='list')return {commit,files:await c.list()};if(cmd==='read')return await c.read(path);const files=[];let bytes=0;for(const entry of await c.list()){if(files.length>=64)break;if(bytes+entry.bytes>2097152)break;const data=await c.read(entry.path);files.push({path:data.path,text:data.text,sha256:createHash('sha256').update(data.text).digest('hex')});bytes+=entry.bytes}return {kind:'omega-codespace-v1',commit,files}}
try{process.stdout.write(JSON.stringify(await main())+'\n')}catch{console.error('Codespace access denied');process.exitCode=1}
