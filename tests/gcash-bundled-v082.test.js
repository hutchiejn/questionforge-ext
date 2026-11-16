import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GCASH_QR_PATH,GCASH_CARD_PATH,gcashCardUrl,hasBundledGcashQr} from '../lib/donation.js';

const file=(path)=>readFileSync(new URL('../'+path,import.meta.url));
for(const [asset,check] of [[GCASH_QR_PATH,'assets/gcash-receive-qr.sha256'],[GCASH_CARD_PATH,'assets/gcash-receive-card.sha256']]) {
  test('bundled GCash asset matches checksum: '+asset, async()=>{
    const bytes=file(asset);
    const hash=file(check).toString('utf8').trim();
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
    assert.equal(await hasBundledGcashQr(async()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}),'chrome-extension://id/'+asset,hash),true);
    assert.equal(await hasBundledGcashQr(async()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}),'chrome-extension://id/'+asset,'0'.repeat(64)),false);
  });
}
test('full card source remains local and path-restricted',()=>{
  assert.equal(gcashCardUrl((p)=>'chrome-extension://abc/'+p),'chrome-extension://abc/'+GCASH_CARD_PATH);
  assert.equal(gcashCardUrl((p)=>p,'https://untrusted.example/qr.png'),null);
});
test('donation dialog only displays verified local images without transaction handling',()=>{
  const js=file('app.js').toString('utf8');
  assert.match(js,/if\(gcashQrReady\)/);
  assert.match(js,/gcashCardReady\?/);
  assert.match(js,/saveGcashCard/);
  assert.match(js,/questionforgeSupportNeverShow/);
  assert.doesNotMatch(js,/api\.gcash\.com|paymentIntent|checkout\.stripe\.com/i);
});
