// ============================================================
// Sources, citations, photos et documents d'un arbre.
//
//   /api/trees/<arbre>/sources[/<id>]            sources (actes, registres, sites…)
//   /api/trees/<arbre>/citations[/<id>]          lien source ↔ personne, union ou événement
//   /api/trees/<arbre>/media                     envoi d'une photo ou d'un PDF
//   /api/trees/<arbre>/media/<id>/file | thumb   lecture du fichier (et de sa miniature)
//   /api/trees/<arbre>/media/<id>[/links]        titre, date… et rattachements
//
// Les fichiers sont rangés dans R2 sous « trees/<arbre>/… » et ne sont JAMAIS
// publics : on ne les obtient qu'ici, après le contrôle d'accès à l'arbre
// (fait dans arbres.ts). Un identifiant d'un autre arbre donne « introuvable ».
// ============================================================
import { clean, HttpError, json, readBody, setClause, type FieldType } from './http';
import { sansArbre } from './donnees';
import { documentVisiblePourLecteur } from './masquage';
import type { Role } from './acces';
import type { Ctx } from './index';

type Ligne = Record<string, unknown>;

export const TAILLE_MAX = 15 * 1024 * 1024; // 15 Mo par fichier
const TAILLE_MAX_MINIATURE = 1024 * 1024;
/** Plafond de tout le stockage R2 : l'offre gratuite s'arrête à 10 Go, on garde 0,5 Go de marge. */
export const ESPACE_MAX = 9_500_000_000;

/** Octets occupés dans R2 par tous les arbres (fichiers + miniatures). */
export async function espaceUtilise(db: D1Database): Promise<number> {
  return (await db.prepare('SELECT COALESCE(SUM(size + thumb_size), 0) AS n FROM media').first<{ n: number }>())?.n ?? 0;
}

const SOURCE_FIELDS: Record<string, FieldType> = {
  title: 'text',
  type: ['civil', 'parish', 'census', 'website', 'book', 'testimony', 'other'],
  url: 'url',
  reference: 'text',
  reliability: ['proof', 'clue', 'hypothesis'],
  notes: 'longtext',
};
const MEDIA_FIELDS: Record<string, FieldType> = { title: 'text', date_text: 'text', description: 'longtext' };
const CIBLES = ['person_id', 'family_id', 'event_id'] as const;
const TABLE_CIBLE = { person_id: 'persons', family_id: 'families', event_id: 'events' } as const;

/** Vérifie qu'une ligne existe dans CET arbre. */
async function dansArbre(db: D1Database, table: string, id: unknown, treeId: string, libelle: string) {
  const row = typeof id === 'string' && id.length <= 64
    ? await db.prepare(`SELECT * FROM ${table} WHERE id = ? AND tree_id = ?`).bind(id, treeId).first<Ligne>()
    : null;
  if (!row) throw new HttpError(404, `${libelle} introuvable`);
  return row;
}

/** Lit la cible d'une citation ou d'un rattachement : exactement UNE personne, union ou événement de cet arbre. */
async function lireCible(db: D1Database, treeId: string, o: Record<string, unknown>) {
  const presentes = CIBLES.filter((c) => o[c]);
  if (presentes.length !== 1) throw new HttpError(400, 'Indiquez une personne, une union OU un événement');
  const champ = presentes[0];
  await dansArbre(db, TABLE_CIBLE[champ], o[champ], treeId, 'Élément à relier');
  return { champ, id: o[champ] as string };
}

/**
 * Type RÉEL d'un fichier, d'après ses premiers octets (on ne se fie pas au nom ni au type annoncé).
 * Seuls les PDF et les images JPEG, PNG, WebP sont acceptés : pas de SVG ni de HTML, qui
 * pourraient contenir du code.
 */
