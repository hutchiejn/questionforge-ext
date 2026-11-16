import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=new URL('../',import.meta.url);
const read=(p)=>fs.readFileSync(new URL(p,root));
test('All manifest icon paths exist and match PNG signatures',()=>{
 const manifest=JSON.parse(read('manifest.json'));
 for(const [size,file] of Object.entries(manifest.icons)){
  const bytes=read(file);assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16),Number(size));assert.equal(bytes.readUInt32BE(20),Number(size));
 }
});
test('Both logo themes are local vector assets used in UI header',()=>{
 const app=read('app.js').toString('utf8');
 for(const theme of ['light','dark']){
  for(const type of ['mark','wordmark']){
    const p=`assets/brand-${type}-${theme}.svg`;assert.ok(read(p).toString().includes('<svg'));
  }
 }
 assert.match(app,/brand-mark-\$\{theme\}\.svg/);assert.match(app,/brand-wordmark-\$\{theme\}\.svg/);
});
