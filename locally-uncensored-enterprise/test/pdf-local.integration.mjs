import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {handlePdfHttp} from '../apps/web/pdf-http.mjs';
const report={title:'Raport OMEGA',author:'Operator',generatedAt:'2026-11-27T00:00:00Z',sections:[{heading:'Wyniki',paragraphs:['Zażółć gęślą jaźń.']}]};
test('PDF-HTTP-01..06: real HTTP, ReportLab, reproducibility and denied requests',async()=>{
 const server=createServer(async(req,res)=>{try{if(!await handlePdfHttp(req,res,server.address().port)){res.statusCode=404;res.end()}}catch{res.statusCode=500;res.end()}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 try{
  const base=`http://127.0.0.1:${server.address().port}`,url=base+'/api/local/pdf/render';
  const headers={origin:base,'content-type':'application/json','x-omega-pdf':'1'};
  const post=(body=report,h=headers)=>fetch(url,{method:'POST',headers:h,body:JSON.stringify(body)});
  const a=await post();assert.equal(a.status,200);assert.equal(a.headers.get('content-type'),'application/pdf');assert.equal(a.headers.get('cache-control'),'no-store');const pdf=Buffer.from(await a.arrayBuffer());assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.match(pdf.subarray(-2048).toString('latin1'),/%%EOF/);
  const b=await post();assert.equal(b.status,200);assert.deepEqual(Buffer.from(await b.arrayBuffer()),pdf);
  assert.equal((await post(report,{...headers,origin:'https://example.invalid'})).status,403);
  assert.equal((await post({...report,title:''})).status,400);
  assert.equal((await fetch(url)).status,405);
  assert.equal((await post({...report,extra:'x'.repeat(146000)})).status,413);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
