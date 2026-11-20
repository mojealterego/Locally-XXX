/** Browser-side declarative Visual Builder. Native TypeScript AST build runs via trusted CLI. */
export function mountVisualBuilder(root,{locale='pl'}={}){
 if(!root||typeof root.append!=='function')throw Error('Invalid builder root');
 const tr=(pl,en)=>locale==='pl'?pl:en;
 const graph={projectId:'omega-app',nodes:[{id:'home',type:'screen',label:'Start'}],edges:[]};let active='home',counter=0;
 const make=(tag,text,parent=root)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;parent.append(x);return x};
 const button=(parent,label,fn)=>{const x=make('button',label,parent);x.type='button';x.onclick=fn;return x};
 const editor=make('section'),preview=make('section');const status=make('p');status.setAttribute('role','status');
 make('h2',tr('Wizualny kreator aplikacji','Visual App Builder'));make('p',tr('Ekrany i elementy. Kod React/TypeScript wygeneruj kompilatorem CLI.','Screens and elements. Generate React/TypeScript with the CLI compiler.'));
 const project=make('label',tr('Projekt','Project'));const projectName=make('input',undefined,project);projectName.value=graph.projectId;
 const nodes=make('div',undefined,editor),controls=make('div',undefined,editor);const screenPicker=make('select',undefined,controls);screenPicker.setAttribute('aria-label',tr('Ekran','Screen'));const actions=make('div',undefined,controls);
 function repaint(){nodes.replaceChildren();screenPicker.replaceChildren();const screens=graph.nodes.filter(n=>n.type==='screen').sort((a,b)=>a.id<b.id?-1:1);for(const s of screens){const opt=make('option',s.label,screenPicker);opt.value=s.id}if(!screens.some(s=>s.id===active))active=screens[0].id;screenPicker.value=active;
  for(const n of graph.nodes.filter(n=>n.id===active||graph.edges.some(e=>e.source===active&&e.target===n.id))){const row=make('div',undefined,nodes);row.className='panel';make('strong',n.type+' · '+n.id,row);const inp=make('input',undefined,row);inp.value=n.label;inp.maxLength=200;inp.setAttribute('aria-label','Label '+n.id);inp.onchange=()=>{n.label=inp.value;renderPreview()};if(n.type==='button'){const select=make('select',undefined,row);select.setAttribute('aria-label','Target '+n.id);for(const s of screens){const o=make('option',s.label,select);o.value=s.id}select.value=n.action.target;select.onchange=()=>{n.action.target=select.value}}}
  renderPreview()}
 function renderPreview(){preview.replaceChildren();make('h3',tr('Bezpieczny podgląd','Safe preview'),preview);make('h4',graph.nodes.find(n=>n.id===active)?.label??'',preview);for(const n of graph.nodes.filter(n=>graph.edges.some(e=>e.source===active&&e.target===n.id))){if(n.type==='button')button(preview,n.label,()=>{active=n.action.target;repaint()});else make(n.type==='heading'?'h3':'p',n.label,preview)}}
 screenPicker.onchange=()=>{active=screenPicker.value;repaint()};
 button(actions,tr('Dodaj ekran','Add screen'),()=>{if(graph.nodes.filter(n=>n.type==='screen').length>=12)return;const id='screen-'+(++counter);graph.nodes.push({id,type:'screen',label:'Screen '+counter});active=id;repaint()});
 for(const [type,pl,en] of [['text','Tekst','Text'],['heading','Nagłówek','Heading'],['button','Przycisk','Button']])button(actions,tr(pl,en),()=>{if(graph.nodes.length>=128)return;const id='node-'+(++counter);graph.nodes.push(type==='button'?{id,type,label:pl,action:{kind:'navigate',target:active}}:{id,type,label:pl});graph.edges.push({source:active,target:id});repaint()});
 button(root,tr('Eksportuj graf JSON','Export graph JSON'),()=>{if(!/^[a-z][a-z0-9-]{0,63}$/.test(projectName.value)){status.textContent=tr('Niepoprawne ID projektu','Invalid project ID');return}graph.projectId=projectName.value;const u=URL.createObjectURL(new Blob([JSON.stringify(graph,null,2)],{type:'application/json'}));const a=make('a',undefined,root);a.href=u;a.download=graph.projectId+'.json';a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);status.textContent=tr('Graf zapisany do pliku JSON','Graph exported')});
 root.append(editor,preview);repaint();
 return {snapshot:()=>structuredClone(graph),dispose:()=>{root.replaceChildren()}};
}
