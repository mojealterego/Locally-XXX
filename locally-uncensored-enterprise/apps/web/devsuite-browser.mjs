const definitions = Object.freeze([
  {id:'json.format', pl:'Formatowanie JSON', en:'Format JSON', input:true},
  {id:'base64.encode', pl:'Kodowanie Base64', en:'Encode Base64', input:true},
  {id:'base64.decode', pl:'Dekodowanie Base64', en:'Decode Base64', input:true},
  {id:'jwt.inspect', pl:'Inspekcja JWT', en:'Inspect JWT', input:true},
  {id:'hash.digest', pl:'Skrót kryptograficzny', en:'Cryptographic digest', input:true},
  {id:'password.generate', pl:'Bezpieczne hasło', en:'Secure password', input:false},
  {id:'uuid.v4', pl:'UUID v4', en:'UUID v4', input:false},
  {id:'json.minify', pl:'Minimalizacja JSON', en:'Minify JSON', input:true},
  {id:'json.validate', pl:'Walidacja JSON', en:'Validate JSON', input:true},
  {id:'base64url.encode', pl:'Kodowanie Base64URL', en:'Encode Base64URL', input:true},
  {id:'base64url.decode', pl:'Dekodowanie Base64URL', en:'Decode Base64URL', input:true},
  {id:'hex.encode', pl:'Kodowanie Hex', en:'Encode Hex', input:true},
  {id:'hex.decode', pl:'Dekodowanie Hex', en:'Decode Hex', input:true},
  {id:'url.encode', pl:'Kodowanie URL', en:'Encode URL', input:true},
  {id:'url.decode', pl:'Dekodowanie URL', en:'Decode URL', input:true},
  {id:'html.escape', pl:'Escapowanie HTML', en:'Escape HTML', input:true},
  {id:'uuid.validate', pl:'Walidacja UUID v4', en:'Validate UUID v4', input:true},
  {id:'time.fromUnix', pl:'Znacznik Unix do UTC', en:'Unix timestamp to UTC', input:true},
  {id:'text.stats', pl:'Statystyki tekstu', en:'Text statistics', input:true},
  {id:'text.upper', pl:'Wielkie litery', en:'Uppercase text', input:true},
  {id:'text.lower', pl:'Małe litery', en:'Lowercase text', input:true},
  {id:'ipv4.cidr', pl:'Kalkulator podsieci IPv4', en:'IPv4 subnet calculator', input:true},
]);

export function mountDevSuite(root, {locale='pl'}={}) {
  if (!root || typeof root.append !== 'function' || !['pl','en'].includes(locale)) throw Error('Invalid Developer Suite mount');
  const tr=(pl,en)=>locale==='pl'?pl:en;
  let active=true, requestController=null;
  function element(tag,text,parent=root) {
    const node=document.createElement(tag);
    if (text!==undefined) node.textContent=text;
    parent.append(node);
    return node;
  }
  element('h2','OMEGA Developer Suite');
  element('p',tr('Narzędzia lokalne. Dane pozostają na urządzeniu. Wyniki JWT nie oznaczają weryfikacji podpisu.','Local tools. Data stays on device. JWT inspection does not verify signatures.'));
  const selector=element('select');selector.setAttribute('aria-label',tr('Narzędzie','Tool'));
  for(const item of definitions){const o=element('option',locale==='pl'?item.pl:item.en,selector);o.value=item.id;}
  const label=element('label',tr('Dane wejściowe','Input'));
  const input=element('textarea',undefined,label);input.maxLength=32768;input.rows=6;input.spellcheck=false;input.autocomplete='off';input.setAttribute('aria-label',tr('Dane narzędzia','Tool input'));
  const advanced=element('div');
  const options=element('select',undefined,advanced);options.setAttribute('aria-label',tr('Algorytm','Algorithm'));
  for(const alg of ['sha256','sha512','sha1','md5']){const o=element('option',alg.toUpperCase(),options);o.value=alg;}
  const lengthLabel=element('label',tr('Długość hasła','Password length'),advanced);
  const length=element('input',undefined,lengthLabel);length.type='number';length.min='12';length.max='1024';length.value='24';
  const run=element('button',tr('Uruchom','Run'));run.type='button';
  const output=element('pre');output.setAttribute('role','status');output.setAttribute('aria-live','polite');
  const copy=element('button',tr('Kopiuj wynik','Copy result'));copy.type='button';copy.disabled=true;
  let currentResult='';
  function render() {
    const id=selector.value;
    input.parentElement.hidden=!definitions.find(d=>d.id===id).input;
    options.hidden=id!=='hash.digest';
    lengthLabel.hidden=id!=='password.generate';
    input.value='';output.textContent='';currentResult='';copy.disabled=true;
  }
  selector.addEventListener('change',render);
  run.onclick=async()=>{
    if(requestController)requestController.abort();
    const controller=new AbortController();requestController=controller;
    run.disabled=true;copy.disabled=true;currentResult='';output.textContent=tr('Przetwarzanie…','Processing…');
    const tool=selector.value;
    const args=tool==='password.generate'?{length:Number(length.value)}:tool==='uuid.v4'?{}:{input:input.value};
    if(tool==='hash.digest')args.algorithm=options.value;
    try{
      const response=await fetch('/api/local/tools',{method:'POST',headers:{'content-type':'application/json','x-omega-local-tool':'1'},body:JSON.stringify({tool,args}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]),credentials:'same-origin',redirect:'error',cache:'no-store'});
      if(!response.ok)throw Error('Request failed');
      const body=await response.json();
      if(!body.ok||body.tool!==tool||!Object.hasOwn(body,'result'))throw Error('Invalid response');
      if(!active||requestController!==controller)return;
      currentResult=typeof body.result==='string'?body.result:JSON.stringify(body.result,null,2);
      output.textContent=currentResult;
      copy.disabled=false;
    }catch{
      if(active&&requestController===controller&&!controller.signal.aborted)output.textContent=tr('Błędne dane lub operacja niedostępna','Invalid input or tool unavailable');
    }finally{if(requestController===controller){run.disabled=false;requestController=null;}}
  };
  copy.onclick=()=>{if(currentResult&&navigator.clipboard?.writeText)void navigator.clipboard.writeText(currentResult).catch(()=>{output.textContent=tr('Kopiowanie niedostępne','Clipboard unavailable')});};
  render();
  return {dispose(){active=false;requestController?.abort();input.value='';output.textContent='';currentResult='';run.disabled=true;copy.disabled=true;}};
}
