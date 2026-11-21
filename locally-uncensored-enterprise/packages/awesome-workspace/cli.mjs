import {listAwesome,verifyAwesome} from './registry.mjs';
const op=process.argv[2];try{
 if(process.argv.length!==3||!['list','verify'].includes(op))throw Error('Usage: node cli.mjs list|verify');
 const result=op==='list'?listAwesome():verifyAwesome();process.stdout.write(JSON.stringify(result,null,2)+'\n');if(op==='verify'&&result.invalid.length)process.exitCode=2;
}catch{process.stderr.write('Invalid command or missing module files\n');process.exitCode=1}
