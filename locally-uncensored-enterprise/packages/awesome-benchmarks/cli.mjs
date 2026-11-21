import {readFileSync,writeFileSync} from 'node:fs';
import {runOllamaBenchmark,compareObservations} from './benchmark.mjs';
function args(raw){if(raw.length%2)throw Error('Missing CLI argument');const o={};for(let i=0;i<raw.length;i+=2){const k=raw[i];if(!/^--[a-z-]+$/.test(k)||Object.hasOwn(o,k))throw Error('Invalid flag');o[k]=raw[i+1]}return o}
try{
 const [command,...flags]=process.argv.slice(2),a=args(flags);
 if(command==='run'){
  if(a['--execute']!=='YES'||!a['--model']||!a['--prompt-file']||!a['--output']||Object.keys(a).some(k=>!['--execute','--model','--prompt-file','--output','--samples','--port','--hardware'].includes(k)))throw Error('Explicit --execute YES and required arguments needed');
  const prompt=readFileSync(a['--prompt-file'],'utf8');
  const result=await runOllamaBenchmark({model:a['--model'],prompt,port:a['--port']===undefined?11434:Number(a['--port']),samples:a['--samples']===undefined?3:Number(a['--samples']),hardwareId:a['--hardware']??'unverified'});
  writeFileSync(a['--output'],JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});process.stdout.write('Saved measured result: '+a['--output']+'\n');
 }else if(command==='compare'){
  if(!a['--left']||!a['--right']||Object.keys(a).some(k=>!['--left','--right'].includes(k)))throw Error('Require two files');const result=compareObservations(JSON.parse(readFileSync(a['--left'],'utf8')),JSON.parse(readFileSync(a['--right'],'utf8')));process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }else throw Error('Unknown command');
}catch(e){process.stderr.write('Benchmark rejected: '+e.message+'\n');process.exitCode=1}
