import {fileURLToPath} from 'node:url';
import {Worker as BullWorker,FlowProducer} from 'bullmq';
import {Worker,NativeConnection} from '@temporalio/worker';
import {database,redis,temporal,policy,required,TASK_QUEUE} from './config.mjs';
import {Repository} from './db/repository.mjs';
import {QUEUES,reviewJob,aggregateJob} from './queues/review.mjs';
import {reviewActivities} from './temporal/service.mjs';
async function main(){const pool=database();const repo=new Repository(pool),permit=policy();let flow,child,parent,conn,worker;let stopping=false;
  try{await pool.query('SELECT 1');flow=new FlowProducer({connection:redis()});await flow.waitUntilReady();conn=await NativeConnection.connect(temporal());worker=await Worker.create({connection:conn,namespace:required('OMEGA_TEMPORAL_NAMESPACE'),taskQueue:TASK_QUEUE,workflowsPath:fileURLToPath(new URL('./temporal/workflows.mjs',import.meta.url)),activities:reviewActivities(repo,permit,flow),maxConcurrentActivityTaskExecutions:8,maxConcurrentWorkflowTaskExecutions:8,shutdownGraceTime:'30 seconds'});
    child=new BullWorker(QUEUES.children,j=>reviewJob(j,repo,permit),{connection:redis(true),concurrency:4,autorun:false});parent=new BullWorker(QUEUES.parent,j=>aggregateJob(j,repo,permit),{connection:redis(true),concurrency:2,autorun:false});for(const w of [child,parent])w.on('error',()=>console.error('Queue worker error'));await Promise.all([child.waitUntilReady(),parent.waitUntilReady()]);
    const stop=()=>{if(!stopping){stopping=true;worker.shutdown();void Promise.allSettled([child.close(),parent.close()])}};process.once('SIGINT',stop);process.once('SIGTERM',stop);
    const runs=[child.run(),parent.run(),worker.run()];try{await Promise.race(runs)}finally{stop();await Promise.allSettled(runs);process.off('SIGINT',stop);process.off('SIGTERM',stop)}
  }finally{await Promise.allSettled([child?.close(),parent?.close()]);await flow?.close();await conn?.close();await pool.end()}}
main().catch(()=>{console.error('Review worker failed');process.exitCode=1});
