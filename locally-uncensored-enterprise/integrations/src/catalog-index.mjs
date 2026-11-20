/** Deterministic, local-only catalog filtering. The Discogs viewer inspired the UX, not this code. */
const fail = () => { throw new Error('Invalid catalog request'); };
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fields = new Set(['id','name','description','category','tags','year','updatedAt']);
const fold = s => s.normalize('NFD').replace(/\p{M}/gu,'').replace(/ł/g,'l').replace(/Ł/g,'L').toLocaleLowerCase('en').trim();
const collator = new Intl.Collator('pl', {numeric:true,sensitivity:'base'});
const internal = new WeakMap();

function checkedRow(raw) {
 if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype || Object.keys(raw).some(k=>!fields.has(k))) fail();
 if (typeof raw.id !== 'string' || !ID.test(raw.id)) fail();
 for (const key of ['name','description','category']) if (typeof raw[key] !== 'string' || raw[key].length<1 || raw[key].length>1024) fail();
 if (!Array.isArray(raw.tags) || raw.tags.length>32 || raw.tags.some(s=>typeof s!=='string'||s.length<1||s.length>80)) fail();
 if (raw.year!==undefined && (!Number.isSafeInteger(raw.year)||raw.year<1000||raw.year>2200)) fail();
 if (raw.updatedAt!==undefined && (typeof raw.updatedAt!=='string'||!DATE.test(raw.updatedAt)||Number.isNaN(Date.parse(raw.updatedAt)))) fail();
 const row=Object.freeze({id:raw.id,name:raw.name,description:raw.description,category:raw.category,tags:Object.freeze([...raw.tags]),year:raw.year??null,updatedAt:raw.updatedAt??null});
 const words=fold([row.name,row.description,row.category,...row.tags].join(' '));
 return Object.freeze({row,words,category:fold(row.category),tags:new Set(row.tags.map(fold))});
}
export function createCatalogIndex(rows) {
 if (!Array.isArray(rows) || rows.length>50000) fail();
 const seen=new Set(), entries=[];
 for (const r of rows) {const e=checkedRow(r);if(seen.has(e.row.id))fail();seen.add(e.row.id);entries.push(e);}
 const index=Object.freeze({size:entries.length});internal.set(index,entries);return index;
}
export function searchCatalog(index,{query='',category='',tag='',yearFrom=null,yearTo=null,sort='name',direction='asc',offset=0,limit=50}={}) {
 if (!internal.has(index) || typeof query!=='string'||query.length>256||typeof category!=='string'||category.length>128||typeof tag!=='string'||tag.length>128||!['id','name','category','year','updatedAt'].includes(sort)||!['asc','desc'].includes(direction)||!Number.isSafeInteger(offset)||offset<0||offset>1000000||!Number.isSafeInteger(limit)||limit<1||limit>200)fail();
 for(const y of [yearFrom,yearTo]) if(y!==null&&(!Number.isSafeInteger(y)||y<1000||y>2200))fail();
 if(yearFrom!==null&&yearTo!==null&&yearFrom>yearTo)fail();
 const terms=[...new Set(fold(query).split(/\s+/).filter(Boolean))],cat=fold(category),t=fold(tag);
 const results=[];
 for(const e of internal.get(index)){const r=e.row;
  if(cat&&e.category!==cat||t&&!e.tags.has(t)||yearFrom!==null&&(r.year??-1)<yearFrom||yearTo!==null&&(r.year??Infinity)>yearTo||terms.some(term=>!e.words.includes(term)))continue;
  results.push(r);
 }
 const sign=direction==='asc'?1:-1;
 results.sort((a,b)=>{const x=a[sort]??(sort==='year'?0:''),y=b[sort]??(sort==='year'?0:'');const diff=typeof x==='number'&&typeof y==='number'?Math.sign(x-y):collator.compare(String(x),String(y));return sign*diff||collator.compare(a.id,b.id)});
 return Object.freeze({total:results.length,offset,limit,hasMore:offset+limit<results.length,items:Object.freeze(results.slice(offset,offset+limit))});
}
