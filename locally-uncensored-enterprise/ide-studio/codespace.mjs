import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {realpathSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
const invoke=promisify(execFile);
const OID=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SAFE=/^[A-Za-z0-9_][A-Za-z0-9_.+-]{0,79}$/;
const EXT=/\.(?:ts|tsx|js|mjs|json|md|html|css|txt|rs|kt|toml|yaml|yml)$/i;
const fail=()=>{throw Error('Git codespace denied')};
export function safeRepositoryPath(path){return typeof path==='string'&&path.length<=256&&path.split('/').every(x=>SAFE.test(x)&&x!=='.'&&x!=='..'&&!x.endsWith('.'))&&EXT.test(path)}
export class GitCodespace {
 #root;#list=null;#env;
 constructor(root,commit){this.#root=root;this.commit=commit;this.#env={PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0',GIT_NO_REPLACE_OBJECTS:'1',GIT_LFS_SKIP_SMUDGE:'1'}}
 static async open({root,commit}){if(typeof root!=='string'||typeof commit!=='string'||!OID.test(commit))fail();const dir=resolve(root);const st=lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||realpathSync(dir)!==dir)fail();const cs=new GitCodespace(dir,commit);const top=(await cs.#git(['rev-parse','--show-toplevel'],4096)).toString('utf8').trim();if(top!==dir)fail();const type=(await cs.#git(['cat-file','-t',commit],256)).toString('utf8').trim();if(type!=='commit')fail();return cs}
 async #git(args,max){const st=lstatSync(this.#root);if(!st.isDirectory()||realpathSync(this.#root)!==this.#root)fail();try{const {stdout}=await invoke('/usr/bin/git',['-C',this.#root,...args],{encoding:'buffer',maxBuffer:max,timeout:5000,env:this.#env,windowsHide:true});if(!Buffer.isBuffer(stdout)||stdout.length>max)fail();return stdout}catch{fail()}}
 async list(){if(this.#list)return this.#list.map(x=>({...x}));const raw=await this.#git(['ls-tree','-r','-z','--long',this.commit],2097152);const out=[];for(const line of raw.toString('utf8').split('\0')){if(!line)continue;const m=/^(100644|100755) blob ([0-9a-f]{40}|[0-9a-f]{64}) \s+([0-9]+)\t(.+)$/.exec(line);if(!m||!safeRepositoryPath(m[4])||Number(m[3])>262144||!Number.isSafeInteger(Number(m[3])))continue;out.push(Object.freeze({path:m[4],oid:m[2],bytes:Number(m[3])}));if(out.length>512)fail()}out.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);this.#list=out;return out.map(x=>({...x}))}
 async read(path){if(!safeRepositoryPath(path))fail();const entry=(await this.list()).find(x=>x.path===path);if(!entry)fail();const raw=await this.#git(['cat-file','blob',this.commit+':'+path],262144+1024);if(raw.length!==entry.bytes||raw.includes(0))fail();const oid=createHash(entry.oid.length===64?'sha256':'sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex');if(oid!==entry.oid)fail();try{return {path,commit:this.commit,oid,text:new TextDecoder('utf-8',{fatal:true}).decode(raw)}}catch{fail()}}
}
