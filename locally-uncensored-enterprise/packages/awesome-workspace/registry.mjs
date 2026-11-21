import {lstatSync,realpathSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFINITIONS} from './definitions.mjs';
const VALID=/^awesome-[a-z0-9-]+$/;
export function listAwesome(){return DEFINITIONS.map(x=>Object.freeze({...x}));}
export function lookupAwesome(id){if(typeof id!=='string'||!VALID.test(id))throw Error('Invalid Awesome module');const entry=DEFINITIONS.find(x=>x.id===id);if(!entry)throw Error('Unknown Awesome module');return Object.freeze({...entry});}
export function verifyAwesome(root=new URL('../../',import.meta.url)){
 const dir=resolve(root instanceof URL?fileURLToPath(root):root),entries=DEFINITIONS.map(x=>{
  let sourcePresent=false;
  if(x.entry){const path=resolve(dir,x.entry);if(!path.startsWith(dir+sep))throw Error('Registry escaped workspace');try{const st=lstatSync(path);sourcePresent=st.isFile()&&!st.isSymbolicLink()&&realpathSync(path)===path&&st.size>0}catch{sourcePresent=false}}
  return Object.freeze({...x,sourcePresent});
 });
 return Object.freeze({entries,ready:entries.every(x=>x.status==='PASS'&&x.sourcePresent),invalid:entries.filter(x=>x.entry&&!x.sourcePresent).map(x=>x.id)});
}
