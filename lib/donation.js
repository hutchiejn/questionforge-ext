/** QuestionForge donation configuration.
 * A real GCash *Receive Money* QR image can be installed locally with
 * `python configure_gcash_qr.py path/to/your-receiving-qr.png`.
 * It is packaged as a static extension asset. QuestionForge never creates
 * a payment request, handles transactions, or sends user data to GCash.
 * Leave it absent to disable automatic donation reminders.
 */
export const GCASH_QR_PATH = 'assets/gcash-receive-qr.png';
export const GCASH_HASH_PATH = 'assets/gcash-receive-qr.sha256';
export const GCASH_CARD_PATH = 'assets/gcash-receive-card.png';
export const GCASH_CARD_HASH_PATH = 'assets/gcash-receive-card.sha256';

/** Legacy optional HTTPS fallback, unused in the GCash donation UI. */
export const DONATION_URL = '';

export function validDonationUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) return null;
    return url.href;
  } catch { return null; }
}

/** Allow only the known extension image path, never a remote or data URI. */
export function validGcashQrPath(raw) {
  return raw === GCASH_QR_PATH ? raw : null;
}

export function gcashCardUrl(getURL, path=GCASH_CARD_PATH) {
  if (path !== GCASH_CARD_PATH) return null;
  return typeof getURL === 'function' ? getURL(path) : path;
}

export function gcashQrUrl(getURL, path = GCASH_QR_PATH) {
  if (!validGcashQrPath(path)) return null;
  return typeof getURL === 'function' ? getURL(path) : path;
}

/** Confirm that a real PNG was bundled. A non-existent image must not
 * trigger a donation reminder or appear as a broken QR.
 */
export async function hasBundledGcashQr(fetcher, url, expectedHash=null) {
  if (typeof fetcher !== 'function' || !url) return false;
  try {
    const response = await fetcher(url, {cache:'no-store'});
    if (!response.ok) return false;
    const header = new Uint8Array(await response.arrayBuffer());
    if (header.length < 32 || header.length > 2_000_000) return false;
    const png = [137,80,78,71,13,10,26,10];
    if(!png.every((byte,i)=>header[i] === byte))return false;
    if(expectedHash){
      if(!/^[a-f0-9]{64}$/i.test(expectedHash))return false;
      const digest=await crypto.subtle.digest('SHA-256',header);
      const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      return hash.toLowerCase()===expectedHash.toLowerCase();
    }
    return true;
  } catch { return false; }
}
