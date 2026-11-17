import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const file=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('The current brand mark is the QF glyph, without previous page fold or arrow',()=>{
 for(const theme of ['dark','light']){
  const svg=file(`assets/brand-mark-${theme}.svg`);
  assert.match(svg,/QuestionForge QF monogram/);
  assert.doesNotMatch(svg,/question mark with emerald arrow|vault-door|folded page|document and question/);
  assert.match(svg,/#10A37F/);
  const word=file(`assets/brand-wordmark-${theme}.svg`);
  assert.match(word,/<tspan[^>]+>Forge<\/tspan>/);
 }
});
test('Chrome icons all use the updated size-specific PNG files',()=>{
 const m=JSON.parse(file('manifest.json'));
 assert.equal(m.version,JSON.parse(file('package.json')).version);
 for(const [s,p] of Object.entries(m.icons)){
  const b=fs.readFileSync(new URL('../'+p,import.meta.url));
  assert.equal(b.readUInt32BE(16),Number(s));
  assert.equal(b.readUInt32BE(20),Number(s));
 }
});
