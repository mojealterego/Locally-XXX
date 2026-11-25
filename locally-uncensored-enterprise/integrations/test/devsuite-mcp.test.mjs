import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {handleMcpRequest,startServer} from '../bin/devsuite-mcp.mjs';
const init={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}};

test('MCP-01 initializes and lists twenty-two real functions',()=>{
 const state={established:false};const r=handleMcpRequest(init,state);
 assert.equal(r.result.protocolVersion,'2025-11-25');
 const tools=handleMcpRequest({jsonrpc:'2.0',id:2,method:'tools/list'},state).result.tools;
 assert.equal(tools.length,22);
 for(const tool of tools)assert.equal(tool.inputSchema.additionalProperties,false);
});
test('MCP-02 dispatches offline tools after initialize',()=>{
 const state={established:false};handleMcpRequest(init,state);
 const r=handleMcpRequest({jsonrpc:'2.0',id:'x',method:'tools/call',params:{name:'json.format',arguments:{input:'{"a":1}'}}},state);
 assert.equal(r.result.structuredContent.result,'{\n  "a": 1\n}');
});
test('MCP-EXT-01 exposes IPv4 CIDR through agent tool call',()=>{
 const state={established:false};handleMcpRequest(init,state);
 const result=handleMcpRequest({jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'ipv4.cidr',arguments:{input:'10.20.30.40/24'}}},state);
 assert.equal(result.result.structuredContent.result.network,'10.20.30.0');
});
test('MCP-03 denies pre-initialize and unknown tool',()=>{
 const state={established:false};
 assert.equal(handleMcpRequest({jsonrpc:'2.0',id:3,method:'tools/list'},state).error.code,-32000);
 handleMcpRequest(init,state);
 assert.equal(handleMcpRequest({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'node.eval',arguments:{}}},state).error.code,-32602);
});
test('MCP-04 no response to notifications, rejects invalid id',()=>{
 const state={established:true};
 assert.equal(handleMcpRequest({jsonrpc:'2.0',method:'notifications/initialized'},state),null);
 assert.equal(handleMcpRequest({jsonrpc:'2.0',id:{},method:'ping'},state).error.code,-32600);
});
test('MCP-05 bounded line-delimited STDIO parser',async()=>{
 const input=new PassThrough(),output=new PassThrough();let received='';output.on('data',chunk=>received+=chunk.toString('utf8'));
 const server=startServer(input,output);
 input.write(JSON.stringify(init)+'\n');
 input.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'uuid.v4',arguments:{}}})+'\n');
 await new Promise(resolve=>setImmediate(resolve));
 const lines=received.trim().split('\n').map(JSON.parse);
 assert.equal(lines.length,2);assert.match(lines[1].result.structuredContent.result,/^[\da-f-]{36}$/);
 server.stop();input.end();
});
