import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDemoQuestions, DEFAULT_SETTINGS} from '../lib/model.js';
import {buildDocxBlob} from '../lib/docx-export.js';
import {renderPaper} from '../lib/print-export.js';
import {logoSizePx} from '../lib/document-utils.js';

const css = readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('file input is hidden, logo upload is compact and uses one flexible column',()=>{
  assert.match(css,/\[hidden\],input\[hidden\],\.sr-only\{display:none!important\}/);
  assert.match(css,/\.logo-upload-zone\s*\{display:grid;grid-template-columns:54px minmax\(0,1fr\)/);
  assert.match(css,/\.logo-upload-copy strong\s*\{[^}]*white-space:nowrap;text-overflow:ellipsis/);
});

test('logo scale is capped strictly below one inch in both Word and PDF',async()=>{
  assert.equal(logoSizePx({logoSizePx:250}),72);
  assert.equal(logoSizePx({logoSizePx:9}),16);
  assert.equal(logoSizePx({}),44); // legacy default when setting omitted
  const logo={mime:'image/png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sZJE3gAAAAASUVORK5CYII=',width:1,height:1};
  const s={...DEFAULT_SETTINGS,logoSizePx:200,brandLogo:logo};
  const html=renderPaper(createDemoQuestions(),s);
  assert.match(html.markup,/max-width:72px;max-height:72px/);
  assert.match(html.css,/background-size:19\.05mm auto/);
  const blob=buildDocxBlob(createDemoQuestions(),s);
  const raw=new Uint8Array(await blob.arrayBuffer());
  const asString=new TextDecoder('latin1').decode(raw);
  assert.match(asString,/wp:extent cx="685800" cy="685800"/); // 0.75in, not >= 1in
});

test('theme toggle button renders with persisted preference',async()=>{
  const handlers={};
  const app={innerHTML:'',addEventListener(k,v){handlers[k]=v;}};
  const html={setAttribute(k,v){this[k]=v;}};
  const oldDocument=globalThis.document, oldSetTimeout=globalThis.setTimeout;
  const oldLocalStorage=globalThis.localStorage;
  globalThis.localStorage={getItem(){return JSON.stringify({questionforgeDraft:{raw:'',questions:createDemoQuestions(),settings:{...DEFAULT_SETTINGS,theme:'light'}}});},setItem(){}};
  globalThis.setTimeout=()=>0;
  globalThis.document={documentElement:html,querySelector(s){return s==='#app'?app:s==='#toast-host'?{innerHTML:''}:s==='.scroll-area'?{scrollTop:0}:null;}};
  try{
    await import('../app.js');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(html['data-theme'],'light');
    assert.match(app.innerHTML,/Switch to dark mode/);
    handlers.click({target:{closest(){return {dataset:{action:'toggleTheme'}};}}});
    assert.equal(html['data-theme'],'dark');
    assert.match(app.innerHTML,/Switch to light mode/);
  } finally {
    globalThis.document=oldDocument;globalThis.setTimeout=oldSetTimeout;globalThis.localStorage=oldLocalStorage;
  }
});
