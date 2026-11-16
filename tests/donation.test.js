import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DONATION_URL,validDonationUrl,GCASH_QR_PATH,validGcashQrPath,gcashQrUrl,hasBundledGcashQr} from '../lib/donation.js';

test('optional support is unconfigured by default',()=>{
  assert.equal(DONATION_URL,'');
  assert.equal(validDonationUrl(DONATION_URL),null);
});
test('only explicit HTTPS donation URLs can open',()=>{
  assert.equal(validDonationUrl('javascript:alert(1)'),null);
  assert.equal(validDonationUrl('http://example.com'),null);
  assert.equal(validDonationUrl('https://user:pass@example.com'),null);
  assert.equal(validDonationUrl('https://example.com/donate'),'https://example.com/donate');
});
test('support entry is optional and in user-invoked dialog',()=>{
  const s=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.match(s,/data-action=\"supportProject\"/);
  assert.match(s,/data-action=\"closeSupport\"/);
  assert.match(s,/Every feature stays free/);
  assert.doesNotMatch(s,/setInterval\([^)]*donat/i);
});

test('startup support is opt-out, never opens a donation URL automatically',()=>{
  const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.match(js,/function maybeShowSupportOnOpen\(/);
  assert.match(js,/supportAutoShownThisOpen/);
  assert.match(js,/questionforgeSupportNeverShow/);
  assert.match(js,/data-action="disableSupportAuto"/);
  assert.match(js,/data-action="closeSupport"/);
  assert.match(js,/if\(!gcashQrReady\)return;/);
  assert.match(js,/await maybeShowSupportOnOpen\(\)/);
});
test('footer is a fixed shell sibling of scrolling content with responsive columns',()=>{
  const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(js,/<div class="scroll-area">\$\{content\}<\/div><footer class="footer"/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
  assert.match(css,/\.footer-version/);
  assert.match(css,/\.footer-local/);
});

test('GCash uses a fixed bundled PNG, never a remote QR or payment link',()=>{
  assert.equal(GCASH_QR_PATH,'assets/gcash-receive-qr.png');
  assert.equal(validGcashQrPath(GCASH_QR_PATH),GCASH_QR_PATH);
  assert.equal(validGcashQrPath('https://example.com/qr.png'),null);
  assert.equal(validGcashQrPath('data:image/png;base64,abc'),null);
  assert.equal(gcashQrUrl(path=>`chrome-extension://extension-id/${path}`),'chrome-extension://extension-id/assets/gcash-receive-qr.png');
});
test('GCash PNG detection requires a valid image asset',async()=>{
  const png = Uint8Array.from([137,80,78,71,13,10,26,10,...Array(60).fill(0)]);
  assert.equal(await hasBundledGcashQr(async()=>({ok:true,arrayBuffer:async()=>png.buffer}),'chrome-extension://id/qr'),true);
  assert.equal(await hasBundledGcashQr(async()=>({ok:false}),'chrome-extension://id/missing'),false);
  assert.equal(await hasBundledGcashQr(async()=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode('not an image').buffer}),'chrome-extension://id/bad'),false);
});
test('GCash dialog shows a QR only when configured and never autostarts a transaction',()=>{
  const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.match(js,/GCash · Scan to support/);
  assert.match(js,/data-action="saveGcashQr"/);
  assert.match(js,/gcashQrReady\?/);
  assert.match(js,/hasBundledGcashQr/);
  assert.match(js,/Donating is optional/);
});
