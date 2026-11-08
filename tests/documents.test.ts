// Tests des sources, citations, photos et documents (fichiers R2).
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../worker/index';
import { creerServeur } from './outils';

let s: Awaited<ReturnType<typeof creerServeur>>;
let camille: string, paul: string, intrus: string;
let arbre: string, autreArbre: string;
let joseph: string;

// Petits fichiers de test, reconnaissables à leurs premiers octets
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20, 1, 2, 3, 4]);
const PDF = new TextEncoder().encode('%PDF-1.7\n%test\n');
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML_DEGUISE = new TextEncoder().encode('<html><script>vol()</script></html>');

/** Envoie un fichier comme le fait l'appli (formulaire multipart). */
async function envoyer(treeId: string, fichier: Uint8Array, nom: string, opts: { cookie?: string; thumb?: Uint8Array; champs?: Record<string, string>; links?: unknown[] } = {}) {
  const form = new FormData();
  form.set('file', new File([fichier as BlobPart], nom, { type: 'application/octet-stream' }));
  if (opts.thumb) form.set('thumb', new File([opts.thumb as BlobPart], 'mini.webp'));
  for (const [k, v] of Object.entries(opts.champs ?? {})) form.set(k, v);
  form.set('links', JSON.stringify(opts.links ?? []));
  const res = await worker.fetch(new Request(`https://geneaview.test/api/trees/${treeId}/media`, {
    method: 'POST', body: form, headers: { cookie: opts.cookie ?? camille, origin: 'https://geneaview.test' },
  }), s.env);
  return { status: res.status, data: (await res.json()) as any };
}

/** Lit un fichier (ou sa miniature) comme le fait l'appli. */
async function lire(treeId: string, mediaId: string, quoi: 'file' | 'thumb', cookie = camille) {
  const res = await worker.fetch(new Request(`https://geneaview.test/api/trees/${treeId}/media/${mediaId}/${quoi}`, { headers: { cookie } }), s.env);
  return { status: res.status, headers: res.headers, octets: new Uint8Array(await res.arrayBuffer()) };
}

const api = (method: string, chemin: string, body?: unknown, cookie = camille, treeId = arbre) => s.appel(method, `/trees/${treeId}${chemin}`, { cookie, body });

beforeEach(async () => {
  s = await creerServeur();
  for (const u of ['camille', 'paul', 'intrus']) await s.creerCompte(u);
  [camille, paul, intrus] = await Promise.all(['camille', 'paul', 'intrus'].map((u) => s.connecter(u)));
  arbre = (await s.appel('POST', '/trees', { cookie: camille, body: { name: 'Martin' } })).data.id;
  autreArbre = (await s.appel('POST', '/trees', { cookie: intrus, body: { name: 'Autre' } })).data.id;
  s.sqlite.prepare("INSERT INTO tree_members (tree_id, user_id, role) VALUES (?, 'paul', 'viewer')").run(arbre);
  joseph = (await api('POST', '/persons', { given_names: 'Joseph' })).data.id;
});

