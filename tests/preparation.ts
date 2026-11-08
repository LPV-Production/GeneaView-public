// Cloudflare fournit crypto.subtle.timingSafeEqual (comparaison à temps constant) ; Node non.
// On l'ajoute pour les tests, avec le même comportement.
import { timingSafeEqual } from 'node:crypto';

const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (a: ArrayBufferView, b: ArrayBufferView) => boolean };
if (!subtle.timingSafeEqual) {
  subtle.timingSafeEqual = (a, b) =>
    timingSafeEqual(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
}
