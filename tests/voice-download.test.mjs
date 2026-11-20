import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'omega-v4-'));
let voice,download;
try {
  execFileSync('tsc',['--strict','--target','ES2022','--module','ES2022','--lib','ES2022,DOM','--outDir',dir,'overlays/rag/src/api/voice-pl.ts','overlays/rag/src/api/download-events.ts']);
  voice=await import(pathToFileURL(join(dir,'voice-pl.js')));download=await import(pathToFileURL(join(dir,'download-events.js')));
} finally {rmSync(dir,{recursive:true,force:true});}
test('VOICE-01 abbreviation and decimal are not sentence boundaries',()=>assert.deepEqual(voice.sentenceParts('To np. dr. Kowalski, 3.14 zł. Dalej!'),['To np. dr. Kowalski, 3.14 zł.',' Dalej!']));
test('VOICE-02 preserves CJK, newlines and punctuation',()=>{const s='日本語。次！\nTak?';const parts=voice.sentenceParts(s);assert.equal(parts.join(''),s);assert.deepEqual(parts,['日本語。','次！','\n','Tak?'])});
test('VOICE-03 preserves input, initials and Polish legal abbreviations',()=>{const s='Art. 3 ust. 2 pkt. 4. A. Nowak. Koniec.';assert.deepEqual(voice.sentenceParts(s),['Art. 3 ust. 2 pkt. 4.',' A. Nowak.',' Koniec.'])});
test('VOICE-04 language and local voices are explicit',()=>{assert.equal(voice.speechLanguage('pl'),'pl');assert.equal(voice.speechLanguage('en'),'en');assert.equal(voice.speechLanguage('xx'),'pl');assert.equal(voice.speechTag('pl'),'pl-PL')});
test('IPC-01 ETA only for active finite transfer',()=>{assert.equal(download.etaSeconds({progress:10,total:100,speed:20,status:'downloading'}),5);for(const d of [{speed:0},{speed:NaN},{total:0},{progress:101},{status:'paused'}])assert.equal(download.etaSeconds({progress:10,total:100,speed:20,status:'downloading',...d}),null)});
test('IPC-02 only current generation can apply events',()=>{const gate=new download.StreamGeneration();const a=gate.begin(),b=gate.begin();assert.equal(gate.current(a),false);assert.equal(gate.current(b),true);gate.stop();assert.equal(gate.current(b),false)});
test('IPC-03 validates shapes and rejects prototype keys',()=>{const row={progress:1,total:2,speed:1,status:'downloading',filename:'x'};assert.equal(download.isDownloadSnapshot({x:row}),true);assert.equal(download.isDownloadSnapshot(JSON.parse('{"__proto__":{}}')),false);assert.equal(download.isDownloadSnapshot({x:{...row,speed:Infinity}}),false);assert.equal(download.isDownloadSnapshot({x:{...row,progress:-1}}),false);assert.equal(download.isDownloadSnapshot([]),false)});
