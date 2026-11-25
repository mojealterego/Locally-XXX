import {spawnSync} from 'node:child_process';
import {existsSync, lstatSync, readdirSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PINNED_UPSTREAM_SHA, verifyUpstream} from './upstream-gate.mjs';
import {prepareStage} from './staged-runtime.mjs';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const COMMANDS=Object.freeze({
  dev:['run','dev'],build:['run','build'],lint:['run','lint'],
  'test:unit':['exec','--offline','--','vitest','run'],
  'test:e2e':['run','test:e2e'],'tauri:build':['run','tauri:build'],
});
function emptyCheckout(path){
  if(!existsSync(path))return true;
  const s=lstatSync(path);
  return s.isDirectory()&&!s.isSymbolicLink()&&readdirSync(path).length===0;
}

/** Choose verified source; never silently replace a populated invalid checkout. */
export function planRuntime({root=ROOT,expectedSha=PINNED_UPSTREAM_SHA,mode='auto',allowMissingDocs=false,verify=verifyUpstream,prepare=prepareStage}={}){
  if(!['auto','submodule','staged'].includes(mode))throw Error('Invalid OMEGA source mode');
  const location=join(resolve(root),'upstream','locally-uncensored');
  if(mode!=='staged'){
    const checked=verify({source:location,expectedSha});
    if(checked.ok)return {mode:'submodule',source:location,verification:checked};
    if(mode==='submodule'||!emptyCheckout(location))throw Error('Upstream source rejected: '+checked.errors.join('; '));
  }
  const checked=prepare({root,expectedSha,allowMissingDocs,apply:false});
  return {mode:'staged',source:null,verification:checked};
}

export function runRuntime(action,opts={}){
  if(action!=='verify'&&!Object.hasOwn(COMMANDS,action)){
    process.stderr.write('Unknown runtime command\n');return 2;
  }
  try{
    const root=opts.root??ROOT, expectedSha=opts.expectedSha??PINNED_UPSTREAM_SHA;
    const mode=opts.mode??process.env.OMEGA_SOURCE_MODE??'auto';
    const allowMissingDocs=opts.allowMissingDocs??(process.env.OMEGA_ALLOW_MISSING_DOC_ASSETS==='YES');
    const verify=opts.verify??verifyUpstream,prepare=opts.prepare??prepareStage;
    const selected=planRuntime({root,expectedSha,mode,allowMissingDocs,verify,prepare});
    if(action==='verify'){
      process.stdout.write(JSON.stringify(selected,null,2)+'\n');return 0;
    }
    const source=selected.mode==='staged'?
      prepare({root,expectedSha,allowMissingDocs,apply:true}).output:selected.source;
    if(!source||typeof source!=='string')throw Error('Verified runtime directory missing');
    const npm=process.platform==='win32'?'npm.cmd':'npm';
    const runner=opts.runner??spawnSync;
    const processResult=runner(npm,['--prefix',source,...COMMANDS[action]],{stdio:'inherit',shell:false});
    if(processResult.error)throw processResult.error;
    return processResult.status??1;
  }catch(error){process.stderr.write('Runtime gate rejected: '+error.message+'\n');return 1;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  process.exitCode=runRuntime(process.argv[2]??'verify');
}
