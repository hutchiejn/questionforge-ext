import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {extractDocx,extractPdf,extractPlainText,readZipEntries,assembleVerifiedSources,fingerprint} from '../lib/source-extract.js';
import {buildCoveragePrompt,buildExamPrompt,DEFAULT_PROMPT_CONFIG} from '../lib/prompt-builder.js';
const require=createRequire(import.meta.url);
let testDOMParser;
try{({DOMParser:testDOMParser}=require('@xmldom/xmldom'));}
catch{try{({DOMParser:testDOMParser}=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/mathjax-full/node_modules/@xmldom/xmldom'));}catch{}}
if(testDOMParser)globalThis.DOMParser=testDOMParser;
const doc=fs.readFileSync(new URL('./fixtures/lesson-plan.docx',import.meta.url));
test('DOCX extraction reads supplied Word file with referenced paragraphs and answer-key text',{skip:!testDOMParser},async()=>{
 const r=await extractDocx(doc.buffer.slice(doc.byteOffset,doc.byteOffset+doc.byteLength));
 assert.ok(r.blocks.length>=7);
 assert.ok(r.blocks.some(b=>/Identify protons, neutrons, and electrons/.test(b.text)));
 assert.ok(r.blocks.some(b=>/Describe subatomic particles/.test(b.text)));
 assert.ok(r.blocks.every(b=>b.ref.startsWith('Paragraph')||b.ref.startsWith('Table')));
});
test('CSV keeps quoted commas, row source coordinates, and numeric text',()=>{
 const r=extractPlainText('Topic,Hours,Competency\n"Atoms, molecules",4,"Identify electrons, protons"\nVoltage,0,"Use symbols"','bow.csv');
 assert.equal(r.blocks.length,3);
 assert.match(r.blocks[1].text,/A: Atoms, molecules/);
 assert.match(r.blocks[1].text,/B: 4/);
 assert.match(r.blocks[1].ref,/Row 2/);
});
test('original SHA256 is stable and changes when bytes change',async()=>{
 const a=await fingerprint(new TextEncoder().encode('abc'));
 const b=await fingerprint(new TextEncoder().encode('abd'));
 assert.equal(a,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 assert.notEqual(a,b);
});
test('only approved selected source blocks included; no silent truncation',()=>{
 const sources=[{approved:true,name:'lesson.docx',hash:'12345678',blocks:[{selected:true,ref:'Paragraph 1',text:'Protons and neutrons'},{selected:false,ref:'Paragraph 2',text:'Student private details'}]}];
 const txt=assembleVerifiedSources(sources);
 assert.match(txt,/Protons and neutrons/);
 assert.doesNotMatch(txt,/Student private details/);
 assert.throws(()=>assembleVerifiedSources(sources,{maxChars:40}),/too long/);
 assert.throws(()=>assembleVerifiedSources([{...sources[0],approved:false}]),/approve/);
});
test('inline verified source is included only in stage 1; stage 2 references same chat',()=>{
 const opts={mode:'inline',sourceText:'[P1] Learn the structure of atoms.'};
 const stage1=buildCoveragePrompt(DEFAULT_PROMPT_CONFIG,opts);
 const stage2=buildExamPrompt(DEFAULT_PROMPT_CONFIG,opts);
 assert.match(stage1,/Learn the structure of atoms/);
 assert.doesNotMatch(stage1,/I will attach/);
 assert.match(stage2,/provided EARLIER in this SAME conversation/);
 assert.doesNotMatch(stage2,/I will attach/);
});
test('invalid DOCX ZIP fails clearly',async()=>{
 await assert.rejects(readZipEntries(new Uint8Array([1,2,3]),new Set(['word/document.xml'])),/valid ZIP/);
});
test('ordinary text-based PDF yields page referenced text, with a review warning',async()=>{
 const bytes=fs.readFileSync(new URL('./fixtures/test-lesson.pdf',import.meta.url));
 const r=await extractPdf(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 assert.equal(r.expectedPages,1);
 assert.equal(r.blocks[0].ref,'Page 1');
 assert.match(r.blocks[0].text,/Grade 8 Science/);
 assert.equal(r.hasCriticalError,false);
 assert.ok(r.warnings.some(x=>x.includes('PDF text streams are not guaranteed')));
});
test('partial document approval must never silently omit unverified sources',()=>{
 const one={approved:true,name:'lesson',hash:'aa',blocks:[{selected:true,ref:'P1',text:'Atoms'}]};
 assert.throws(()=>assembleVerifiedSources([one,{...one,approved:false,name:'bow'}]),/not approved/);
});
