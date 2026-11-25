import test from 'node:test';
import assert from 'node:assert/strict';
import {convertBase,explainHttpStatus,parseUrl,createCurl,networkTools,networkDescriptions} from '../scripts/devsuite-network.mjs';
test('NET-01 exact BigInt base conversions and overflow guard',()=>{
 assert.equal(convertBase('16:ff->2').value,'11111111');
 assert.equal(convertBase('10:-255->16').value,'-ff');
 assert.equal(convertBase('2:1010->10').decimal,'10');
 assert.throws(()=>convertBase('2:102->10'),TypeError);
 assert.throws(()=>convertBase('10:'+ '9'.repeat(2000)+'->2'),TypeError);
});
test('NET-02 HTTP status classification',()=>{
 assert.equal(explainHttpStatus('422').reason,'Unprocessable Content');
 assert.equal(explainHttpStatus('503').category,'server_error');
 assert.throws(()=>explainHttpStatus('0'),TypeError);
});
test('NET-03 URL inspection is parse-only and strips no credentials',()=>{
 assert.equal(parseUrl('https://example.org:443/a?q=1#x').hostname,'example.org');
 assert.throws(()=>parseUrl('https://user:secret@example.com'),TypeError);
 assert.throws(()=>parseUrl('file:///etc/passwd'),TypeError);
});
test('NET-04 cURL builder escapes shell metacharacters and rejects secrets',()=>{
 const command=createCurl(JSON.stringify({method:'POST',url:'https://example.com/api',headers:{'Content-Type':'application/json'},body:"x'; rm -rf /; echo '"}));
 assert.match(command,/--data-binary/);assert.ok(command.includes("'\\''"));assert.match(command,/-- 'https:\/\/example.com\/api'$/);
 assert.throws(()=>createCurl(JSON.stringify({method:'GET',url:'https://example.com',headers:{Authorization:'Bearer token'}})),TypeError);
 assert.throws(()=>createCurl(JSON.stringify({method:'GET',url:'file:///etc/passwd'})),TypeError);
});
test('NET-05 registry and documentation match',()=>assert.deepEqual(Object.keys(networkTools),Object.keys(networkDescriptions)));
