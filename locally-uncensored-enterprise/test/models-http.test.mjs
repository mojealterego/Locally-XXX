import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {handleModelsHttp} from '../apps/web/models-http.mjs';
const inventory={models:[{path:'qwen.gguf',version:3,bytes:1000}],rejected:[],files:1};
async function withServer(run,modelDir='/trusted/models',scanner=async()=>inventory){
 const s=createServer(async(req,res)=>{if(!await handleModelsHttp(req,res,s.address().port,scanner,modelDir)){res.statusCode=404;res.end()}});
 s.listen(0,'127.0.0.1');await once(s,'listening');try{await run(s.address().port)}finally{s.close();await once(s,'close')}
}
const send=(p,headers={})=>fetch(`http://127.0.0.1:${p}/api/local/models/inventory`,{method:'POST',headers:{origin:`http://127.0.0.1:${p}`,'content-type':'application/json','x-omega-models':'1',...headers},body:'{}'});
test('MODELS-HTTP-01 reads operator-scoped GGUF headers and qualifies inference',async()=>withServer(async port=>{
 const r=await send(port);assert.equal(r.status,200);const x=await r.json();assert.equal(x.file_count,1);assert.equal(x.state,'GGUF_HEADERS_ONLY_NOT_INFERENCE');
}));
test('MODELS-HTTP-02 rejects cross-origin and wrong header',async()=>withServer(async port=>{
 assert.equal((await send(port,{origin:'https://attacker.example'})).status,403);
 assert.equal((await send(port,{'x-omega-models':'no'})).status,403);
}));
test('MODELS-HTTP-03 refuses unconfigured model directory',async()=>withServer(async port=>{
 assert.equal((await send(port)).status,503);
},null));
