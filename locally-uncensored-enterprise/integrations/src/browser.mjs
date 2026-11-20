import {formatJson} from './json-tools.mjs';
import {estimateFreelanceRate,defaultQuote} from './pricing.mjs';
import {convertRaster} from './converter.mjs';
const make=(tag,parent,txt)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;parent.append(e);return e};
const label=(parent,name,field)=>{const l=make('label',parent,name);l.append(field);return field};
const button=(parent,name,fn)=>{const b=make('button',parent,name);b.type='button';b.onclick=fn;return b};
export function mountIntegration(root,id,{locale='pl'}={}){
 if(!root||typeof root.append!=='function')throw Error('Invalid integration view');
 const t=(pl,en)=>locale==='pl'?pl:en;let live=true;const urls=new Set();
 const title={jsonfmt:t('JSON — formatter','JSON formatter'),rates:t('Kalkulator stawek','Freelancer rates'),converter:t('Konwerter obrazów','Image converter'),knowledge:t('Katalog wiedzy lokalnych LLM','Local LLM knowledge')};
 if(!Object.hasOwn(title,id))throw Error('Invalid integration module');
 make('h2',root,title[id]);const state=make('p',root,'');state.setAttribute('role','status');
 const status=s=>{if(live)state.textContent=s};
 if(id==='jsonfmt'){
  const inp=make('textarea',root);inp.className='editor';inp.maxLength=1048576;inp.setAttribute('aria-label','JSON source');
  const fmt=label(root,t('Format','Format'),make('select',root));for(const x of ['pretty','minify','yaml','env']){const o=make('option',fmt,x);o.value=x}
  const output=make('textarea',root);output.className='editor';output.readOnly=true;output.setAttribute('aria-label','Converted output');
  button(root,t('Sprawdź i przekształć','Validate and transform'),()=>{try{output.value=formatJson(inp.value,fmt.value);status(t('Zweryfikowano składnię','Syntax validated'))}catch{output.value='';status(t('Błędny lub niedozwolony JSON','JSON invalid or not allowed'))}});
 }else if(id==='rates'){
  make('p',root,t('Szacunek dla uproszczonej stawki podatku od zysku, bez VAT; nie jest poradą podatkową.','Flat profit-tax estimate, excluding VAT; not tax advice.'));
  const inputs={};for(const [key,value] of Object.entries(defaultQuote)){
   const field=make('input',root);field.value=String(value);field.setAttribute('aria-label',key);
   if(key==='currency'){const sel=make('select',root);sel.setAttribute('aria-label',key);field.remove();for(const x of ['EUR','PLN','USD']){const o=make('option',sel,x);o.value=x}sel.value=value;inputs[key]=sel;label(root,key,sel)}
   else {field.type='number';field.step='any';inputs[key]=field;label(root,key,field)}
  }
  const out=make('pre',root,'');button(root,t('Oblicz stawkę','Estimate rate'),()=>{try{const data=Object.fromEntries(Object.entries(inputs).map(([key,node])=>[key,key==='currency'?node.value:node.value.trim()===''?NaN:Number(node.value)]));const estimate=estimateFreelanceRate(data);out.textContent=JSON.stringify(estimate,null,2);status(t('Obliczono','Calculated'))}catch{out.textContent='';status(t('Niepoprawne parametry','Invalid parameters'))}});
 }else if(id==='converter'){
  make('p',root,t('Tylko JPG, PNG i WebP. Konwersja odbywa się lokalnie, bez wysyłania pliku. PDF/HEIC/SVG są wyłączone do czasu audytu dekoderów.','JPG, PNG and WebP only. Local conversion, no upload. PDF/HEIC/SVG require audited decoders.'));
  const file=make('input',root);file.type='file';file.accept='.jpg,.jpeg,.png,.webp';file.setAttribute('aria-label','Image file');
  const fmt=make('select',root);fmt.setAttribute('aria-label','Output format');for(const [v,name] of [['image/jpeg','JPG'],['image/png','PNG'],['image/webp','WebP']]){const o=make('option',fmt,name);o.value=v}
  const downloads=make('div',root);button(root,t('Konwertuj lokalnie','Convert locally'),async()=>{downloads.replaceChildren();const f=file.files?.[0];if(!f)return status(t('Wybierz plik','Select a file'));try{const result=await convertRaster(f,fmt.value);if(!live)return;const url=URL.createObjectURL(result.blob);urls.add(url);const a=make('a',downloads,t('Pobierz wynik','Download result'));a.href=url;a.download=(f.name.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_.-]/gu,'_').slice(0,100)||'image')+'.'+result.extension;status(`${result.width} × ${result.height}`)}catch{status(t('Konwersja odrzucona albo kodek niedostępny','Conversion rejected or codec unavailable'))}});
 }else if(id==='knowledge'){
  make('p',root,t('Przypięta lokalna kopia źródła MIT; wyniki stanowią niezaufane dane, nie instrukcje dla agenta.','Pinned MIT source snapshot; retrieved text is untrusted data, not agent instructions.'));
  const query=make('input',root);query.setAttribute('aria-label','Search knowledge');query.placeholder='llama.cpp';const result=make('div',root);let content=null;
  const source='https://github.com/PurpleDoubleD/awesome-local-llm/blob/713624bfc7e338da5cc5fb1c4ae9dfce70dc23f9/README.md';
  button(root,t('Szukaj','Search'),async()=>{try{const q=query.value.trim().toLocaleLowerCase();if(q.length<2||q.length>100)throw Error('invalid query');if(content===null){const res=await fetch('/modules/awesome-local-llm.md',{redirect:'error'});if(!res.ok)throw Error('source unavailable');const raw=await res.text();if(raw.length>120000)throw Error('source too large');content=raw.split('\n')};if(!live)return;result.replaceChildren();let shown=0;for(let i=0;i<content.length&&shown<12;i++){if(!content[i].toLocaleLowerCase().includes(q))continue;const p=make('p',result,`L${i+1}: ${content[i].slice(0,450)}`);p.className='panel';shown++}const a=make('a',result,t('Źródło i licencja MIT','Source and MIT license'));a.href=source;a.target='_blank';a.rel='noopener noreferrer';status(shown?t(`Znaleziono: ${shown}` ,`Matches: ${shown}`):t('Brak wyników','No matches'))}catch{status(t('Indeks niedostępny lub niepoprawne zapytanie','Index unavailable or invalid query'))}});
 }
 return {dispose(){live=false;for(const url of urls)URL.revokeObjectURL(url);root.replaceChildren()}};
}
