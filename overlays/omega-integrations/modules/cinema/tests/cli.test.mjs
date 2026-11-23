import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const run=(...args)=>JSON.parse(execFileSync(process.execPath,['src/cli.mjs',...args],{cwd:root,encoding:'utf8'}));
test('P10-047 CLI cinematic interchange output usable as JSON',()=>{
 const r=run('export-cinematic','examples/project_cinematic.json','GODOT');
 assert.equal(r.format,'omega.cinematic.interchange.v1');assert.equal(r.shots.length,2)
});
test('P10-048 CLI world interchange exports true source hashes',()=>{
 const r=run('export-world','examples/project_world.json','UNREAL');
 assert.equal(r.engine,'UNREAL');assert.equal(r.cells.length,4)
});
test('P10-049 CLI geodesic route returns path',()=>{
 const r=run('route','examples/project_world.json','w-0','w-3');
 assert.deepEqual(r.path,['w-0','w-1','w-3']);
});
