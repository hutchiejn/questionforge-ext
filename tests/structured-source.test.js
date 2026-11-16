import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {extractDocx,extractPlainText,assembleVerifiedSources} from '../lib/source-extract.js';
import {extractXlsx} from '../lib/xlsx-extract.js';
import {structuredSource,countSourceStructure} from '../lib/structured-source.js';
const require=createRequire(import.meta.url);let Parser;
try{({DOMParser:Parser}=require('@xmldom/xmldom'));}
catch{try{({DOMParser:Parser}=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/mathjax-full/node_modules/@xmldom/xmldom'));}catch{}}
if(Parser)globalThis.DOMParser=Parser;
const bytes=filename=>{const b=readFileSync(new URL(`./fixtures/${filename}`,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
test('CSV with two table regions preserves column cells and true row numbers',()=>{
 const r=extractPlainText('Topic,Hours\nAtoms,5\n\nSkill,Items\nAnalysis,8','tos.csv');
 assert.deepEqual(r.blocks.map(b=>b.ref),['Row 1','Row 2','Row 4','Row 5']);
 assert.deepEqual([...new Set(r.blocks.map(b=>b.tableId))],['CSV Table 1','CSV Table 2']);
 const structured=structuredSource({...r,name:'tos.csv',hash:'abc'});
 assert.equal(structured.content.length,2);
 assert.equal(structured.content[0].rows[1].cells[1].value,'5');
});
test('source JSON preserves exact cell references, selects subset, and never silently truncates',()=>{
 const source={name:'bow.csv',kind:'csv',hash:'abc',approved:true,warnings:[],blocks:[
  {kind:'table-row',tableId:'CSV Table 1',ref:'Row 1',rowNumber:1,text:'A: Topic | B: Hours',cells:[{ref:'A1',column:'A',text:'Topic'},{ref:'B1',column:'B',text:'Hours'}],selected:true},
  {kind:'table-row',tableId:'CSV Table 1',ref:'Row 2',rowNumber:2,text:'A: Atoms | B: 4',cells:[{ref:'A2',column:'A',text:'Atoms'},{ref:'B2',column:'B',text:'4'}],selected:false}
 ]};
 const json=structuredSource(source,{selectedOnly:true});
 assert.equal(json.schema,'questionforge.source.v1');assert.equal(json.content.length,1);
 assert.equal(json.content[0].rows.length,1);
 const prompt=assembleVerifiedSources([source],{maxChars:16000});
 assert.match(prompt,/"value":"Topic"/);assert.doesNotMatch(prompt,/Atoms/);
 assert.throws(()=>assembleVerifiedSources([source],{maxChars:70}),/too long/);
});
test('XLSX multiple sheets, multiple table regions, merges, formula and cell values',{skip:!Parser},async()=>{
 const r=await extractXlsx(bytes('multi-table-bow-tos.xlsx'));
 assert.equal(r.kind,'xlsx');assert.equal(r.sheetNames.length,2);
 assert.equal(r.tableRegions,4);
 assert.ok(r.blocks.some(b=>b.ref==='Quarter 1 · row 5'&&b.cells[1].formula==='2+3'&&b.cells[1].text==='5'));
 assert.ok(r.blocks.some(b=>b.ref==='TOS · row 1'&&b.cells[0].mergedRange==='A1:C1'&&b.cells[0].colSpan===3));
 assert.ok(r.warnings.some(w=>w.includes('merged')));
 const source={...r,name:'bow-and-tos.xlsx',hash:'abc',approved:true};
 const tree=structuredSource(source),stats=countSourceStructure(source);
 assert.equal(stats.tables,4);assert.equal(stats.rows,r.blocks.length);
 assert.equal(tree.content[0].type,'table');
 assert.ok(tree.content.some(t=>t.rows?.some(row=>row.cells.some(cell=>cell.formula==='2+3'))));
});
test('original DOCX fixture remains readable after table-preserving upgrade',{skip:!Parser},async()=>{
 const r=await extractDocx(bytes('lesson-plan.docx'));
 assert.ok(r.blocks.length>0);
 assert.ok(r.blocks.some(b=>/Identify protons/.test(b.text)));
 if(r.blocks.some(b=>b.kind==='table-row'))assert.ok(r.blocks.filter(b=>b.kind==='table-row').every(b=>Array.isArray(b.cells)&&b.tableId));
});
test('source selection UI is vertical and supports full JSON export',()=>{
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(css,/\.source-mode\{display:flex;flex-direction:column/);
 assert.match(app,/downloadSourceJSON/);
 assert.match(app,/id="source-json-editor"/);assert.match(app,/applySourceJSON/);
 assert.match(app,/\.xlsx/);
});
test('DOCX with two distinct tables retains both table IDs, rows and original sequence',{skip:!Parser},async()=>{
 const r=await extractDocx(bytes('two-tables-lesson-plan.docx'));
 const structured=structuredSource({...r,name:'two-tables.docx',hash:'abc'});
 const tables=structured.content.filter(x=>x.type==='table');
 assert.equal(tables.length,2);
 assert.ok(tables.every(t=>t.rows.length===3));
 assert.equal(tables[0].rows[0].cells[0].ref,'A1');
 assert.ok(structured.content.some(x=>x.type==='paragraph'&&x.text==='Second table follows'));
});
