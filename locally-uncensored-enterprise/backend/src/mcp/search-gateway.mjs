const routes=Object.freeze({research:'tavily',technical:'exa',privacy:'searxng'});
const deny=()=>{throw Error('Search denied or unavailable')};
const key=x=>typeof x==='string'&&x.length>0&&x.length<=4096&&!/[\r\n]/.test(x);
function endpoint(x){const u=new URL(x);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)deny();return u.href}
async function read(r){if(!r.ok||!r.body)deny();const reader=r.body.getReader();let n=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>1048576){await reader.cancel();deny()}chunks.push(value)}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))}finally{reader.releaseLock()}}
export class SearchGateway {
  constructor({authorize,tavilyKey,exaKey,searxUrl,fetchImpl=fetch}){if(typeof authorize!=='function'||typeof fetchImpl!=='function')deny();this.authorize=authorize;this.keys={tavily:tavilyKey,exa:exaKey};this.searxUrl=searxUrl===undefined?null:endpoint(searxUrl);this.fetch=fetchImpl}
  async search(input){
    if(!input||typeof input.query!=='string'||!input.query.trim()||Buffer.byteLength(input.query)>4096||input.classification!=='public'||!Object.hasOwn(routes,input.intent)||Object.keys(input).some(k=>!['query','classification','intent'].includes(k)))deny();
    const {query,intent,classification}=input,provider=routes[intent];if(await this.authorize(Object.freeze({query,intent,classification,provider}))!==true)deny();
    let url,opts;const headers={'content-type':'application/json'};
    if(provider==='searxng'){if(!this.searxUrl)deny();url=new URL(this.searxUrl);url.searchParams.set('q',query);url.searchParams.set('format','json');opts={method:'GET'}}
    else {if(!key(this.keys[provider]))deny();if(provider==='tavily'){url='https://api.tavily.com/search';headers.authorization='Bearer '+this.keys.tavily;opts={method:'POST',headers,body:JSON.stringify({query,max_results:5,search_depth:'basic'})}}else{url='https://api.exa.ai/search';headers['x-api-key']=this.keys.exa;opts={method:'POST',headers,body:JSON.stringify({query,numResults:5,contents:{text:{maxCharacters:4000}}})}}}
    try{const data=await read(await this.fetch(url,{...opts,redirect:'error',signal:AbortSignal.timeout(10000)}));if(!Array.isArray(data.results))deny();const results=[];for(const item of data.results.slice(0,20)){if(!item||typeof item.url!=='string'||typeof item.title!=='string')continue;try{const u=new URL(item.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.href.length>2048)continue;const content=item.content??item.text??'';if(typeof content!=='string')continue;results.push({url:u.href,title:item.title.slice(0,512),content:content.slice(0,4000),trust:'untrusted'})}catch{continue}if(results.length>=5)break}return {provider,results}}catch{deny()}
  }
}
