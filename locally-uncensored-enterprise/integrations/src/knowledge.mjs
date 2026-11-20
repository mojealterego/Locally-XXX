import {createHash} from 'node:crypto';
const fail=()=>{throw Error('Untrusted knowledge import rejected')};
const SHA=/^[0-9a-f]{40}$/;const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sha=s=>createHash('sha256').update(s).digest('hex');
function uuid(s){const hex=sha(s);return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;}
export function chunkKnowledge(markdown,{sourceRepo,commit,path='README.md'}={}){
 if(typeof markdown!=='string'||Buffer.byteLength(markdown)>1024*1024||!/^[-\w.]+\/[-\w.]+$/.test(sourceRepo??'')||!SHA.test(commit??'')||!/^[-\w./]+\.md$/.test(path)||path.includes('..'))fail();
 const lines=markdown.split(/\r?\n/);if(lines.length>16000)fail();
 const source=`https://github.com/${sourceRepo}/blob/${commit}/${path}`,doc=uuid(source);
 let heading='Introduction',start=1,parts=[],out=[];
 function emit(end){const content=parts.join('\n').trim();if(!content)return;for(let pos=0;pos<content.length;pos+=1600){const chunk=content.slice(pos,pos+1600);out.push(Object.freeze({id:uuid(source+'|'+start+'|'+pos+'|'+sha(chunk)),documentId:doc,content:chunk,source,heading,lineStart:start,lineEnd:end,contentSha256:sha(chunk),trusted:false}));}parts=[];}
 for(let i=0;i<lines.length;i++){
  const line=lines[i];if(/^#{1,5}\s/.test(line)){emit(i);heading=line.replace(/^#+\s*/,'').slice(0,180);start=i+1;}
  parts.push(line);
  if(parts.join('\n').length>=1600){emit(i+1);start=i+2;}
 }
 emit(lines.length);if(!out.length||out.length>1000)fail();return Object.freeze({documentId:doc,source,sourceSha256:sha(markdown),chunks:out});
}
export function searchKnowledge(index,query,{limit=5}={}){
 if(!index||!Array.isArray(index.chunks)||typeof query!=='string'||query.length<2||query.length>300||!Number.isInteger(limit)||limit<1||limit>20)fail();
 const terms=[...new Set(query.toLocaleLowerCase('en').match(/[\p{L}\p{N}]{2,}/gu)??[])].slice(0,20);if(!terms.length)fail();
 return index.chunks.map(c=>{const body=(c.heading+' '+c.content).toLocaleLowerCase('en');const hits=terms.reduce((a,t)=>a+(body.includes(t)?1:0),0);return {id:c.id,source:c.source,lineStart:c.lineStart,lineEnd:c.lineEnd,heading:c.heading,excerpt:c.content.slice(0,900),score:hits,untrusted:true}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,limit);
}
export async function indexPgvector({pool,tenant,embeddingModel,index,embed}){
 if(!UUID.test(tenant)||typeof embeddingModel!=='string'||!/^[\w./-]{1,128}$/.test(embeddingModel)||!index?.chunks?.length||index.chunks.length>1000||typeof embed!=='function'||typeof pool?.connect!=='function')fail();
 const client=await pool.connect();let begun=false;
 try{
  await client.query('BEGIN');begun=true;
  await client.query("SELECT set_config('omega.tenant_id', $1, true)",[tenant]);
  await client.query('DELETE FROM omega.rag_chunks WHERE tenant_id=$1 AND document_id=$2',[tenant,index.documentId]);
  for(const c of index.chunks){
   const vector=await embed(c.content);if(!Array.isArray(vector)||vector.length!==768||!vector.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<1000))fail();
   await client.query('INSERT INTO omega.rag_chunks (tenant_id,id,document_id,embedding_model,content,embedding) VALUES ($1,$2,$3,$4,$5,$6::vector)',[tenant,c.id,c.documentId,embeddingModel,c.content,'['+vector.join(',')+']']);
  }
  await client.query('COMMIT');begun=false;return Object.freeze({tenant,documentId:index.documentId,count:index.chunks.length,model:embeddingModel});
 }catch(e){if(begun)await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
}
/** Trusted loopback embedding service; no arbitrary outbound fetch URLs. */
export async function ollamaEmbed(text,{model,port=11434,fetchImpl=fetch}={}){
 if(typeof model!=='string'||!/^[a-zA-Z0-9._:/-]{1,128}$/.test(model)||!Number.isInteger(port)||port<1||port>65535||typeof text!=='string'||text.length>2500)fail();
 const r=await fetchImpl(`http://127.0.0.1:${port}/api/embed`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,input:text,truncate:false}),redirect:'error',signal:AbortSignal.timeout(5000)});
 if(!r.ok||Number(r.headers.get('content-length')??0)>65536)fail();
 const response=await r.json();const vector=response?.embeddings?.[0];if(!Array.isArray(vector)||vector.length!==768||!vector.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<1000))fail();return vector;
}
