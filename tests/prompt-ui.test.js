import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
test('prompt tab is integrated with import, review and export',()=>{
  assert.match(app,/\['prompt','00','Prompt'\]/);
  assert.match(app,/Build your exam prompt/);
  assert.match(app,/Copy coverage prompt/);
  assert.match(app,/Copy exam prompt/);
  assert.match(app,/Fix an existing ChatGPT exam/);
  assert.match(app,/data-action="copyRepair"/);
  assert.match(app,/data-tab="prompt"/);
});
test('prompt builder offers all requested source materials, question type splits, topic counts and learning skills',()=>{
  assert.match(app,/data-prompt-count/);
  assert.match(app,/data-topic-field/);
  assert.match(app,/Learning objectives/);
  assert.match(app,/Plain text \(less reliable\)/);
  assert.match(app,/Structured JSON \(recommended\)/);
  assert.match(css,/\.prompt-preview pre/);
});
