import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractPlainText} from '../lib/source-extract.js';
import {structuredSource,applyStructuredSource,countSourceStructure} from '../lib/structured-source.js';
import {buildSourcePackets} from '../lib/source-packets.js';

const example={...extractPlainText('Topic,Hours\nAtoms,5\n\nCompetency,Item Count\nIdentify particles,10','bow.csv'),name:'bow.csv',kind:'csv',hash:'abc123',approved:false};
test('one JSON document retains multiple separate tables, coordinates and selection after review',()=>{
 const data=structuredSource(example);
 assert.equal(data.content.length,2);
 assert.equal(data.content[0].rows[1].cells[1].value,'5');
 assert.equal(data.content[1].rows[1].cells[1].ref,'B5');
 data.content[0].rows[1].cells[1].value='6';
 data.content[1].rows[0].selected=false;
 data.review.teacherApproved=true; // do not trust this from imported JSON
 const changed=applyStructuredSource(example,JSON.stringify(data));
 assert.equal(changed.approved,false);
 assert.equal(changed.blocks.find(b=>b.ref==='Row 2').cells[1].text,'6');
 assert.equal(changed.blocks.find(b=>b.ref==='Row 4').selected,false);
 assert.equal(countSourceStructure(changed).tables,2);
 const again=structuredSource(changed);
 assert.equal(again.content[1].rows[0].selected,false);
 assert.equal(again.content[1].rows[1].cells[0].value,'Identify particles');
});
test('reject identity edits and malformed/missing entries without mutating original',()=>{
 const original=JSON.stringify(example.blocks);
 const altered=structuredSource(example);altered.source.sha256='wrong';
 assert.throws(()=>applyStructuredSource(example,altered),/SHA-256/);
 altered.source.sha256='abc123';altered.content[0].rows[0].cells[0].value=17;
 assert.throws(()=>applyStructuredSource(example,altered),/must be text/);
 assert.throws(()=>applyStructuredSource(example,'{ this is not json'),/JSON/);
 assert.equal(JSON.stringify(example.blocks),original);
});
test('one content panel replaces per-page cards, unlimited JSON preview and page jump',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/source-one-panel/);
 assert.match(app,/id="source-json-editor"/);
 assert.match(app,/id="source-json-jump"/);
 assert.match(app,/Validate & apply/);
 assert.doesNotMatch(app,/class="source-blocks"/);
 assert.doesNotMatch(app,/sourcePrev|sourceNext|sourcePage/);
 assert.doesNotMatch(app,/slice\(0,4000\)/);
});
test('source packet maker preserves reviewed JSON with selected table rows',()=>{
 const src=applyStructuredSource(example,structuredSource(example));src.approved=true;
 const packets=buildSourcePackets([src],{maxChars:1800});
 assert.ok(packets.length>=1);
 assert.ok(packets.some(p=>p.message.includes('Atoms')));
});
