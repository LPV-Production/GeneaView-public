// ============================================================
// Génère la paire de clés qui signe les notifications (à faire UNE seule fois).
//
//   npm run cles-push
//
// - La clé PUBLIQUE est affichée : colle-la dans wrangler.jsonc (VAPID_PUBLIC_KEY).
// - La clé PRIVÉE est écrite dans .dev.vars (pour les tests sur ton PC, jamais envoyé sur GitHub)
//   et la commande pour l'envoyer à Cloudflare en tant que secret est affichée.
// Changer de clés plus tard oblige à réactiver les notifications sur chaque téléphone.
// ============================================================
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = privateKey.export({ format: 'jwk' });
const pub = publicKey.export({ format: 'jwk' });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]).toString('base64url');
const privateJson = JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d });

if (existsSync('.dev.vars') && readFileSync('.dev.vars', 'utf8').includes('VAPID_PRIVATE_KEY')) {
  console.error('✗ Des clés existent déjà dans .dev.vars. Supprime ce fichier si tu veux vraiment en créer de nouvelles.');
  process.exit(1);
}
writeFileSync('.dev.vars', `# Secrets pour les tests sur ce PC (jamais envoyé sur GitHub)\nVAPID_PRIVATE_KEY='${privateJson}'\nVAPID_PUBLIC_KEY=${raw}\n`, { flag: 'a' });

console.log('\n1) Clé publique — à coller dans wrangler.jsonc, ligne "VAPID_PUBLIC_KEY" :\n');
console.log(`   ${raw}\n`);
console.log('2) Clé privée — enregistrée dans .dev.vars. Pour l’envoyer à Cloudflare (une fois en ligne) :\n');
console.log('   npx wrangler secret put VAPID_PRIVATE_KEY');
console.log('   puis colle cette valeur quand c’est demandé :\n');
console.log(`   ${privateJson}\n`);
