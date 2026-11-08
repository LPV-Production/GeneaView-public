// ============================================================
// Envoi des notifications "Web Push" (norme du web, utilisée par Chrome,
// Safari/iPhone, Firefox…), sans aucun service externe en plus.
// - VAPID (RFC 8292) : le serveur signe chaque envoi avec sa clé privée.
// - Chiffrement aes128gcm (RFC 8291) : seul le téléphone peut lire le contenu.
// ============================================================

export interface PushKeys {
  VAPID_PUBLIC_KEY: string; // clé publique (base64url, 65 octets)
  VAPID_PRIVATE_KEY: string; // clé privée au format JWK (secret Cloudflare)
  VAPID_SUBJECT?: string; // contact pour les services de notification (adresse du site)
}

export interface Subscription {
  endpoint: string;
  p256dh: string; // clé publique du téléphone (base64url)
  auth: string; // secret du téléphone (base64url)
}

const enc = new TextEncoder();

export const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** Jeton VAPID signé (ES256), valable 12 h, pour le service de notification visé. */
async function vapidAuth(endpoint: string, keys: PushKeys, origin: string) {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: keys.VAPID_SUBJECT || origin,
  })));
  const key = await crypto.subtle.importKey('jwk', JSON.parse(keys.VAPID_PRIVATE_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.VAPID_PUBLIC_KEY}`;
}

/** Chiffre le message pour un téléphone précis (RFC 8291, un seul bloc). */
export async function encryptPayload(sub: Subscription, payload: string) {
  const uaPublic = unb64url(sub.p256dh);
  const authSecret = unb64url(sub.auth);

  // Clé éphémère du serveur + secret partagé avec le téléphone (ECDH)
  const asKeys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', asKeys.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, asKeys.privateKey, 256));

  // Dérivation des clés (HKDF-SHA256, écrit à la main pour suivre la RFC pas à pas)
  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1]));
  const ikm = await hmac(prkKey, keyInfo);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  // Contenu + délimiteur de dernier bloc (0x02), chiffré en AES-128-GCM
  const plain = concat(enc.encode(payload), new Uint8Array([2]));
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, plain));

  // En-tête : sel (16) | taille de bloc (4) | longueur de clé (1) | clé publique serveur (65)
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

/** Envoie une notification. Renvoie "gone" si le téléphone s'est désabonné (à supprimer). */
export async function sendPush(sub: Subscription, payload: object, keys: PushKeys, origin: string): Promise<'ok' | 'gone' | 'error'> {
  const body = await encryptPayload(sub, JSON.stringify(payload));
  let res: Response;
  try {
    res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        authorization: await vapidAuth(sub.endpoint, keys, origin),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: String(24 * 3600),
        urgency: 'normal',
      },
      body,
    });
  } catch (e) {
    // Coupure réseau : on n'interrompt pas l'envoi aux autres appareils
    console.error('Service de notification injoignable', e);
    return 'error';
  }
  if (res.status === 404 || res.status === 410) return 'gone';
  if (!res.ok) {
    console.error('Échec notification', res.status, await res.text().catch(() => ''));
    return 'error';
  }
  return 'ok';
}