describe('photos et documents', () => {
  it('envoi d’une photo avec miniature, rattachée à une personne', async () => {
    const r = await envoyer(arbre, WEBP, 'portrait_de_joseph.webp', { thumb: WEBP, links: [{ person_id: joseph }], champs: { date_text: 'vers 1920' } });
    expect(r.status).toBe(201);
    const m = r.data.media[0];
    expect(m).toMatchObject({ mime: 'image/webp', size: WEBP.length, title: 'portrait de joseph', date_text: 'vers 1920', has_thumb: 1 });
    expect(m.r2_key).toBeUndefined(); // l'emplacement dans R2 reste interne
    expect(r.data.media_links).toEqual([expect.objectContaining({ media_id: m.id, person_id: joseph })]);
    expect([...s.r2.objets.keys()].sort()).toEqual([`trees/${arbre}/${m.id}-mini.webp`, `trees/${arbre}/${m.id}.webp`].sort());
  });

  it('le type est lu dans le fichier lui-même : PDF accepté, SVG et HTML déguisé refusés', async () => {
    expect((await envoyer(arbre, PDF, 'acte.pdf')).data.media[0].mime).toBe('application/pdf');
    expect((await envoyer(arbre, SVG, 'joli.svg')).status).toBe(415);
    expect((await envoyer(arbre, HTML_DEGUISE, 'photo.jpg')).status).toBe(415);
    expect((await envoyer(arbre, WEBP, 'x.webp', { thumb: PDF })).status).toBe(415); // miniature : image seulement
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM media').get()).toEqual({ n: 1 });
  });

  it('refuse un fichier de plus de 15 Mo', async () => {
    const gros = new Uint8Array(15 * 1024 * 1024 + 1);
    gros.set(PDF);
    const r = await envoyer(arbre, gros, 'enorme.pdf');
    expect(r.status).toBe(413);
    expect(s.r2.objets.size).toBe(0);
  });

  it('lecture protégée : membres seulement, avec des en-têtes sûrs', async () => {
    const m = (await envoyer(arbre, WEBP, 'p.webp', { thumb: WEBP })).data.media[0];
    const r = await lire(arbre, m.id, 'file');
    expect(r.status).toBe(200);
    expect(r.octets).toEqual(WEBP);
    expect(r.headers.get('content-type')).toBe('image/webp');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('content-security-policy')).toContain('sandbox');
    expect(r.headers.get('cache-control')).toContain('private');
    expect((await lire(arbre, m.id, 'thumb', paul)).status).toBe(200); // un lecteur peut voir
    expect((await lire(arbre, m.id, 'file', intrus)).status).toBe(404); // un non-membre non
    // … même en passant par SON arbre avec l'identifiant du document
    expect((await lire(autreArbre, m.id, 'file', intrus)).status).toBe(404);
    const sansConnexion = await worker.fetch(new Request(`https://geneaview.test/api/trees/${arbre}/media/${m.id}/file`), s.env);
    expect(sansConnexion.status).toBe(401);
  });

  it('un lecteur ne peut ni envoyer, ni modifier, ni supprimer', async () => {
    const m = (await envoyer(arbre, PDF, 'acte.pdf')).data.media[0];
    expect((await envoyer(arbre, PDF, 'acte2.pdf', { cookie: paul })).status).toBe(403);
    expect((await api('PUT', `/media/${m.id}`, { title: 'x' }, paul)).status).toBe(403);
    expect((await api('DELETE', `/media/${m.id}`, undefined, paul)).status).toBe(403);
  });

  it('on ne peut pas rattacher un document à une personne d’un autre arbre', async () => {
    const etranger = (await api('POST', '/persons', { given_names: 'Étranger' }, intrus, autreArbre)).data.id;
    expect((await envoyer(arbre, PDF, 'a.pdf', { links: [{ person_id: etranger }] })).status).toBe(404);
    const m = (await envoyer(arbre, PDF, 'a.pdf')).data.media[0];
    expect((await api('POST', `/media/${m.id}/links`, { person_id: etranger })).status).toBe(404);
    expect((await api('POST', `/media/${m.id}/links`, { person_id: joseph, family_id: 'x' })).status).toBe(400);
  });

  it('un document rattaché à plusieurs fiches ; détacher ; modifier', async () => {
    const henri = (await api('POST', '/persons', { given_names: 'Henri', relation: { type: 'enfant', of: joseph } })).data.id;
    const ev = (await api('POST', '/events', { person_id: joseph, type: 'military', date_text: '1915' })).data.events[0].id;
    const m = (await envoyer(arbre, PDF, 'livret.pdf', { links: [{ person_id: joseph }] })).data.media[0];
    await api('POST', `/media/${m.id}/links`, { person_id: henri });
    const r = await api('POST', `/media/${m.id}/links`, { event_id: ev });
    expect(r.data.media_links).toHaveLength(3);
    expect((await api('POST', `/media/${m.id}/links`, { person_id: henri })).data.media_links).toHaveLength(3); // pas de doublon
    expect((await api('DELETE', `/media/${m.id}/links`, { person_id: henri })).data.media_links).toHaveLength(2);
    expect((await api('PUT', `/media/${m.id}`, { title: 'Livret militaire', date_text: '1910' })).data.media[0]).toMatchObject({ title: 'Livret militaire', date_text: '1910' });
  });

  it('photo principale : une image de cet arbre ; supprimée avec le document', async () => {
    const photo = (await envoyer(arbre, WEBP, 'p.webp', { thumb: WEBP })).data.media[0];
    const pdf = (await envoyer(arbre, PDF, 'a.pdf')).data.media[0];
    expect((await api('PUT', `/persons/${joseph}`, { photo_media_id: pdf.id })).status).toBe(400);
    expect((await api('PUT', `/persons/${joseph}`, { photo_media_id: photo.id })).data.persons[0].photo_media_id).toBe(photo.id);
    expect((await api('DELETE', `/media/${photo.id}`)).data).toEqual({ deleted: { media: [photo.id] } });
    expect(s.sqlite.prepare('SELECT photo_media_id FROM persons WHERE id = ?').get(joseph)).toEqual({ photo_media_id: null });
    expect([...s.r2.objets.keys()]).toEqual([`trees/${arbre}/${pdf.id}.pdf`]); // fichier et miniature effacés
  });

  it('le chargement de l’arbre inclut documents, rattachements, sources et citations', async () => {
    await envoyer(arbre, PDF, 'a.pdf', { links: [{ person_id: joseph }] });
    const src = (await api('POST', '/sources', { title: 'Registre', type: 'parish' })).data.sources[0];
    await api('POST', '/citations', { source_id: src.id, person_id: joseph });
    const d = (await api('GET', '/data')).data;
    expect([d.media.length, d.media_links.length, d.sources.length, d.citations.length]).toEqual([1, 1, 1, 1]);
    expect(d.media[0].r2_key).toBeUndefined();
  });
});

