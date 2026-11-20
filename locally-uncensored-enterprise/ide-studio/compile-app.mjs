#!/usr/bin/env node
import {lstatSync,readFileSync} from 'node:fs';
import {compileAppGraph} from './visual-compiler.mjs';
try {
 if(process.argv.length!==3)throw Error('Expected one graph JSON file');
 const file=process.argv[2],info=lstatSync(file);
 if(!info.isFile()||info.isSymbolicLink()||info.size>65536)throw Error('Invalid graph file');
 const source=readFileSync(file,'utf8');
 const compiled=compileAppGraph(JSON.parse(source));
 process.stdout.write(JSON.stringify(compiled)+'\n');
} catch {console.error('Graph rejected or compiler unavailable');process.exitCode=1}
