import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {handleOmegaStudioHttp} from '../apps/web/omega-studio-http.mjs';
const request={operation:'geometry',camera:{fx:100,fy:100,cx:49.5,cy:49.5,width:100,height:100,skew:0},crop:null,point:{u:79.5,v:89.5,depth:10,kind:'optical_z'}};
test('GEO-06 real HTTP to vendored geometry engine; rejects foreign origin and unsupported claims',async()=>{
 const server=createServer(async(req,res)=>{try{if(!await handleOmegaStudioHttp(req,res,server.address().port)){res.statusCode=404;res.end()}}catch{res.statusCode=500;res.end()}});
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const base='http://127.0.0.1:'+server.address().port;
  const post=(value,origin=base)=>fetch(base+'/api/local/omega-studio/plan',{method:'POST',headers:{origin,'content-type':'application/json','x-omega-studio':'1'},body:JSON.stringify(value)});
  assert.equal((await post(request,'https://example.invalid')).status,403);
  assert.equal((await post({...request,unit:'meters'})).status,400);
  assert.equal((await post({...request,point:{...request.point,depth:-1}})).status,400);
  const response=await post(request);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const data=await response.json();assert.equal(data.schema,'omega.studio.bridge.v1');assert.equal(data.executed,false);assert.deepEqual(data.result.xyz,[3,4,10]);assert.equal(data.result.unit,'arbitrary_scale');assert.equal(data.result.measurement_verified,false);
 }finally{server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve))}
});
