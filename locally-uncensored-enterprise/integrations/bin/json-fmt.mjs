#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {formatJson} from '../src/json-tools.mjs';
try{
 const [mode='pretty',file,...rest]=process.argv.slice(2);if(rest.length)throw Error('Unexpected arguments');
 let input;if(file){const bytes=await readFile(file);if(bytes.length>1024*1024)throw Error('Input exceeds limit');input=bytes.toString('utf8')}
 else{const chunks=[];let n=0;for await(const c of process.stdin){n+=c.length;if(n>1024*1024)throw Error('Input exceeds limit');chunks.push(c)}input=Buffer.concat(chunks).toString('utf8')}
 process.stdout.write(formatJson(input,mode));
}catch(e){console.error('json-fmt rejected input:',e.message);process.exitCode=1}
