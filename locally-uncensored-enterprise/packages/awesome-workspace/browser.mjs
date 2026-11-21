import {DEFINITIONS} from './definitions.mjs';
/** Read-only catalog. Existing capabilities may be opened, but status never becomes PASS. */
export function mountAwesome(root,{locale='pl',open=()=>{}}={}){
 if(!root||typeof root.append!=='function'||typeof open!=='function'||!['pl','en'].includes(locale))throw Error('Invalid Awesome catalog');
 const t=(pl,en)=>locale==='pl'?pl:en;
 const create=(name,parent,content)=>{const node=document.createElement(name);node.textContent=content;parent.append(node);return node};
 const routes={'awesome-local-llm':'knowledge','awesome-ai-apps':'apps','awesome-ai-devtools':'ide','awesome-json-fmt':'jsonfmt','awesome-stundensatz-rechner':'rates','awesome-ai-agents':'agents'};
 const title=create('h2',root,'Awesome Enterprise Workspace');title.id='awesome-title';
 create('p',root,t('Wszystkie pozycje są w trakcie integracji. Status PARTIAL oznacza istniejący kod, nie pełne wdrożenie.','All integrations remain incomplete. PARTIAL means code exists, not production readiness.'));
 const list=create('div',root,'');list.className='awesome-list';
 for(const x of DEFINITIONS){const section=create('section',list,'');section.className='panel';create('h3',section,x.id);create('p',section,x.capability);create('p',section,'Status: '+x.status+' · '+t('Pozostało: ','Outstanding: ')+x.outstanding);const route=routes[x.id];if(route){const btn=create('button',section,t('Otwórz dostępny moduł','Open available module'));btn.type='button';btn.addEventListener('click',()=>open(route))}else create('p',section,t('Brak interfejsu w bieżącym wydaniu','No UI in this release'))}
 return {dispose(){root.replaceChildren()}};
}
