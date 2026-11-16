import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDocxBlob} from '../lib/docx-export.js';
import {renderPaper} from '../lib/print-export.js';
import {createDemoQuestions,DEFAULT_SETTINGS} from '../lib/model.js';
import {answerItems,resolveDocumentText,readableText} from '../lib/document-utils.js';

// Test PNG is a 1 x 1 pixel. No actual institution logo is bundled.
const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sZJE3gAAAAASUVORK5CYII=';
const logo={name:'sample.png',mime:'image/png',data:'data:image/png;base64,'+pixel,width:1,height:1};
async function entries(blob) {
  const bytes=new Uint8Array(await blob.arrayBuffer());const view=new DataView(bytes.buffer);const utf8=new TextDecoder();const data={};let i=0;
  while(view.getUint32(i,true)===0x04034b50){
    const length=view.getUint32(i+18,true),nameLen=view.getUint16(i+26,true),extra=view.getUint16(i+28,true);
    const name=utf8.decode(bytes.slice(i+30,i+30+nameLen));const start=i+30+nameLen+extra;
    data[name]=bytes.slice(start,start+length);i=start+length;
  }
  return Object.fromEntries(Object.entries(data).map(([k,v])=>[k,k.endsWith('.xml')||k.endsWith('.rels')?utf8.decode(v):v]));
}
test('Word export embeds logo, repeating header, dynamic footer, and real page fields',async()=>{
  const settings={...DEFAULT_SETTINGS,school:'Sample School',subject:'Mathematics',title:'Geometry Review',
    brandLogo:logo,logoPlacement:'header',headerLeft:'{school}',headerRight:'{subject}',
    footerLeft:'Property of {school}',footerCenter:'{title}',footerRight:'{date}',showPageNumbers:true};
  const files=await entries(buildDocxBlob(createDemoQuestions(),settings));
  assert.ok(files['word/media/logo.png'] instanceof Uint8Array);
  assert.match(files['word/header1.xml'],/Sample School/);
  assert.match(files['word/header1.xml'],/Institution logo/);
  assert.match(files['word/footer1.xml'],/Property of Sample School/);
  assert.match(files['word/footer1.xml'],/Geometry Review/);
  assert.match(files['word/footer1.xml'],/w:instr="PAGE"/);
  assert.match(files['word/footer1.xml'],/w:instr="NUMPAGES"/);
  assert.match(files['word/_rels/header1.xml.rels'],/media\/logo.png/);
  assert.match(files['word/document.xml'],/rIdHeader/);
  assert.match(files['word/document.xml'],/rIdFooter/);
  assert.match(files['word/document.xml'],/ANSWER KEY/);
});
test('Logo can be placed in first-page title instead of running header',async()=>{
  const files=await entries(buildDocxBlob(createDemoQuestions(),{...DEFAULT_SETTINGS,brandLogo:logo,logoPlacement:'title',headerLeft:'Course review'}));
  assert.match(files['word/document.xml'],/Institution logo/);
  assert.match(files['word/_rels/document.xml.rels'],/media\/logo.png/);
  assert.ok(!files['word/_rels/header1.xml.rels']);
});
test('Grouped answers use a compact MCQ grid and readable enumeration and essay content',async()=>{
  const demo=createDemoQuestions();demo[3].answer='c^2 = a^2 + b^2\nc = 10 cm';
  const files=await entries(buildDocxBlob(demo,{...DEFAULT_SETTINGS}));
  const doc=files['word/document.xml'];
  assert.match(doc,/ANSWER KEY/);
  assert.match(doc,/w:tbl/);
  assert.match(doc,/c² = a² \+ b²/);
  assert.match(doc,/HTML/);
  assert.match(doc,/JavaScript/);
  const html=renderPaper(demo,DEFAULT_SETTINGS);
  assert.match(html.markup,/paper-key-grid/);
  assert.match(html.markup,/paper-key-prose/);
  assert.match(html.markup,/c² = a² \+ b²/);
  assert.match(html.css,/counter\(page\)/);
});
test('Template substitutions and user-provided logo URL validation avoid script injection',()=>{
  const settings={...DEFAULT_SETTINGS,title:'<img src=x onerror=alert(1)>',headerLeft:'{title}', footerLeft:'{subject}'};
  const html=renderPaper(createDemoQuestions(),settings);
  assert.ok(!html.markup.includes('<img src=x onerror'));
  assert.ok(html.markup.includes('&lt;img src=x'));
  assert.equal(readableText('c^2 = a^2 + b^2'), 'c² = a² + b²');
  assert.deepEqual(answerItems('One\nTwo','enumeration'),['One','Two']);
  assert.equal(resolveDocumentText('{school} • {title}',{...settings,school:'Academy'}),'Academy • <img src=x onerror=alert(1)>');
});

test('Answer key can be previewed separately from question pages',()=>{
  const demo=createDemoQuestions();
  const key=renderPaper(demo,DEFAULT_SETTINGS,{preview:true,previewSection:'answerKey'}).markup;
  const questions=renderPaper(demo,DEFAULT_SETTINGS,{preview:true,previewSection:'questions'}).markup;
  assert.match(key,/paper-key-grid/);
  assert.ok(!key.includes('paper-question'));
  assert.match(questions,/paper-question/);
  assert.ok(!questions.includes('paper-key-grid'));
});
