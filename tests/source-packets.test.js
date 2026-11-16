import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSourcePackets,allPacketsConfirmed,buildAllPacketsMessage} from '../lib/source-packets.js';
import {buildCoveragePrompt,DEFAULT_PROMPT_CONFIG} from '../lib/prompt-builder.js';
import {readFileSync} from 'node:fs';

const tdoc=(blocks,name='Unit8_BOW.xlsx')=>({name,kind:'xlsx',hash:'sha-12345',approved:true,warnings:['Review merged cells'],hasCriticalError:false,blocks});
const row=(i,text='Atom structure and atomic mass')=>({kind:'table-row',selected:true,tableId:'Table 1',tableRef:'Q2 · Table 1',ref:`Q2 · row ${i}`,rowNumber:i,text,
 cells:[{ref:`A${i}`,column:'A',text:`Objective ${i}`},{ref:`B${i}`,column:'B',text:text.repeat(4)}]});

test('long workbook yields bounded ordered packets with intact table rows and references',()=>{
 const doc=tdoc(Array.from({length:100},(_,i)=>row(i+1)));
 const packets=buildSourcePackets([doc],{maxChars:3000});
 assert.ok(packets.length>1);
 const reconstructed=packets.flatMap(p=>p.payload.content);
 assert.equal(reconstructed.length,100);
 assert.equal(reconstructed[0].tableId,'Table 1');
 assert.equal(reconstructed[0].row.cells[0].ref,'A1');
 assert.equal(reconstructed[99].row.cells[0].ref,'A100');
 assert.ok(packets.every((p,i)=>p.data.length<=3000&&p.index===i+1&&p.total===packets.length));
 assert.ok(packets.every(p=>p.message.includes(`PACKET ${p.index} OF ${packets.length}`)));
 assert.equal(allPacketsConfirmed(packets,{}),false);
 assert.equal(allPacketsConfirmed(packets,Object.fromEntries(packets.map(p=>[p.index,true]))),true);
});
test('large individual PDF page is recoverable losslessly from JSON fragments',()=>{
 const raw='A complicated volcano science PDF including σ, β, ㎥, emoji 🌋, newline\\n and many instructions. '.repeat(150);
 const doc=tdoc([{kind:'pdf-page',ref:'Page 3',page:3,text:raw,selected:true}], 'science.pdf');
 const packets=buildSourcePackets([doc],{maxChars:1800});
 const fragments=packets.flatMap(p=>p.payload.content);
 assert.ok(fragments.length>1);
 assert.ok(fragments.every(f=>f.type==='json-fragment'));
 const rebuilt=JSON.parse(fragments.map(f=>f.jsonText).join(''));
 assert.equal(rebuilt.text,raw);
 assert.equal(rebuilt.ref,'Page 3');
 assert.deepEqual(fragments.map(f=>f.fragmentIndex),fragments.map((_,i)=>i+1));
 assert.ok(packets.every(p=>p.data.length<=1800));
});
test('unverified documents and incomplete sources are never packaged',()=>{
 const doc=tdoc([row(1)]);doc.approved=false;
 assert.throws(()=>buildSourcePackets([doc]),/approve/i);
 doc.approved=true;doc.hasCriticalError=true;
 assert.throws(()=>buildSourcePackets([doc]),/incomplete/i);
});
test('stage-one coverage prompt refers to all packets without asking for an approved plan',()=>{
 const prompt=buildCoveragePrompt(DEFAULT_PROMPT_CONFIG,{mode:'staged'});
 assert.match(prompt,/every packet from 1 through N/);
 assert.match(prompt,/DO NOT GENERATE ANY QUESTIONS YET/);
 assert.doesNotMatch(prompt,/approved coverage plan provided EARLIER/);
});
test('UI provides packet picker, confirmation, and prevents copy before confirming all source parts',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const style=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 assert.match(app,/data-action="copyPacket"/);
 assert.match(app,/id="packet-confirmed"/);
 assert.match(app,/allPacketsConfirmed\(packets,state\.packetConfirmed\)/);
 assert.match(app,/Copy coverage prompt/);
 assert.match(style,/\.packet-list/);
});

test('large source preview and exam prompt reuse staged content without resending the entire JSON',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/opts\.mode==='staged'\?\{mode:'continuation'\}:opts/);
 assert.match(app,/if\(el\.id==='manual-approve'\).*render\(true\)/);
 assert.match(app,/Copy and confirm all source parts before planning/);
});

test('copy-all collection includes every JSON packet exactly once in order',()=>{
 const packets=buildSourcePackets([tdoc(Array.from({length:80},(_,i)=>row(i+1)))],{maxChars:2100});
 const all=buildAllPacketsMessage(packets);
 let last=-1;
 for(const packet of packets){
   const header=`BEGIN SOURCE JSON — PART ${packet.index} OF ${packets.length}`;
   const at=all.indexOf(header);assert.ok(at>last);last=at;
   assert.equal(all.split(header).length,2);
   assert.ok(all.includes(`${header}\n${packet.data}\nEND SOURCE JSON — PART ${packet.index} OF ${packets.length}`));
 }
 assert.equal(all.split('BEGIN SOURCE JSON — PART').length-1,packets.length);
 assert.throws(()=>buildAllPacketsMessage([...packets].reverse()),/out of order/);
});
test('light theme copy-all panel and explicit confirmation are implemented',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 assert.match(app,/data-action="copyAllPackets"/);
 assert.match(app,/id="packets-all-confirmed"/);
 assert.match(app,/case 'copyAllPackets'/);
 assert.match(app,/buildAllPacketsMessage\(packets\)/);
 assert.match(css,/html\[data-theme="light"\] \.field-kicker/);
 assert.match(css,/\.packet-bulk-actions/);
});
