import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDemoQuestions,DEFAULT_SETTINGS} from '../lib/model.js';
import {logoSizePx} from '../lib/document-utils.js';
import {buildDocxBlob} from '../lib/docx-export.js';
import {renderPaper} from '../lib/print-export.js';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
test('new interface uses neutral charcoal, accessible select spacing and real questions',()=>{
  assert.match(css,/--bg:#111111/);
  assert.match(css,/appearance:none;-webkit-appearance:none/);
  assert.match(css,/background-position:right 13px center/);
  assert.match(css,/padding:10px 40px 10px 13px!important/);
  assert.match(app,/q-choice-preview/);
  assert.match(app,/New question type/);
  assert.match(app,/Correct choice/);
});
test('nontechnical header/footer controls are collapsible and allow custom text',()=>{
  assert.match(app,/function disclosure/);
  assert.match(app,/Page header/);
  assert.match(app,/Page footer/);
  assert.match(app,/School \/ institution/);
  assert.match(app,/Write my own text/);
  assert.match(app,/data-slot=/);
  assert.doesNotMatch(app,/Dynamic placeholders:/);
});
test('tiny 16px logo is preserved in Word and PDF export',async()=>{
  assert.equal(logoSizePx({logoSizePx:16}),16);
  assert.equal(logoSizePx({logoSizePx:5}),16);
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sZJE3gAAAAASUVORK5CYII=';
  const s={...DEFAULT_SETTINGS,logoSizePx:16,brandLogo:{name:'logo.png',mime:'image/png',data:`data:image/png;base64,${png}`,width:1,height:1},logoPlacement:'header'};
  const paper=renderPaper(createDemoQuestions(),s);
  assert.match(paper.markup,/max-width:16px;max-height:16px/);
  assert.match(paper.css,/background-size:4\.23mm auto/);
  const blob=buildDocxBlob(createDemoQuestions(),s);
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const asString=new TextDecoder('latin1').decode(bytes);
  assert.match(asString,/wp:extent cx="152400" cy="152400"/);
});
