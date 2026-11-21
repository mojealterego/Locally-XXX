import {createInterface} from 'node:readline';
import {compileScene} from './master.mjs';
const errors=(message='Invalid or unauthorized tool invocation')=>({code:-32602,message});
const schema={type:'object',additionalProperties:false,required:['manifest','sceneId'],properties:{manifest:{type:'object'},sceneId:{type:'string'}}};
const tools=Object.freeze([
 {name:'flow_compile_master_prompt',description:'Offline compile and validate public Master Prompt scenes for Vertex Veo. No network.',inputSchema:schema},
 {name:'flow_generate_scene',description:'Reserved: requires trusted authenticated operator approval and configured Vertex gateway. Disabled in standalone MCP.',inputSchema:{...schema,required:['manifest','sceneId','idempotencyKey'],properties:{...schema.properties,idempotencyKey:{type:'string'}}}},
 {name:'flow_poll_scene',description:'Reserved: requires operator-authorized job store; disabled in standalone MCP.',inputSchema:{type:'object',required:['idempotencyKey'],additionalProperties:false,properties:{idempotencyKey:{type:'string'}}}}
]);
export function startMcp({input=process.stdin,output=process.stdout}={}){
 const rl=createInterface({input,crlfDelay:Infinity,terminal:false});let ready=false;
 function reply(id,result,error){output.write(JSON.stringify(error?{jsonrpc:'2.0',id,error}:{jsonrpc:'2.0',id,result})+'\n')}
 rl.on('line',line=>{if(Buffer.byteLength(line,'utf8')>65536)return;let msg;try{msg=JSON.parse(line)}catch{return}if(msg?.jsonrpc!=='2.0'||!['string','number'].includes(typeof msg.id))return;const {id,method,params}=msg;
  if(method==='initialize'&&params?.protocolVersion==='2025-11-25'){ready=true;return reply(id,{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'omega-vertex-film-studio',version:'0.1.0'}})}
  if(!ready)return reply(id,null,errors());
  if(method==='ping')return reply(id,{});
  if(method==='tools/list')return reply(id,{tools});
  if(method==='tools/call'){
   if(params?.name!=='flow_compile_master_prompt')return reply(id,{isError:true,content:[{type:'text',text:'Cloud generation unavailable without trusted consent gateway.'}]});
   try{const args=params.arguments;if(!args||Object.keys(args).sort().join(',')!=='manifest,sceneId')throw Error('Invalid');const compiled=compileScene(args.manifest,args.sceneId);return reply(id,{content:[{type:'text',text:JSON.stringify(compiled)}],structuredContent:compiled})}catch{return reply(id,{isError:true,content:[{type:'text',text:'Invalid public scene manifest'}]})}
  }
  reply(id,null,errors('Unsupported method'));
 });
 return ()=>rl.close();
}
