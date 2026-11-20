import {createCatalogIndex,searchCatalog} from './catalog-index.mjs';
/** Bounded, accessible client-side filtering. Never executes catalog-provided markup or code. */
export function mountCatalog(root,modules,open,{locale='pl'}={}){
 if(!root||typeof root.append!=='function'||!Array.isArray(modules)||typeof open!=='function')throw Error('Invalid catalog UI');
 const t=(pl,en)=>locale==='pl'?pl:en;
 const index=createCatalogIndex(modules.map(m=>({id:m.id,name:m.label,description:m.label,category:m.available?'available':'planned',tags:[],year:undefined,updatedAt:undefined})));
 const byId=new Map(modules.map(m=>[m.id,m]));
 const input=document.createElement('input');input.type='search';input.maxLength=256;input.placeholder=t('Szukaj modułu…','Search modules…');input.setAttribute('aria-label',t('Szukaj modułu','Search module'));
 const filter=document.createElement('select');filter.setAttribute('aria-label',t('Dostępność','Availability'));
 for(const [value,pl,en] of [['', 'Wszystkie','All'],['available','Dostępne','Available'],['planned','Planowane','Planned']]){const option=document.createElement('option');option.value=value;option.textContent=t(pl,en);filter.append(option)}
 const info=document.createElement('p');info.setAttribute('role','status');const grid=document.createElement('div');grid.className='tiles';
 function render(){const results=searchCatalog(index,{query:input.value,category:filter.value,limit:200});grid.replaceChildren();info.textContent=t('Wyniki: ','Results: ')+results.total;
  for(const item of results.items){const m=byId.get(item.id);const button=document.createElement('button');button.type='button';button.className='tile';button.dataset.module=m.id;button.textContent=m.label;button.disabled=!m.available;button.onclick=()=>{if(m.available)open(m.id)};const detail=document.createElement('span');detail.textContent=m.available?t('Otwórz','Open'):t('Niedostępne','Unavailable');button.append(detail);grid.append(button)}
 }
 input.addEventListener('input',render);filter.addEventListener('change',render);root.append(input,filter,info,grid);render();
 return {dispose(){input.removeEventListener('input',render);filter.removeEventListener('change',render)},getMatches(){return Number(info.textContent.replace(/\D/g,''))}};
}
