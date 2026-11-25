import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {handleMediaPreviewHttp} from '../apps/web/media-preview-http.mjs';
const preview={schema_version:'omega.media.preview.v1',status:'CPU_REFERENCE_PREVIEW_NO_VIDEO_RENDER',generated_video:false,rendered_image:false,persistent:false};
async function withServer(run,runner=async()=>preview){
 const s=createServer(async(req,res)=>{if(!await handleMediaPreviewHttp(req,res,s.address().port,runner)){res.statusCode=404;res.end()}});
 s.listen(0,'127.0.0.1');await once(s,'listening');try{await run(s.address().port)}finally{s.close();await once(s,'close')}
}
const send=(port,body,headers={})=>fetch(`http://127.0.0.1:${port}/api/local/media/preview`,{method:'POST',headers:{origin:`http://127.0.0.1:${port}`,'x-omega-preview':'1','content-type':'application/json',...headers},body});
test('MEDIA-HTTP-01 accepts CPU-only preview status',async()=>withServer(async port=>{
 const r=await send(port,'{}');assert.equal(r.status,200);assert.deepEqual(await r.json(),preview);
}));
test('MEDIA-HTTP-02 protects origin and request budget',async()=>withServer(async port=>{
 assert.equal((await send(port,'{}',{origin:'https://evil.example'})).status,403);
 assert.equal((await send(port,'{}',{'x-omega-preview':'0'})).status,403);
 assert.equal((await send(port,'{')).status,400);
 assert.equal((await send(port,JSON.stringify({input:'x'.repeat(140000)}))).status,413);
}));
test('MEDIA-HTTP-03 refuses forged rendered result',async()=>withServer(async port=>{
 assert.equal((await send(port,'{}')).status,502);
},async()=>({...preview,generated_video:true})));
