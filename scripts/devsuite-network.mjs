/** Strict offline helpers. Never performs network requests or executes commands. */
const text = v => { if (typeof v !== 'string') throw new TypeError('Expected string'); return v; };
const integer = (v, min, max) => { if (typeof v !== 'bigint' || v < min || v > max) throw new RangeError('Number out of range'); return v; };
const radix = (v) => { if (!Number.isInteger(v) || v < 2 || v > 36) throw new RangeError('Invalid radix'); return v; };
export function convertBase(input) {
  text(input);
  const match = /^(2|8|10|16|36):(-?[0-9a-zA-Z]{1,256})->(2|8|10|16|36)$/.exec(input);
  if (!match) throw new TypeError('Use FROM:VALUE->TO (2,8,10,16,36)');
  const from = radix(Number(match[1])); const to = radix(Number(match[3]));
  const raw = match[2].toLowerCase(); const negative = raw.startsWith('-');
  const digits = negative ? raw.slice(1) : raw;
  if (!digits) throw new TypeError('Empty number');
  let n = 0n;
  for (const char of digits) {
    const digit = parseInt(char, 36);
    if (digit >= from || !Number.isInteger(digit)) throw new TypeError('Invalid digit');
    n = n * BigInt(from) + BigInt(digit);
    integer(n, 0n, (1n << 4096n) - 1n);
  }
  if (negative) n = -n;
  return {from, to, value: n.toString(to), decimal: n.toString(10)};
}
const STATUS = Object.freeze({
  100:'Continue',101:'Switching Protocols',200:'OK',201:'Created',202:'Accepted',204:'No Content',
  301:'Moved Permanently',302:'Found',303:'See Other',304:'Not Modified',307:'Temporary Redirect',308:'Permanent Redirect',
  400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',405:'Method Not Allowed',408:'Request Timeout',
  409:'Conflict',410:'Gone',413:'Content Too Large',415:'Unsupported Media Type',418:"I'm a teapot",422:'Unprocessable Content',
  425:'Too Early',429:'Too Many Requests',431:'Request Header Fields Too Large',451:'Unavailable For Legal Reasons',
  500:'Internal Server Error',501:'Not Implemented',502:'Bad Gateway',503:'Service Unavailable',504:'Gateway Timeout',507:'Insufficient Storage'
});
export function explainHttpStatus(input) {
  text(input);
  if(!/^[1-5]\d{2}$/.test(input)) throw new TypeError('Invalid status');
  const code=Number(input);
  return {code,category:code<200?'informational':code<300?'success':code<400?'redirect':code<500?'client_error':'server_error',reason:STATUS[code]??'Unassigned or uncommon status'};
}
export function parseUrl(input) {
  text(input);
  if(input.length>4096 || /[\u0000-\u001f\u007f]/.test(input)) throw new TypeError('Invalid URL');
  let url;
  try{url=new URL(input)}catch{throw new TypeError('Invalid URL')}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new TypeError('Only credential-free HTTP(S) URLs');
  return {scheme:url.protocol.slice(0,-1),hostname:url.hostname,port:url.port||null,path:url.pathname,query:url.search,fragment:url.hash,origin:url.origin};
}
const allowedMethods=new Set(['GET','POST','PUT','PATCH','DELETE','HEAD']);
export function createCurl(input) {
  text(input);
  if(input.length>4096)throw new TypeError('Invalid request spec');
  let request;
  try{request=JSON.parse(input)}catch{throw new TypeError('Invalid JSON request spec')}
  if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>!['method','url','headers','body'].includes(k)))throw new TypeError('Invalid spec');
  if(typeof request.method!=='string'||!allowedMethods.has(request.method))throw new TypeError('Invalid method');
  const info=parseUrl(request.url);
  if(!info.hostname)throw new TypeError('Host required');
  const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
  const headers = request.headers??{};
  if(!headers||typeof headers!=='object'||Array.isArray(headers)||Object.getPrototypeOf(headers)!==Object.prototype||Object.keys(headers).length>20)throw new TypeError('Invalid headers');
  const out=['curl','--request',quote(request.method),'--max-time','15'];
  for(const [name,value] of Object.entries(headers)) {
    if(!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/.test(name)||typeof value!=='string'||value.length>1024||/[\r\n\u0000]/.test(value)||/^(authorization|cookie|proxy-authorization|x-api-key)$/i.test(name))throw new TypeError('Invalid or secret header');
    out.push('--header',quote(name+': '+value));
  }
  if(request.body!==undefined){if(typeof request.body!=='string'||request.body.length>4096)throw new TypeError('Invalid body');out.push('--data-binary',quote(request.body));}
  out.push('--',quote(request.url));
  return out.join(' ');
}
export const networkTools=Object.freeze({
  'number.base':convertBase,
  'http.status':explainHttpStatus,
  'url.inspect':parseUrl,
  'curl.build':createCurl
});
export const networkDescriptions=Object.freeze({
  'number.base':'Convert signed integers between bases 2, 8, 10, 16 and 36 (FROM:NUMBER->TO)',
  'http.status':'Explain HTTP response status',
  'url.inspect':'Parse credential-free HTTP(S) URL without fetching',
  'curl.build':'Generate escaped cURL command from JSON request spec without executing it or storing secrets'
});