export function typeReel(b: Uint8Array): { mime: string; ext: string } | null {
  const debut = (...octets: number[]) => octets.every((o, i) => b[i] === o);
  if (debut(0x25, 0x50, 0x44, 0x46, 0x2d)) return { mime: 'application/pdf', ext: 'pdf' };
  if (debut(0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', ext: 'jpg' };
  if (debut(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: 'image/png', ext: 'png' };
  if (debut(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/** Ce que l'appli reçoit pour un document (sans les clés internes de R2). */
export const mediaPourAppli = ({ r2_key, thumb_key, tree_id, ...m }: Ligne) => ({ ...m, has_thumb: thumb_key ? 1 : 0 });

async function paquetMedia(db: D1Database, mediaId: string) {
  const [m, l] = await db.batch([
    db.prepare('SELECT * FROM media WHERE id = ?').bind(mediaId),
    db.prepare('SELECT * FROM media_links WHERE media_id = ?').bind(mediaId),
  ]);
  return { media: (m.results as Ligne[]).map(mediaPourAppli), media_links: sansArbre(l.results as Ligne[]), refreshed: { media: [mediaId] } };
}

export async function routeDocuments({ req, env, db, user, method }: Ctx, treeId: string, seg: string[], role: Role = 'viewer'): Promise<Response> {
  const [quoi, id, sous] = seg;

  // ---------------- Sources ----------------
  if (quoi === 'sources') {
    if (!id && method === 'POST') {
      const data = clean(await readBody(req), SOURCE_FIELDS, true);
      if (!String(data.title ?? '').trim()) throw new HttpError(400, 'Le titre de la source est obligatoire');
      const cols = Object.keys(data);
      const row = await db
        .prepare(`INSERT INTO sources (id, tree_id${cols.map((c) => ', ' + c).join('')}) VALUES (?, ?${cols.map(() => ', ?').join('')}) RETURNING *`)
        .bind(crypto.randomUUID(), treeId, ...Object.values(data))
        .first<Ligne>();
      return json({ sources: sansArbre([row!]) }, 201);
    }
    if (id && method === 'PUT') {
      await dansArbre(db, 'sources', id, treeId, 'Source');
      const data = clean(await readBody(req), SOURCE_FIELDS, true);
      if (data.title === '') throw new HttpError(400, 'Le titre de la source est obligatoire');
      if (!Object.keys(data).length) throw new HttpError(400, 'Rien à modifier');
      const set = setClause({ ...data, updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
      const row = await db.prepare(`UPDATE sources SET ${set.sql} WHERE id = ? RETURNING *`).bind(...set.values, id).first<Ligne>();
      return json({ sources: sansArbre([row!]) });
    }
    if (id && method === 'DELETE') {
      await dansArbre(db, 'sources', id, treeId, 'Source');
      await db.prepare('DELETE FROM sources WHERE id = ?').bind(id).run(); // ses citations suivent
      return json({ deleted: { sources: [id] } });
    }
  }

  // ---------------- Citations ----------------
  if (quoi === 'citations') {
    if (!id && method === 'POST') {
      const body = await readBody(req);
      await dansArbre(db, 'sources', body.source_id, treeId, 'Source');
      const cible = await lireCible(db, treeId, body);
      const { detail } = clean(body, { detail: 'text' }, true);
      const row = await db
        .prepare(`INSERT INTO citations (id, tree_id, source_id, ${cible.champ}, detail) VALUES (?, ?, ?, ?, ?) RETURNING *`)
        .bind(crypto.randomUUID(), treeId, body.source_id, cible.id, detail ?? '')
        .first<Ligne>();
      return json({ citations: sansArbre([row!]) }, 201);
    }
    if (id && method === 'PUT') {
      await dansArbre(db, 'citations', id, treeId, 'Citation');
      const { detail } = clean(await readBody(req), { detail: 'text' }, false);
      const row = await db.prepare('UPDATE citations SET detail = ? WHERE id = ? RETURNING *').bind(detail, id).first<Ligne>();
      return json({ citations: sansArbre([row!]) });
    }
    if (id && method === 'DELETE') {
      await dansArbre(db, 'citations', id, treeId, 'Citation');
      await db.prepare('DELETE FROM citations WHERE id = ?').bind(id).run();
      return json({ deleted: { citations: [id] } });
    }
  }

  // ---------------- Photos et documents ----------------
  if (quoi === 'media') {
    const fichiers = env.FILES;
    if (!fichiers) throw new HttpError(503, 'Le stockage des photos et documents (Cloudflare R2) n’est pas encore activé. Voir TUTO.md, étape 2.4.');
    // Envoi : formulaire « multipart » avec le fichier, sa miniature éventuelle, et les infos
    if (!id && method === 'POST') {
      if (!(req.headers.get('content-type') ?? '').includes('multipart/form-data')) throw new HttpError(415, 'Format attendu : formulaire avec fichier');
      if (Number(req.headers.get('content-length') ?? 0) > TAILLE_MAX + TAILLE_MAX_MINIATURE + 100_000) throw new HttpError(413, 'Fichier trop lourd (15 Mo maximum)');
      const form = await req.formData();
      const fichier = form.get('file');
      if (!fichier || typeof fichier === 'string') throw new HttpError(400, 'Aucun fichier reçu');
      if (fichier.size > TAILLE_MAX) throw new HttpError(413, 'Fichier trop lourd (15 Mo maximum)');
      if (!fichier.size) throw new HttpError(400, 'Fichier vide');
      const octets = new Uint8Array(await fichier.arrayBuffer());
      const type = typeReel(octets);
      if (!type) throw new HttpError(415, 'Type de fichier refusé : seules les photos (JPEG, PNG, WebP) et les PDF sont acceptés');

      // Miniature (préparée par l'appli) : une image légère, facultative
      const mini = form.get('thumb');
      let miniOctets: Uint8Array | null = null, miniType: ReturnType<typeof typeReel> = null;
      if (mini && typeof mini !== 'string' && mini.size) {
        if (mini.size > TAILLE_MAX_MINIATURE) throw new HttpError(413, 'Miniature trop lourde');
        miniOctets = new Uint8Array(await mini.arrayBuffer());
        miniType = typeReel(miniOctets);
        if (!miniType || !miniType.mime.startsWith('image/')) throw new HttpError(415, 'Miniature invalide');
      }

      // Jamais plus de 9,5 Go au total : au-delà, Cloudflare facturerait
      const ajout = octets.length + (miniOctets?.length ?? 0);
      if ((await espaceUtilise(db)) + ajout > ESPACE_MAX) {
        throw new HttpError(507, 'Espace de stockage plein (9,5 Go). Supprimez des photos ou documents pour en ajouter d’autres.');
      }

      const infos = clean(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')), MEDIA_FIELDS, true);
      let liens: Record<string, unknown>[] = [];
      try { liens = JSON.parse(String(form.get('links') ?? '[]')); } catch { throw new HttpError(400, 'Rattachements illisibles'); }
      if (!Array.isArray(liens) || liens.length > 20) throw new HttpError(400, 'Rattachements invalides');
      const cibles = [];
      for (const l of liens) cibles.push(await lireCible(db, treeId, l ?? {}));

      const mediaId = crypto.randomUUID();
      const cle = `trees/${treeId}/${mediaId}.${type.ext}`;
      const cleMini = miniType ? `trees/${treeId}/${mediaId}-mini.${miniType.ext}` : null;
      const nomFichier = fichier.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 120);

      // Les fichiers d'abord ; si l'enregistrement échoue ensuite, on les efface (pas de fichier orphelin)
      await fichiers.put(cle, octets, { httpMetadata: { contentType: type.mime } });
      if (cleMini) await fichiers.put(cleMini, miniOctets!, { httpMetadata: { contentType: miniType!.mime } });
      try {
        await db.batch([
          db.prepare('INSERT INTO media (id, tree_id, r2_key, thumb_key, mime, size, thumb_size, title, date_text, description, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(mediaId, treeId, cle, cleMini, type.mime, octets.length, miniOctets?.length ?? 0, infos.title || nomFichier, infos.date_text ?? '', infos.description ?? '', user.id),
          ...cibles.map((c) => db.prepare(`INSERT INTO media_links (media_id, tree_id, ${c.champ}) VALUES (?, ?, ?)`).bind(mediaId, treeId, c.id)),
        ]);
      } catch (e) {
        await fichiers.delete([cle, ...(cleMini ? [cleMini] : [])]);
        throw e;
      }
      return json(await paquetMedia(db, mediaId), 201);
    }

    if (id) {
      const m = await dansArbre(db, 'media', id, treeId, 'Document');

      // Lecture du fichier ou de sa miniature (lecteurs compris)
      if ((sous === 'file' || sous === 'thumb') && method === 'GET') {
        // Lecteur : pas de document rattaché à une personne vivante
        if (role === 'viewer' && !(await documentVisiblePourLecteur(db, id))) throw new HttpError(404, 'Document introuvable');
        const cle = sous === 'thumb' ? ((m.thumb_key as string | null) ?? (m.r2_key as string)) : (m.r2_key as string);
        const objet = await fichiers.get(cle);
        if (!objet) throw new HttpError(404, 'Fichier introuvable');
        const mime = objet.httpMetadata?.contentType ?? (m.mime as string);
        const nom = `${String(m.title || 'document').replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 80) || 'document'}.${cle.split('.').pop()}`;
        const headers: Record<string, string> = {
          'content-type': mime,
          'content-length': String(objet.size),
          'cache-control': 'private, max-age=31536000, immutable', // un document ne change jamais de contenu
          'content-disposition': `${new URL(req.url).searchParams.has('telecharger') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(nom)}`,
          'x-content-type-options': 'nosniff',
        };
        // Les images ne peuvent rien exécuter, même ouvertes seules dans un onglet
        if (mime.startsWith('image/')) headers['content-security-policy'] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";
        return new Response(objet.body, { headers });
      }

      if (!sous && method === 'PUT') {
        const data = clean(await readBody(req), MEDIA_FIELDS, true);
        if (!Object.keys(data).length) throw new HttpError(400, 'Rien à modifier');
        const set = setClause(data);
        await db.prepare(`UPDATE media SET ${set.sql} WHERE id = ?`).bind(...set.values, id).run();
        return json(await paquetMedia(db, id));
      }

      if (!sous && method === 'DELETE') {
        await db.batch([
          db.prepare('UPDATE persons SET photo_media_id = NULL WHERE photo_media_id = ?').bind(id),
          db.prepare('DELETE FROM media WHERE id = ?').bind(id), // les rattachements suivent
        ]);
        await fichiers.delete([m.r2_key as string, ...(m.thumb_key ? [m.thumb_key as string] : [])]);
        return json({ deleted: { media: [id] } });
      }

      // Rattacher / détacher le document à une personne, une union ou un événement
      if (sous === 'links' && (method === 'POST' || method === 'DELETE')) {
        const cible = await lireCible(db, treeId, await readBody(req));
        if (method === 'POST') {
          await db.prepare(`INSERT OR IGNORE INTO media_links (media_id, tree_id, ${cible.champ}) VALUES (?, ?, ?)`).bind(id, treeId, cible.id).run();
        } else {
          await db.prepare(`DELETE FROM media_links WHERE media_id = ? AND ${cible.champ} = ?`).bind(id, cible.id).run();
        }
        return json(await paquetMedia(db, id));
      }
    }
  }

  throw new HttpError(404, 'Adresse inconnue');
}
