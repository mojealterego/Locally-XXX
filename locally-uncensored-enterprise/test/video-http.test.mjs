import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {validateVideoOptions,editLocalVideo} from '../apps/web/video-runner.mjs';
import {handleVideoHttp} from '../apps/web/video-http.mjs';
const options={startMs:250,durationMs:500,height:240,mute:true};
test('VID-01 strict numeric and boolean options',()=>{
 assert.deepEqual(validateVideoOptions(options),options);for(const bad of [{...options,startMs:-1},{...options,durationMs:30001},{...options,height:9999},{...options,mute:'true'},{...options,path:'/etc/passwd'}])assert.throws(()=>validateVideoOptions(bad));
});
test('VID-02 actual ffmpeg MP4 import, trim, resize, mute and decode',async()=>{
 const root=await mkdtemp(join(tmpdir(),'omega-video-test-'));try{const src=join(root,'in.mp4'),dst=join(root,'out.mp4');execFileSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=24:duration=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-shortest',src],{timeout:20000});const bytes=await readFile(src);const result=await editLocalVideo(bytes,options);await writeFile(dst,result);const data=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',dst],{encoding:'utf8',timeout:5000}));assert.equal(data.streams.length,1);assert.equal(data.streams[0].codec_name,'h264');assert.equal(data.streams[0].height,240);assert.ok(Math.abs(Number(data.format.duration)-0.5)<0.12);execFileSync('ffmpeg',['-nostdin','-v','error','-i',dst,'-f','null','-'],{timeout:10000});await assert.rejects(editLocalVideo(bytes,{...options,startMs:1990,durationMs:500}),/VIDEO_RANGE/);await assert.rejects(editLocalVideo(Buffer.from('invalid bytes'),options),/VIDEO_INVALID/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('VID-03 actual HTTP bounds, origin and option validation',async()=>{
 let calls=0;const body=Buffer.from('fixture'),server=createServer(async(req,res)=>{try{if(!await handleVideoHttp(req,res,server.address().port,async(b,o)=>{calls++;assert.deepEqual(b,body);assert.deepEqual(o,options);return b})){res.statusCode=404;res.end()}}catch{res.statusCode=500;res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,headers={origin:base,'content-type':'video/mp4','x-omega-video':'1','x-omega-start-ms':'250','x-omega-duration-ms':'500','x-omega-height':'240','x-omega-mute':'1'};const post=(b=body,h=headers)=>fetch(base+'/api/local/video/edit',{method:'POST',headers:h,body:b});
 try{assert.equal((await post(body,{...headers,origin:'https://example.invalid'})).status,403);assert.equal((await post(body,{...headers,'x-omega-start-ms':'1e3'})).status,400);assert.equal((await post(Buffer.alloc(16*1024*1024+1))).status,413);assert.equal((await fetch(base+'/api/local/video/edit')).status,405);const r=await post();assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'video/mp4');assert.deepEqual(Buffer.from(await r.arrayBuffer()),body);assert.equal(calls,1)}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
test('VID-04 real HTTP to FFmpeg with audio preserved',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'omega-video-test-'));const server=createServer(async(req,res)=>{try{if(!await handleVideoHttp(req,res,server.address().port)){res.statusCode=404;res.end()}}catch{res.statusCode=500;res.end()}});
 try{const source=join(dir,'source.mp4'),target=join(dir,'target.mp4');execFileSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=320x240:rate=25:duration=1','-f','lavfi','-i','sine=frequency=330:duration=1','-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-shortest',source],{timeout:10000});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const r=await fetch(base+'/api/local/video/edit',{method:'POST',headers:{origin:base,'content-type':'video/mp4','x-omega-video':'1','x-omega-start-ms':'0','x-omega-duration-ms':'500','x-omega-height':'240','x-omega-mute':'0'},body:await readFile(source)});assert.equal(r.status,200);await writeFile(target,Buffer.from(await r.arrayBuffer()));const data=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',target],{encoding:'utf8',timeout:5000}));assert.deepEqual(data.streams.map(s=>s.codec_name),['h264','aac']);assert.ok(Math.abs(Number(data.format.duration)-0.5)<0.15);
 }finally{server.closeAllConnections();if(server.listening)await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true})}
});
