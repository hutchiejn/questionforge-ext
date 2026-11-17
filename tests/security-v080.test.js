import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {renderPaper, printPDF} from '../lib/print-export.js';
import {DEFAULT_SETTINGS,newQuestion} from '../lib/model.js';
import {inflateBounded,readZipEntries} from '../lib/ooxml-zip.js';
import {normalizePrivacy,shouldRestoreDraft,isFreshCapture} from '../lib/privacy.js';
import {hasBundledGcashQr} from '../lib/donation.js';

const read=(name)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('explicit MV3 policy blocks remote code, frames, objects and unapproved network access',()=>{
 const manifest=JSON.parse(read('manifest.json'));
 assert.equal(manifest.version,JSON.parse(read('package.json')).version);
 assert.deepEqual(manifest.permissions,['sidePanel','contextMenus','storage']);
 const policy=manifest.content_security_policy.extension_pages;
 for(const directive of ["script-src 'self'", "connect-src 'self'", "object-src 'none'", "frame-ancestors 'none'"])
   assert.ok(policy.includes(directive),`Missing ${directive}`);
 assert.ok(!policy.includes('unsafe-eval'));
 assert.ok(!policy.includes('https:'));
});

test('HTML/CSS from custom document fields stays text, not executable markup',()=>{
 const q=newQuestion('identification');q.text='<img src=x onerror=alert(1)> What is 2 + 2?';q.answer='<script>window.hacked=true</script>';
 const settings={...DEFAULT_SETTINGS,title:'</title><script>bad()</script>',headerCenter:'</style><script>bad()</script>',footerRight:'" } body{display:none} /*'};
 const result=renderPaper([q],settings);
 assert.match(result.markup,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(result.markup,/&lt;script&gt;window.hacked=true&lt;\/script&gt;/);
 assert.doesNotMatch(result.css,/<script>/);
 assert.match(result.css,/\\3c /); // CSS escaped opening tag
 assert.doesNotMatch(read('lib/print-export.js'),/document\.write\(/);
});

test('printPDF constructs DOM elements and never sends CSS to HTML parser',()=>{
 const originalWindow=globalThis.window,originalTimer=globalThis.setTimeout;
 const elements=[];
 const doc={
   createElement(name){const node={name,textContent:'',innerHTML:'',setAttribute(){}};elements.push(node);return node;},
   head:{replaceChildren(...nodes){this.children=nodes;}},body:{replaceChildren(...nodes){this.children=nodes;}},
 };
 let focused=false;
 globalThis.window={open(){return {document:doc,focus(){focused=true;},print(){}}}};
 globalThis.setTimeout=()=>1;
 try{
   const q=newQuestion('identification');q.text='</style><script>attack()</script>';
   printPDF([q],{...DEFAULT_SETTINGS,headerCenter:'</style><script>attack()</script>'});
   assert.equal(focused,true);
   assert.equal(doc.head.children[2].name,'style');
   assert.ok(doc.head.children[2].textContent.includes('\\3c '));
   assert.ok(doc.body.children[0].innerHTML.includes('&lt;script&gt;attack()&lt;/script&gt;'));
 }finally{globalThis.window=originalWindow;globalThis.setTimeout=originalTimer;}
});

test('bounded deflate refuses output larger than the declared size',async()=>{
 const payload=new TextEncoder().encode('a'.repeat(4096));
 const compressed=deflateRawSync(payload);
 await assert.rejects(inflateBounded(compressed,'deflate-raw',1024),/Decompression safety limit/);
 const restored=await inflateBounded(compressed,'deflate-raw',4096);
 assert.equal(restored.length,4096);
});

test('oversized ZIP input is rejected before parsing',async()=>{
 const bytes=new Uint8Array(8*1024*1024+1);
 await assert.rejects(readZipEntries(bytes.buffer,new Set(['word/document.xml'])),/8 MB/);
});

test('private session and expiration avoid recovering old sensitive drafts',()=>{
 const old={savedAt:Date.now()-45*86400000,questions:[{answer:'secret'}]};
 assert.equal(shouldRestoreDraft(old,{draftSaving:true,retentionDays:30}),false);
 assert.equal(shouldRestoreDraft(old,{draftSaving:true,retentionDays:90}),true);
 assert.equal(shouldRestoreDraft(old,{draftSaving:false,retentionDays:0}),false);
 assert.deepEqual(normalizePrivacy({draftSaving:false,retentionDays:999}),{draftSaving:false,retentionDays:30,shareWarning:true});
 assert.equal(isFreshCapture({text:'draft',createdAt:Date.now()-20*60*1000}),false);
});

test('privacy controls and ephemeral capture are wired into app',()=>{
 const app=read('app.js'),background=read('background.js');
 assert.match(app,/data-action="openPrivacy"/);
 assert.match(app,/data-action="deleteAllLocalData"/);
 assert.match(app,/privacy-autosave/);
 assert.match(app,/questionforgePrivacy/);
 assert.match(app,/confirmShareSource/);
 assert.match(background,/chrome\.storage\.session\.set/);
 assert.match(background,/setAccessLevel/);
 assert.match(app,/chrome\.storage\.session\?\.clear/);
});

test('GCash QR checksum is verified when configured',async()=>{
 const data=Uint8Array.from([137,80,78,71,13,10,26,10,...Array(32).fill(1)]);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
 const fetcher=async()=>({ok:true,arrayBuffer:async()=>data.buffer});
 assert.equal(await hasBundledGcashQr(fetcher,'chrome-extension://test/qr',hash),true);
 assert.equal(await hasBundledGcashQr(fetcher,'chrome-extension://test/qr','f'.repeat(64)),false);
});
