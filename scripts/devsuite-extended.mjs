/** Input-only, offline developer utilities with bounded service entry. No regex supplied by users. */
const required = input => {if(typeof input!=='string')throw new TypeError('Expected text');return input};
const strictUtf8 = bytes => {const value=bytes.toString('utf8');if(!Buffer.from(value,'utf8').equals(bytes))throw new TypeError('Invalid UTF-8');return value};
const decode = (input,format,re) => {required(input);if(!re.test(input))throw new TypeError('Invalid encoding');const bytes=Buffer.from(input,format);if(bytes.toString(format)!==input)throw new TypeError('Noncanonical encoding');return strictUtf8(bytes)};
const fromUnix = input=>{required(input);if(!/^-?\d{1,12}$/.test(input))throw new TypeError('Invalid Unix timestamp');const ms=Number(BigInt(input)*1000n);if(!Number.isSafeInteger(ms)||Math.abs(ms)>8640000000000000)throw new RangeError('Timestamp outside Date range');return new Date(ms).toISOString()};
function parseIpv4Cidr(input){
 required(input);const match=/^((?:\d{1,3}\.){3}\d{1,3})\/(3[0-2]|[12]?\d)$/.exec(input);if(!match)throw new TypeError('Invalid IPv4 CIDR');
 const parts=match[1].split('.');if(parts.some(x=>(x.length>1&&x.startsWith('0'))||Number(x)>255))throw new TypeError('Invalid IPv4 octet');
 const p=Number(match[2]);const asInt=parts.reduce((v,x)=>(v*256+Number(x)),0)>>>0;
 const mask=(p===0?0:(0xffffffff<<(32-p)))>>>0,network=(asInt&mask)>>>0,broadcast=(network|(~mask))>>>0;
 const dot=x=>[24,16,8,0].map(shift=>(x>>>shift)&255).join('.');
 const total=2**(32-p);return {ip:match[1],prefix:p,netmask:dot(mask),network:dot(network),broadcast:dot(broadcast),addresses:total,usable_hosts:p===32?1:p===31?2:Math.max(0,total-2)};
}
function jsonValidate(input){required(input);try{const parsed=JSON.parse(input);return {valid:true,type:parsed===null?'null':Array.isArray(parsed)?'array':typeof parsed}}catch{return {valid:false}}}
export const extendedTools=Object.freeze({
 'json.minify':input=>JSON.stringify(JSON.parse(required(input))),
 'json.validate':jsonValidate,
 'base64url.encode':input=>Buffer.from(required(input),'utf8').toString('base64url'),
 'base64url.decode':input=>decode(input,'base64url',/^[A-Za-z0-9_-]*$/),
 'hex.encode':input=>Buffer.from(required(input),'utf8').toString('hex'),
 'hex.decode':input=>decode(input,'hex',/^(?:[0-9a-f]{2})*$/),
 'url.encode':input=>encodeURIComponent(required(input)),
 'url.decode':input=>decodeURIComponent(required(input)),
 'html.escape':input=>required(input).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 'uuid.validate':input=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(required(input)),
 'time.fromUnix':fromUnix,
 'text.stats':input=>{required(input);return {bytes:Buffer.byteLength(input,'utf8'),codepoints:Array.from(input).length,lines:input.length?input.split(/\r\n|\n|\r/).length:0,words:(input.match(/[\p{L}\p{N}]+/gu)||[]).length}},
 'text.upper':input=>required(input).toUpperCase(),
 'text.lower':input=>required(input).toLowerCase(),
 'ipv4.cidr':parseIpv4Cidr,
});
export const extendedDescriptions=Object.freeze({
 'json.minify':'Minify JSON offline','json.validate':'Validate JSON without echoing invalid source',
 'base64url.encode':'Canonical UTF-8 to Base64URL','base64url.decode':'Strict Base64URL to UTF-8',
 'hex.encode':'UTF-8 hexadecimal encoding','hex.decode':'Strict canonical hexadecimal UTF-8 decoding',
 'url.encode':'Encode URI component','url.decode':'Decode URI component',
 'html.escape':'Escape HTML markup','uuid.validate':'Validate UUID version 4',
 'time.fromUnix':'Convert signed Unix seconds to UTC ISO 8601',
 'text.stats':'Count UTF-8 bytes, Unicode codepoints, words and lines',
 'text.upper':'Uppercase Unicode text','text.lower':'Lowercase Unicode text',
 'ipv4.cidr':'Calculate IPv4 CIDR network, mask and usable hosts offline'
});
