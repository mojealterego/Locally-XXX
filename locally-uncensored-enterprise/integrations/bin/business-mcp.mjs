#!/usr/bin/env node
import {createInterface} from 'node:readline';
import {estimateFreelanceRate,defaultQuote} from '../src/pricing.mjs';
const name='estimate_freelance_hourly_rate';
const schema={type:'object',additionalProperties:false,required:Object.keys(defaultQuote),properties:Object.fromEntries(Object.keys(defaultQuote).map(k=>[k,k==='currency'?{type:'string',enum:['EUR','PLN','USD']}:{type:'number'}]))};
const respond=(id,value,error)=>{const msg=error?{jsonrpc:'2.0',id,error:{code:-32602,message:'Invalid or unauthorized input'}}:{jsonrpc:'2.0',id,result:value};process.stdout.write(JSON.stringify(msg)+'\n')};
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});
let established=false;
rl.on('line',line=>{
 if(Buffer.byteLength(line)>32768)return;
 let request;try{request=JSON.parse(line)}catch{return}
 const {id,method,params}=request??{};if(request?.jsonrpc!=='2.0'||!['string','number'].includes(typeof id)&&id!==undefined)return;
 if(id===undefined)return;
 if(method==='initialize'&&params?.protocolVersion==='2025-11-25'){established=true;return respond(id,{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'omega-business-rate',version:'1.0.0'}})}
 if(!established)return respond(id,null,true);
 if(method==='ping')return respond(id,{});
 if(method==='tools/list')return respond(id,{tools:[{name,description:'Local freelancer rate estimate; assumptions only, no tax or investment advice',inputSchema:schema}]});
 if(method==='tools/call'){
  if(params?.name!==name)return respond(id,null,true);
  try{const result=estimateFreelanceRate(params.arguments);return respond(id,{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result})}catch{return respond(id,null,true)}
 }
 respond(id,null,true);
});
