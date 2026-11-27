import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {ArtifactStore} from '../backend/src/storage/artifacts.mjs';
import {handleStorageHttp} from '../apps/web/storage-http.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const key=Buffer.alloc(32,5),bytes=Buffer.from('Zażółć gęślą jaźń\0');
function dir(){return mkdtempSync(join(tmpdir(),'omega-artifacts-'))}
function using(fn){const root=dir();try{return fn(root)}finally{rmSync(root,{recursive:true,force:true})}}
test('STOR-01 encrypted immutable roundtrip, deduplication, restart and quota',()=>using(root=>{
 let s=new ArtifactStore({directory:root,key,maxBytes:40,maxEntries:2});const a=s.put('tekst.txt',bytes);assert.equal(a.id,digest(bytes));assert.equal(a.bytes,bytes.length);assert.deepEqual(s.put('other.txt',bytes),a);assert.deepEqual(s.list(),[a]);assert.deepEqual(s.get(a.id).data,bytes);assert.throws(()=>s.put('overflow.bin',Buffer.alloc(40)));s.close();s=new ArtifactStore({directory:root,key,maxBytes:40,maxEntries:2});assert.deepEqual(s.get(a.id).data,bytes);assert.notDeepEqual(Buffer.from(s.db.prepare('SELECT ciphertext FROM artifacts').get().ciphertext),bytes);s.close();
}));
test('STOR-02 private directory, filename validation, wrong key and tampering fail closed',()=>using(root=>{
 const s=new ArtifactStore({directory:root,key});for(const name of ['../x','a/b','a\\b','\0','.', 'CON'])assert.throws(()=>s.put(name,bytes));const a=s.put('tekst.txt',bytes);s.close();const wrong=new ArtifactStore({directory:root,key:Buffer.alloc(32,6)});assert.throws(()=>wrong.get(a.id));assert.throws(()=>wrong.list());wrong.close();const good=new ArtifactStore({directory:root,key});good.db.prepare('UPDATE artifacts SET ciphertext=? WHERE id=?').run(Buffer.alloc(bytes.length),a.id);assert.throws(()=>good.get(a.id));assert.throws(()=>good.list());good.close();chmodSync(root,0o755);assert.throws(()=>new ArtifactStore({directory:root,key}));chmodSync(root,0o700);
}));
test('STOR-03 explicit delete and recovery of quota, no deletion by malformed identifier',()=>using(root=>{
 const s=new ArtifactStore({directory:root,key,maxEntries:1});const a=s.put('a.txt',bytes);assert.throws(()=>s.put('b.txt',Buffer.from('b')));assert.throws(()=>s.remove('../x'));assert.equal(s.remove(a.id),true);assert.equal(s.remove(a.id),false);assert.equal(s.get(a.id),null);assert.equal(s.put('b.txt',Buffer.from('b')).bytes,1);s.close();
}));
test('STOR-04 HTTP real encrypted storage and same-origin controls',async()=>{
 const root=dir(),store=new ArtifactStore({directory:root,key});let enabled=true;const server=createServer(async(req,res)=>{try{if(!await handleStorageHttp(req,res,server.address().port,()=>enabled?store:null)){res.statusCode=404;res.end()}}catch{res.statusCode=500;res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,headers={origin:base,'content-type':'application/json','x-omega-storage':'1'};const post=(op,data={},h=headers)=>fetch(base+'/api/local/storage/'+op,{method:'POST',headers:h,body:JSON.stringify(data)});
 try{assert.equal((await post('list',{}, {...headers,origin:'https://example.invalid'})).status,403);assert.equal((await post('list',{}, {...headers,'x-omega-storage':'0'})).status,403);assert.equal((await fetch(base+'/api/local/storage/list')).status,405);enabled=false;assert.equal((await post('list')).status,503);enabled=true;assert.equal((await post('put',{name:'x.txt',base64:'!'})).status,400);assert.equal((await post('put',{name:'x.txt',base64:bytes.toString('base64'),path:'/tmp/x'})).status,400);const r=await post('put',{name:'x.txt',base64:bytes.toString('base64')});assert.equal(r.status,200);const item=await r.json();assert.deepEqual(await (await post('list')).json(),{items:[item]});const dl=await post('get',{id:item.id});assert.equal(dl.status,200);assert.equal(dl.headers.get('content-type'),'application/octet-stream');assert.deepEqual(Buffer.from(await dl.arrayBuffer()),bytes);assert.equal((await post('remove',{id:item.id})).status,400);assert.equal((await post('remove',{id:item.id,confirm:item.id})).status,200);assert.equal((await post('get',{id:item.id})).status,404);assert.equal((await post('put',{name:'x.txt',base64:'a'.repeat(5700000)})).status,413);}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();rmSync(root,{recursive:true,force:true})}
});
