const fail=()=>{throw Error('Invalid file, size or revision conflict')};
const safe=p=>typeof p==='string'&&p.length<=256&&p.split('/').every(x=>/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(x)&&!x.endsWith('.'));
const bytes=s=>new TextEncoder().encode(s).length;
export class Workspace {
  #files=new Map();#size=0;
  add(path,text){if(!safe(path)||this.#files.has(path)||this.#files.size>=64||typeof text!=='string'||bytes(text)>262144||this.#size+bytes(text)>2097152)fail();this.#files.set(path,{text,revision:1});this.#size+=bytes(text);return this.read(path)}
  read(path){if(!safe(path)||!this.#files.has(path))fail();return {...this.#files.get(path)}}
  list(){return [...this.#files.keys()].sort()}
  edit(path,expected,text){const old=this.read(path);if(expected!==old.revision||typeof text!=='string'||bytes(text)>262144||old.revision>=Number.MAX_SAFE_INTEGER||this.#size-bytes(old.text)+bytes(text)>2097152)fail();this.#size+=bytes(text)-bytes(old.text);this.#files.set(path,{text,revision:old.revision+1});return this.read(path)}
}
export function viewportScale(w,h,availableW,availableH){if(![w,h,availableW,availableH].every(n=>Number.isFinite(n)&&n>0))fail();return Math.min(1,availableW/w,availableH/h)}
/** CSS transform shrinks the logical viewport; scale only once, outer shell takes transformed dimensions. */
export function viewportLayout(w,h,availableW,availableH){const scale=viewportScale(w,h,availableW,availableH);return Object.freeze({scale,renderedWidth:w*scale,renderedHeight:h*scale,unscaledVisibleHeight:availableH/scale});}
