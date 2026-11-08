// Fabrique les icônes de l'appli (écran d'accueil du téléphone) à partir d'un dessin SVG.
// À relancer seulement si on change le logo :  npm run icones
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

// Petit arbre généalogique blanc sur fond vert forêt, centré avec de la marge
// (Android découpe parfois l'icône en rond)
const dessin = (trait = '#fff') => `
  <g transform="translate(136 136) scale(10)" fill="none" stroke="${trait}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/>
    <path d="M12 8v4M6 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/>
  </g>`;
const svg = (fond = true) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${fond ? '<rect width="512" height="512" fill="#2f6b4f"/>' : ''}
  ${dessin()}
</svg>`);

await sharp(svg()).resize(512, 512).png().toFile('public/icons/icon-512.png');
await sharp(svg()).resize(192, 192).png().toFile('public/icons/icon-192.png');
await sharp(svg()).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
// Petite icône monochrome pour la barre de notifications Android
await sharp(svg(false)).resize(96, 96).png().toFile('public/icons/badge-96.png');
// Icône de l'onglet du navigateur
writeFileSync('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#2f6b4f"/>${dessin()}</svg>\n`);
console.log('✓ Icônes créées dans public/icons/ (+ public/favicon.svg)');
