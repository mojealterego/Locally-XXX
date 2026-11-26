import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCurl} from '../scripts/devsuite-network.mjs';
const dir=await mkdtemp(join(tmpdir(),'omega-curl-'));
const observed=[];
const server=createServer(async (req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);observed.push({url:req.url,body:Buffer.concat(chunks).toString('utf8'),header:req.headers['x-fixture-config']});res.end('ok');});
try {
 await writeFile(join(dir,'fixture.txt'),'LOCAL_FIXTURE_NOT_TO_SEND');
 await writeFile(join(dir,'.curlrc'),'header = "X-Fixture-Config: enabled"\n');
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const url=`http://127.0.0.1:${server.address().port}/{a,b}`;
 const cmd=createCurl(JSON.stringify({method:'POST',url,body:'@fixture.txt'}));
 const {stdout}=await promisify(execFile)('/bin/sh',['-c',cmd],{cwd:dir,env:{PATH:process.env.PATH,HOME:dir,CURL_HOME:dir,NO_PROXY:'127.0.0.1'},timeout:5000});
 assert.equal(stdout,'ok');
 assert.equal(observed.length,1);assert.equal(observed[0].url,'/{a,b}');assert.equal(observed[0].body,'@fixture.txt');assert.equal(observed[0].header,undefined);
 console.log('NET-09 PASS: real shell + curl + loopback; exactly one request, literal body, no implicit config header.');
} finally {server.close();await rm(dir,{recursive:true,force:true});}
