/** Local PDF report editor reusing existing ReportLab renderer. No cloud or persistent history. */
export function mountPdfReports(root,{locale='pl'}={}){
 if(!root||typeof root.append!=='function'||!['pl','en'].includes(locale))throw Error('Invalid PDF mount');
 const t=(pl,en)=>locale==='pl'?pl:en;
 const el=(tag,value,parent=root)=>{const node=document.createElement(tag);if(value!==undefined)node.textContent=value;parent.append(node);return node};
 let alive=true,controller=null;
 el('h2',t('Raporty PDF offline','Offline PDF Reports'));
 el('p',t('Używa istniejącego silnika ReportLab. Zawartość jest przetwarzana lokalnie, bez zapisywania historii ani wysyłania do chmury.','Uses the existing ReportLab engine. Content is processed locally, without history or cloud uploads.'));
 const label=el('label',t('Dokument JSON','JSON document'));
 const editor=el('textarea',undefined,label);editor.rows=16;editor.maxLength=140000;editor.style.width='100%';editor.spellcheck=false;
 editor.value=JSON.stringify({title:'Raport OMEGA',author:'Operator',generatedAt:'2026-11-25T00:00:00Z',sections:[{heading:'Wyniki',paragraphs:['Zażółć gęślą jaźń.']}]},null,2);
 const action=el('button',t('Utwórz i pobierz PDF','Generate and save PDF'));action.type='button';
 const status=el('p','');status.setAttribute('role','status');
 action.onclick=async()=>{
  controller?.abort();const c=new AbortController();controller=c;action.disabled=true;status.textContent=t('Przygotowywanie PDF…','Rendering PDF…');
  try{
   const data=JSON.parse(editor.value);
   const response=await fetch('/api/local/pdf/render',{method:'POST',headers:{'content-type':'application/json','x-omega-pdf':'1'},body:JSON.stringify(data),signal:AbortSignal.any([c.signal,AbortSignal.timeout(25000)]),credentials:'same-origin',redirect:'error',cache:'no-store'});
   if(!response.ok||response.headers.get('content-type')!=='application/pdf')throw Error('Invalid PDF reply');
   const bytes=await response.arrayBuffer();
   if(bytes.byteLength<8||bytes.byteLength>4*1024*1024)throw Error('PDF exceeded bound');
   if(!alive||controller!==c)return;
   const blob=new Blob([bytes],{type:'application/pdf'});
   const url=URL.createObjectURL(blob);
   try{const anchor=el('a',undefined,root);anchor.href=url;anchor.download='omega-report.pdf';anchor.click();anchor.remove();}
   finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
   status.textContent=t('PDF przygotowany do zapisania.','PDF ready to save.');
  }catch{if(alive&&controller===c&&!c.signal.aborted)status.textContent=t('Dokument niepoprawny lub renderer niedostępny.','Invalid report or renderer unavailable.')}
  finally{if(controller===c){controller=null;action.disabled=false;}}
 };
 return {dispose(){alive=false;controller?.abort();editor.value='';action.disabled=true;}};
}