describe('sources et citations', () => {
  it('créer, citer, modifier, supprimer', async () => {
    const r = await api('POST', '/sources', { title: 'Acte de mariage Martin × Lefèvre', type: 'civil', reference: 'AD Cantal 4 E 15/32', reliability: 'proof', url: 'https://archives.cantal.fr/acte' });
    expect(r.status).toBe(201);
    const src = r.data.sources[0];
    expect(src).toMatchObject({ type: 'civil', reliability: 'proof' });
    const c = (await api('POST', '/citations', { source_id: src.id, person_id: joseph, detail: 'vue 87' })).data.citations[0];
    expect(c).toMatchObject({ source_id: src.id, person_id: joseph, family_id: null, event_id: null, detail: 'vue 87' });
    expect((await api('PUT', `/citations/${c.id}`, { detail: 'vue 88' })).data.citations[0].detail).toBe('vue 88');
    expect((await api('PUT', `/sources/${src.id}`, { reliability: 'clue' })).data.sources[0].reliability).toBe('clue');
    expect((await api('DELETE', `/sources/${src.id}`)).data).toEqual({ deleted: { sources: [src.id] } });
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM citations').get()).toEqual({ n: 0 }); // citations effacées avec la source
  });

  it('valide les champs et les cibles', async () => {
    expect((await api('POST', '/sources', { title: ' ' })).status).toBe(400);
    expect((await api('POST', '/sources', { title: 'X', reliability: 'certain' })).status).toBe(400);
    expect((await api('POST', '/sources', { title: 'X', url: 'javascript:alert(1)' })).status).toBe(400);
    const src = (await api('POST', '/sources', { title: 'X' })).data.sources[0];
    expect((await api('POST', '/citations', { source_id: src.id })).status).toBe(400); // aucune cible
    const etranger = (await api('POST', '/persons', { given_names: 'Étranger' }, intrus, autreArbre)).data.id;
    expect((await api('POST', '/citations', { source_id: src.id, person_id: etranger })).status).toBe(404);
    const srcEtrangere = (await api('POST', '/sources', { title: 'Y' }, intrus, autreArbre)).data.sources[0];
    expect((await api('POST', '/citations', { source_id: srcEtrangere.id, person_id: joseph })).status).toBe(404);
    expect((await api('DELETE', `/sources/${srcEtrangere.id}`)).status).toBe(404);
  });

  it('supprimer la personne efface ses citations', async () => {
    const src = (await api('POST', '/sources', { title: 'X' })).data.sources[0];
    await api('POST', '/citations', { source_id: src.id, person_id: joseph });
    await api('DELETE', `/persons/${joseph}`);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM citations').get()).toEqual({ n: 0 });
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM sources').get()).toEqual({ n: 1 }); // la source reste
  });
});

describe('sans stockage R2 (pas encore activé)', () => {
  it('l’envoi répond clairement, et supprimer un arbre fonctionne', async () => {
    (s.env as { FILES?: unknown }).FILES = undefined;
    const r = await envoyer(arbre, PDF, 'a.pdf');
    expect(r.status).toBe(503);
    expect(r.data.error).toMatch(/R2/);
    expect((await s.appel('DELETE', `/trees/${arbre}`, { cookie: camille })).status).toBe(200);
  });
});

describe('plafond de stockage (9,5 Go)', () => {
  it('refuse un envoi qui ferait dépasser le plafond, et affiche l’espace occupé', async () => {
    expect((await envoyer(arbre, WEBP, 'a.webp', { thumb: WEBP })).status).toBe(201);
    const r = await s.appel('GET', '/storage', { cookie: paul });
    expect(r.data).toEqual({ used: WEBP.length * 2, max: 9_500_000_000 });
    // Un autre arbre a presque tout rempli : le plafond est commun à tous les arbres
    s.sqlite.prepare("INSERT INTO media (id, tree_id, r2_key, mime, size) VALUES ('gros', ?, 'k', 'application/pdf', ?)").run(autreArbre, 9_500_000_000 - 50);
    const refus = await envoyer(arbre, PDF, 'b.pdf');
    expect(refus.status).toBe(507);
    expect(refus.data.error).toMatch(/plein/);
    expect(s.r2.objets.size).toBe(2); // rien n'a été écrit
  });
});
