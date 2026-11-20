#!/usr/bin/env node
import {readFileSync,statSync} from 'node:fs';
import {ReviewClient} from '../agent-sdk/src/review-client.mjs';
function read(path){if(!statSync(path).isFile()||statSync(path).size>262144)throw Error('Invalid input file');return readFileSync(path,'utf8')}
async function main(){const [cmd,...args]=process.argv.slice(2);if(cmd==='inspect'&&args.length===1){const {inspectSource}=await import('../../ide-studio/inspect.mjs');return inspectSource(args[0],read(args[0]))}const c=new ReviewClient({base:process.env.OMEGA_REVIEW_URL,token:()=>process.env.OMEGA_REVIEW_TOKEN});if(cmd==='review-get'&&args.length===1)return c.get(args[0]);if(cmd==='review-submit'&&args.length===1)return c.submit(JSON.parse(read(args[0])));if(cmd==='review-decide'&&args.length===3&&['approve','reject'].includes(args[2]))return c.decide(args[0],args[1],args[2]==='approve');throw Error('Unknown command')}
try{console.log(JSON.stringify(await main(),null,2))}catch{console.error('Operation failed. Check command, configuration and permissions.');process.exitCode=1}
