import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createRequire} from 'node:module';
import {assertProject,compileNarrative,planAdaptiveAudio,createEnvelope,ValidationError} from '../src/index.mjs';
const dir=join(dirname(fileURLToPath(import.meta.url)),'..');
const load=rel=>JSON.parse(readFileSync(join(dir,rel),'utf8'));
// Schema metadata is structural validation; semantic cross-node validation happens in code.
for(const name of ['project','audio','narrative','neurobus','director_patch']){
 test(`Schema ${name} includes dialect, URI, and property constraints`,()=>{const s=load(`schemas/${name}.schema.json`);assert.equal(s.$schema,'https://json-schema.org/draft/2020-12/schema');assert.equal(s.additionalProperties,false);assert.ok(s.properties);assert.ok(s.$id.startsWith('urn:omega:aether:'));});
}
test('Example project satisfies executable code validation',()=>assert.equal(assertProject(load('examples/project.json')),true));
test('Example branching graph contains both unique epilogues',()=>assert.deepEqual(compileNarrative(load('examples/narrative.json')).ending_ids,['witness_safe','evidence_found']));
test('Example music quantizes to next bar at 120 BPM',()=>assert.equal(planAdaptiveAudio(load('examples/audio.json')).switch_at_ms,2000));
test('Example NeuroBus body is a signable structure',()=>assert.ok(createEnvelope(load('examples/neurobus_unsigned.json'),'example-secret').mac_sha256));
test('No private capture files or actor likeness distributed with examples',()=>{const j=JSON.stringify(load('examples/project.json'));assert.equal(j.includes('Bryan Dechart'),false);assert.equal(j.includes('performance_capture_file'),false)});
