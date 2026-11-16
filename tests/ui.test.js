import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Headless UI contract check without a browser: the app builds all three screens
// and sends imported questions through the unchanged model and export preview.
test('refresh renders import, review, search and export for 30 flattened questions', async () => {
  const handlers = {};
  const app = {
    innerHTML: '',
    addEventListener(type, cb) { handlers[type] = cb; },
  };
  const toast = { innerHTML: '' };
  const list = { innerHTML: '' };
  const count = { textContent: '' };
  const area = { scrollTop: 120 };
  const selectors = {
    '#app':app,'#toast-host':toast,'#question-list':list,'#review-count':count,
    '.scroll-area':area,
  };
  const oldDocument = globalThis.document;
  const oldSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = () => 0; // suppress toast/autosave timers in isolated DOM shim
  globalThis.document = { querySelector(selector) { return selectors[selector] || null; } };
  try {
    await import('../app.js');
    await new Promise(resolve => setImmediate(resolve));
    assert.match(app.innerHTML, /Import questions/);
    assert.match(app.innerHTML, /Paste clipboard/);
    assert.match(app.innerHTML, /Upload file/);
    const volcanoes = readFileSync(new URL('./fixtures/volcanoes-one-line.txt',import.meta.url),'utf8');
    handlers.input({target:{id:'paste-area', value:volcanoes}});
    handlers.click({target:{closest(){return {dataset:{action:'parse'}};}}});
    assert.match(app.innerHTML,/Review questions/);
    assert.match(app.innerHTML,/Showing 30 of 30 questions/);
    assert.equal((app.innerHTML.match(/class="question-card/g)||[]).length,30);
    assert.equal((app.innerHTML.match(/class="metric"/g)||[]).length,3);
    handlers.input({target:{id:'review-search',value:'zzzzzzzz'}});
    assert.match(list.innerHTML,/No matching questions/);
    handlers.input({target:{id:'review-search',value:''}});
    assert.equal((list.innerHTML.match(/class="question-card/g)||[]).length,30);
    handlers.change({target:{id:'review-filter',value:'essay'}});
    assert.equal((list.innerHTML.match(/class="question-card/g)||[]).length,5);
    handlers.click({target:{closest(){return {dataset:{tab:'export'}};}}});
    assert.match(app.innerHTML,/Export document/);
    assert.match(app.innerHTML,/Download Word document/);
    assert.match(app.innerHTML,/Print or save as PDF/);
    assert.match(app.innerHTML,/paper-content/);
  } finally {
    globalThis.document = oldDocument;
    globalThis.setTimeout = oldSetTimeout;
  }
});
