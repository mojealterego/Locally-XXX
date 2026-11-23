#!/usr/bin/env node
/** Compile production planning manifest to stdout. No model execution or remote I/O. */
import {readFileSync,statSync} from 'node:fs';
import {compileProductionIntegration} from './bridge.mjs';
if(process.argv.length!==3){console.error('Usage: node cli.mjs <trusted-local-request.json>');process.exitCode=2}
else {
 try {
  const file=process.argv[2];
  if(statSync(file).size>2_000_000)throw new Error('Input exceeds 2MB');
  const request=JSON.parse(readFileSync(file,'utf8'));
  process.stdout.write(JSON.stringify(compileProductionIntegration(request),null,2)+'\n');
 }catch(e){console.error(`${e.code??'ERROR'}: ${e.message}`);process.exitCode=1}
}
