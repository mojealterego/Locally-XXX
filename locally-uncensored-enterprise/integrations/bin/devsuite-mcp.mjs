#!/usr/bin/env node
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {executeLocalTool, LocalToolError} from '../../apps/web/devsuite-service.mjs';
import {extendedDescriptions} from '../../../scripts/devsuite-extended.mjs';

const VERSION='2025-11-25';
const MAX_LINE=65536;
const stringInput={type:'object',additionalProperties:false,required:['input'],properties:{input:{type:'string',maxLength:32768}}};
const toolDefinitions=Object.freeze([
  {name:'json.format',description:'Offline JSON pretty-printer',inputSchema:{type:'object',additionalProperties:false,required:['input'],properties:{input:{type:'string',maxLength:32768},indent:{type:'integer',minimum:0,maximum:8}}}},
  {name:'base64.encode',description:'Encode UTF-8 to Base64 offline',inputSchema:stringInput},
  {name:'base64.decode',description:'Decode canonical Base64 to UTF-8 offline',inputSchema:stringInput},
  {name:'jwt.inspect',description:'Decode JWS header and payload without verifying signature',inputSchema:stringInput},
  {name:'hash.digest',description:'Calculate a local digest',inputSchema:{type:'object',additionalProperties:false,required:['input'],properties:{input:{type:'string',maxLength:32768},algorithm:{type:'string',enum:['sha256','sha512','sha1','md5']}}}},
  {name:'password.generate',description:'Generate a cryptographically secure password without persistence',inputSchema:{type:'object',additionalProperties:false,properties:{length:{type:'integer',minimum:12,maximum:1024},alphabet:{type:'string',minLength:2,maxLength:256}}}},
  {name:'uuid.v4',description:'Generate random RFC 4122 UUID v4',inputSchema:{type:'object',additionalProperties:false,properties:{}}},
  ...Object.entries(extendedDescriptions).map(([name,description])=>({name,description,inputSchema:stringInput})),
]);
const nameSet=new Set(toolDefinitions.map(x=>x.name));
const reply=(id,result)=>({jsonrpc:'2.0',id,result});
const error=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;

export function handleMcpRequest(request,state){
  if(!plain(request)||request.jsonrpc!=='2.0'||typeof request.method!=='string'||request.method.length>128)
    return error(null,-32600,'Invalid request');
  const {id,method,params}=request;
  const hasId=Object.hasOwn(request,'id');
  if(hasId&&!(typeof id==='string'&&id.length<=128||Number.isSafeInteger(id)))return error(null,-32600,'Invalid id');
  if(!hasId)return null;
  if(method==='initialize'){
    if(!plain(params)||params.protocolVersion!==VERSION)return error(id,-32602,'Unsupported protocol version');
    state.established=true;
    return reply(id,{protocolVersion:VERSION,capabilities:{tools:{listChanged:false}},serverInfo:{name:'omega-devsuite',version:'1.0.0'}});
  }
  if(!state.established)return error(id,-32000,'Initialize first');
  if(method==='ping')return reply(id,{});
  if(method==='tools/list')return reply(id,{tools:toolDefinitions});
  if(method==='tools/call'){
    if(!plain(params)||typeof params.name!=='string'||!nameSet.has(params.name))return error(id,-32602,'Unknown tool');
    try{
      const toolResult=executeLocalTool({tool:params.name,args:params.arguments??{}});
      return reply(id,{content:[{type:'text',text:JSON.stringify(toolResult.result)}],structuredContent:toolResult});
    }catch(e){
      if(e instanceof LocalToolError)return error(id,-32602,'Invalid tool input');
      return error(id,-32603,'Internal tool failure');
    }
  }
  return error(id,-32601,'Method not found');
}

/** STDIO line-delimited JSON-RPC; bounded buffer prevents untrusted line accumulation. */
export function startServer(input=process.stdin,output=process.stdout){
  const state={established:false};let buffer='';let closed=false;
  input.setEncoding('utf8');
  input.on('data',chunk=>{
    if(closed)return;
    buffer+=chunk;
    for(;;){
      const pos=buffer.indexOf('\n');
      if(pos<0)break;
      const line=buffer.slice(0,pos).replace(/\r$/,'');
      buffer=buffer.slice(pos+1);
      if(Buffer.byteLength(line,'utf8')>MAX_LINE){output.write(JSON.stringify(error(null,-32600,'Line too large'))+'\n');continue;}
      let response;
      try{response=handleMcpRequest(JSON.parse(line),state)}
      catch{response=error(null,-32700,'Parse error')}
      if(response!==null)output.write(JSON.stringify(response)+'\n');
    }
    if(Buffer.byteLength(buffer,'utf8')>MAX_LINE){closed=true;output.write(JSON.stringify(error(null,-32600,'Line too large'))+'\n');input.pause();}
  });
  return {stop(){closed=true;input.pause();}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))startServer();
