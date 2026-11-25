import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {evaluateLocalModel,validateEvaluationPlan} from '../scripts/model-eval.mjs';
const plan={schema_version:'omega.model.eval.v1',model:'local_gguf',cases:[
  {id:'polish-1',language:'pl',prompt:'Podaj polskie miasto nad Wisłą',expected:['Kraków']},
  {id:'english-1',language:'en',prompt:'Name the color of the sky',expected:['blue']}
]};
async function server(callback){const s=createServer(async(req,res)=>{let raw='';for await(const data of req)raw+=data;callback(req,res,JSON.parse(raw))});s.listen(0,'127.0.0.1');await once(s,'listening');return {url:`http://127.0.0.1:${s.address().port}/v1/chat/completions`,close:async()=>{s.close();await once(s,'close')}}}
test('MODEL-EVAL-01 scores real loopback responses for PL and EN',async()=>{
 const s=await server((req,res,body)=>{assert.equal(req.url,'/v1/chat/completions');assert.equal(body.temperature,0);res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:body.messages[0].content.includes('polskie')?' Kraków ':'blue'}}]}))});
 try{const r=await evaluateLocalModel(plan,{endpoint:s.url});assert.equal(r.summary.pl.passed,1);assert.equal(r.summary.en.passed,1);assert.equal(r.sample_count,2);assert.equal(r.execution,'REAL_LOOPBACK_RESPONSES');assert.match(r.results[0].output_sha256,/^[0-9a-f]{64}$/)}finally{await s.close()}
});
test('MODEL-EVAL-02 rejects external URLs to prevent SSRF',async()=>{
 for(const url of ['https://api.example.com/v1/chat/completions','http://192.168.1.1:8080/v1/chat/completions','http://127.0.0.1:8000/secret','http://user:pass@127.0.0.1:8080/v1/chat/completions'])
 await assert.rejects(evaluateLocalModel(plan,{endpoint:url}),/INVALID_LOCAL_ENDPOINT/)
});
test('MODEL-EVAL-03 rejects invalid plans, duplicates and out-of-range cases',()=>{
 assert.throws(()=>validateEvaluationPlan({...plan,cases:[plan.cases[0],plan.cases[0]]}),/INVALID_EVALUATION_CASE/);
 assert.throws(()=>validateEvaluationPlan({...plan,model:'../../escape'}),/INVALID_EVALUATION_PLAN/);
 assert.throws(()=>validateEvaluationPlan({...plan,cases:[{...plan.cases[0],language:'de'}]}),/INVALID_EVALUATION_CASE/)
});
test('MODEL-EVAL-04 records HTTP errors as distinct from incorrect answers',async()=>{
 const s=await server((req,res,body)=>{if(body.messages[0].content.includes('polskie')){res.statusCode=503;res.end('offline');return}res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:'red'}}]}))});
 try{const r=await evaluateLocalModel(plan,{endpoint:s.url});assert.equal(r.summary.pl.transport_errors,1);assert.equal(r.summary.pl.accuracy,0);assert.equal(r.summary.en.transport_errors,0);assert.equal(r.summary.en.passed,0);assert.equal(r.results[0].state,'ERROR');assert.equal(r.results[1].state,'OK')}finally{await s.close()}
});
