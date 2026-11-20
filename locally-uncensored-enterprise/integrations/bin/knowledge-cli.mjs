#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chunkKnowledge,searchKnowledge,indexPgvector,ollamaEmbed} from '../src/knowledge.mjs';
const repo='PurpleDoubleD/awesome-local-llm',commit='713624bfc7e338da5cc5fb1c4ae9dfce70dc23f9',blob='132aabf970db777b3ec6d71949cb582e7f4035b7';
const file=new URL('../vendor/awesome-local-llm/README.md',import.meta.url);
async function main(){const [op,...args]=process.argv.slice(2);if(!['inspect','search','ingest'].includes(op))throw Error('Unsupported action');const raw=await readFile(file);if(raw.length>1048576||createHash('sha1').update(Buffer.from(`blob ${raw.length}\0`)).update(raw).digest('hex')!==blob)throw Error('Vendor source integrity failed');const index=chunkKnowledge(raw.toString('utf8'),{sourceRepo:repo,commit});if(op==='inspect'){if(args.length)throw Error('Unexpected arguments');return {source:index.source,sourceSha256:index.sourceSha256,documentId:index.documentId,chunks:index.chunks.length,embeddingStatus:'NOT_CREATED'}}if(op==='search'){if(args.length<1||args.length>1)throw Error('Expected one search term');return {results:searchKnowledge(index,args[0])}}
 if(args.length)throw Error('Unexpected arguments');if(process.env.OMEGA_CONFIRM_KNOWLEDGE_INDEX!=='YES')throw Error('Explicit acknowledgement required');const tenant=process.env.OMEGA_TENANT_ID,model=process.env.OMEGA_EMBEDDING_MODEL;const {database}=await import('../../backend/src/config.mjs');const pool=database();try{return await indexPgvector({pool,tenant,embeddingModel:model,index,embed:text=>ollamaEmbed(text,{model})})}finally{await pool.end()}}
try{process.stdout.write(JSON.stringify(await main(),null,2)+'\n')}catch(e){console.error('Knowledge operation failed:',e.message);process.exitCode=1}
