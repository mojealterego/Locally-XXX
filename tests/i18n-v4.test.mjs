import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'omega-i18n-'));
let mod;
try {
  execFileSync('tsc',['--strict','--noUnusedLocals','--target','ES2022','--module','ES2022','--outDir',dir,'overlays/rag/src/i18n/locale.ts']);
  mod=await import(pathToFileURL(join(dir,'locale.js')).href);
} finally {rmSync(dir,{recursive:true,force:true});}
test('I18N-01 Polish is default, explicit English survives',()=>{for(const v of [undefined,null,'fr','__proto__','PL'])assert.equal(mod.normalizeLocale(v),'pl');assert.equal(mod.normalizeLocale('en'),'en')});
test('I18N-02 all navigation labels available in both languages',()=>{for(const [k,pl] of Object.entries({Chat:'Czat',Create:'Tworzenie',Compare:'Porównanie',Benchmark:'Test wydajności',Models:'Modele',Settings:'Ustawienia'})){assert.equal(mod.translate('pl',k),pl);assert.equal(mod.translate('en',k),k)}});
test('I18N-03 locale selection is independent of unknown stored values',()=>{assert.equal(mod.translate('zz','Continue'),'Kontynuuj');assert.equal(mod.localeTag('en'),'en-US');assert.equal(mod.localeTag('pl'),'pl-PL')});
test('I18N-04 Polish plural forms including 12 and 22',()=>{for(const [n,s] of [[0,'Zainstaluj 0 modeli'],[1,'Zainstaluj 1 model'],[2,'Zainstaluj 2 modele'],[5,'Zainstaluj 5 modeli'],[12,'Zainstaluj 12 modeli'],[22,'Zainstaluj 22 modele']])assert.equal(mod.installModelsLabel('pl',n),s);assert.equal(mod.installModelsLabel('en',2),'Install 2 models');assert.throws(()=>mod.installModelsLabel('pl',-1),RangeError)});
test('I18N-05 known personas localize without modifying technical ID or custom name',()=>{assert.equal(mod.personaName('pl',{id:'coder',name:'Code Expert',isBuiltIn:true}),'Ekspert kodowania');assert.equal(mod.personaName('pl',{id:'coder',name:'Moja persona',isBuiltIn:false}),'Moja persona');assert.equal(mod.personaName('en',{id:'coder',name:'Code Expert',isBuiltIn:true}),'Code Expert');assert.equal(mod.personaName('pl',{id:'constructor',name:'Custom',isBuiltIn:true}),'Custom')});
test('I18N-06 dictionary never returns an empty label or inherited member',()=>{for(const k of mod.translationKeys){assert.ok(mod.translate('pl',k));assert.equal(mod.translate('en',k),k)}assert.throws(()=>mod.translate('pl','__proto__'),RangeError)});
