// ============================================================
// Préparation des fichiers AVANT l'envoi, dans le navigateur :
//  - photos : réduites à 1 600 px de côté maximum, en WebP (≈ 200 à 500 Ko),
//    plus une miniature de 300 px pour les galeries ;
//  - PDF : envoyés tels quels.
// Ainsi les 10 Go gratuits de R2 suffisent pour des milliers de documents.
// ============================================================

export const TAILLE_MAX = 15 * 1024 * 1024; // 15 Mo, comme le serveur
const COTE_MAX = 1600;
const COTE_MINIATURE = 300;

export type FichierPret = { fichier: Blob; nom: string; miniature: Blob | null; titre: string };

/** Titre proposé à partir du nom du fichier : « acte_mariage-1919.pdf » → « acte mariage 1919 ». */
export const titreDepuisNom = (nom: string) => nom.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Redessine une image à une taille maximale et la convertit (WebP si possible, sinon JPEG). */
async function reduire(source: ImageBitmap, cote: number, qualite: number): Promise<Blob> {
  const ratio = Math.min(1, cote / Math.max(source.width, source.height));
  const l = Math.max(1, Math.round(source.width * ratio));
  const h = Math.max(1, Math.round(source.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = l;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, l, h);
  const enBlob = (type: string) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, qualite));
  // Certains navigateurs (Safari) ne savent pas produire de WebP : ils renvoient du PNG, trop lourd → JPEG
  const webp = await enBlob('image/webp');
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await enBlob('image/jpeg');
  if (!jpeg) throw new Error('Impossible de préparer cette photo');
  return jpeg;
}

/**
 * Prépare un fichier choisi par l'utilisateur. Lève une erreur en français si le
 * fichier n'est pas accepté (type, taille).
 */
export async function preparerFichier(f: File): Promise<FichierPret> {
  const titre = titreDepuisNom(f.name);
  const estPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  if (estPdf) {
    if (f.size > TAILLE_MAX) throw new Error(`« ${f.name} » dépasse 15 Mo`);
    return { fichier: f, nom: f.name, miniature: null, titre };
  }
  if (!f.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(f.name)) {
    throw new Error(`« ${f.name} » : seules les photos et les PDF sont acceptés`);
  }
  let image: ImageBitmap;
  try {
    // « from-image » : respecte l'orientation des photos de téléphone
    image = await createImageBitmap(f, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`« ${f.name} » : format de photo non lu par ce navigateur`);
  }
  try {
    const fichier = await reduire(image, COTE_MAX, 0.82);
    const miniature = await reduire(image, COTE_MINIATURE, 0.75);
    if (fichier.size > TAILLE_MAX) throw new Error(`« ${f.name} » reste trop lourd après réduction`);
    const ext = fichier.type === 'image/webp' ? 'webp' : 'jpg';
    return { fichier, nom: `${titre || 'photo'}.${ext}`, miniature, titre };
  } finally {
    image.close();
  }
}

/** « 1,2 Mo », « 340 Ko » */
export function taille(octets: number) {
  if (octets >= 1024 * 1024) return `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  return `${Math.max(1, Math.round(octets / 1024))} Ko`;
}
