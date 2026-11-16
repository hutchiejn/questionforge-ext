import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_SETTINGS,createDemoQuestions} from '../lib/model.js';
import {pageLayout,showSchoolInTitle} from '../lib/page-layout.js';
import {buildDocxBlob} from '../lib/docx-export.js';
import {renderPaper} from '../lib/print-export.js';

async function xmlParts(blob){
  const bytes=new Uint8Array(await blob.arrayBuffer());const view=new DataView(bytes.buffer);const decode=new TextDecoder();let i=0;const parts={};
  while(i+30<=bytes.length&&view.getUint32(i,true)===0x04034b50){
    const length=view.getUint32(i+18,true),len=view.getUint16(i+26,true),extra=view.getUint16(i+28,true);
    const name=decode.decode(bytes.slice(i+30,i+30+len));const from=i+30+len+extra;
    parts[name]=decode.decode(bytes.slice(from,from+length));i=from+length;
  }
  return parts;
}

test('margin presets use explicit stable physical sizes',()=>{
  assert.equal(pageLayout({margins:'normal'}).twips.left,1440);
  assert.equal(pageLayout({margins:'narrow'}).twips.left,720);
  assert.equal(pageLayout({margins:'moderate'}).twips.left,1080);
  assert.equal(pageLayout({margins:'wide'}).twips.left,1800);
  assert.equal(pageLayout({margins:'narrow',pageColumns:'2'}).columns,2);
  assert.equal(pageLayout({margins:'bad',pageColumns:200}).columns,1);
});

test('Word preserves full-width title and key while applying two-column questions',async()=>{
  const settings={...DEFAULT_SETTINGS,pageColumns:2,margins:'narrow',school:'Example School',
    headerCenter:'Example School · Science Department',headerLeft:'Faculty room',headerRight:'Quarter 2'};
  const parts=await xmlParts(buildDocxBlob(createDemoQuestions(),settings));
  const doc=parts['word/document.xml'];
  assert.match(doc,/w:pgMar w:top="1152" w:right="720" w:bottom="1152" w:left="720"/);
  assert.match(doc,/<w:cols w:num="2"/);
  assert.match(doc,/<w:cols w:num="1"/);
  assert.equal((doc.match(/<w:sectPr>/g)||[]).length,3);
  assert.ok(doc.indexOf('Instructions:')<doc.indexOf('<w:cols w:num="2"')); // title section before the two-column section ends
  assert.ok(doc.indexOf('<w:cols w:num="2"')<doc.indexOf('ANSWER KEY'));
  assert.ok(!doc.includes('Example School</w:t>')); // avoid duplicate school label in body, only header has school
  const header=parts['word/header1.xml'];
  assert.match(header,/Faculty room/);assert.match(header,/Science Department/);assert.match(header,/Quarter 2/);
  assert.match(header,/<w:tbl>/);
});

test('one-column Word keeps one section, normal margins, and full key',async()=>{
  const parts=await xmlParts(buildDocxBlob(createDemoQuestions(),DEFAULT_SETTINGS));
  assert.equal((parts['word/document.xml'].match(/<w:sectPr>/g)||[]).length,1);
  assert.match(parts['word/document.xml'],/w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/);
  assert.match(parts['word/document.xml'],/ANSWER KEY/);
});

test('Word and Chrome print use matching paper margins, layout and centered custom header',()=>{
  const opts={...DEFAULT_SETTINGS,margins:'narrow',pageColumns:2,school:'Sample School',headerCenter:'Sample School · Department',headerRight:'School Year 2026–27'};
  const result=renderPaper(createDemoQuestions(),opts);
  assert.match(result.css,/@page\s*\{[^}]*margin:20\.32mm 12\.7mm 20\.32mm 12\.7mm/);
  assert.match(result.css,/@top-center \{ content:"Sample School · Department"/);
  assert.match(result.markup,/paper-header-center/);
  assert.match(result.markup,/column-count:2/);
  assert.ok(!result.markup.includes('<div class="paper-school">Sample School</div>'));
  assert.ok(result.markup.indexOf('</div><section class="answer-key"')>0); // key is outside columns
});

test('teacher can force repeating the school name; otherwise header prevents duplication',()=>{
  const base={...DEFAULT_SETTINGS,school:'Example Academy',headerCenter:'Example Academy - STEM'};
  assert.equal(showSchoolInTitle(base),false);
  assert.equal(showSchoolInTitle({...base,avoidDuplicateSchool:false}),true);
  assert.equal(showSchoolInTitle({...base,headerCenter:'Department of STEM'}),true);
});

test('Export controls include custom header text, margin and column selects',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.match(app,/data-setting=\\?"headerCenter/);
  assert.match(app,/Center header text/);
  assert.match(app,/Page margins/);
  assert.match(app,/Page layout/);
  assert.match(app,/2 columns/);
});
