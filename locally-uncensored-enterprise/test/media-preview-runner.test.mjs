import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runMediaPreview} from '../apps/web/media-preview-runner.mjs';
function fixture(t,program){const root=mkdtempSync(join(tmpdir(),'omega-media-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const path=join(root,'fixture.py');writeFileSync(path,program);return path}
const output=`import json,sys\nx=json.load(sys.stdin)\nprint(json.dumps({'schema_version':'omega.media.preview.v1','status':'CPU_REFERENCE_PREVIEW_NO_VIDEO_RENDER','rendered_image':False,'generated_video':False,'persistent':False,'project_id':x['project_id']}))\n`;
test('MEDIA-RUN-01 executes fixed Python through isolated child stdin',async t=>{
 const path=fixture(t,output);const r=await runMediaPreview({project_id:'a'},{script:path});assert.equal(r.project_id,'a');assert.equal(r.generated_video,false);
});
test('MEDIA-RUN-02 rejects forged completed media response',async t=>{
 const path=fixture(t,"print('\\\"VIDEO_RENDERED\\\"')\n");await assert.rejects(runMediaPreview({project_id:'a'},{script:path}),/MEDIA_RESPONSE_INVALID/);
});
test('MEDIA-RUN-03 bounds request size before spawn',async()=>{
 await assert.rejects(runMediaPreview({payload:'x'.repeat(131072)}),/INVALID_MEDIA_REQUEST_SIZE/);
});
test('MEDIA-RUN-04 times out long-running process',async t=>{
 const path=fixture(t,'import time\ntime.sleep(3)\n');await assert.rejects(runMediaPreview({project_id:'a'},{script:path,timeoutMs:200}),/MEDIA_TIMEOUT/);
});
test('MEDIA-RUN-05 cancels child on explicit abort',async t=>{
 const path=fixture(t,'import time\ntime.sleep(3)\n');const controller=new AbortController();
 const pending=runMediaPreview({project_id:'a'},{script:path,signal:controller.signal});
 setTimeout(()=>controller.abort(),50);await assert.rejects(pending,/MEDIA_CANCELLED/);
});
