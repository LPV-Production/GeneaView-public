// ============================================================
// Données généalogiques d'un arbre : personnes, liens familiaux,
// unions, événements, liste « à chercher ».
//
// Toutes les adresses commencent par /api/trees/<arbre>/… et ne sont
// appelées qu'APRÈS le contrôle d'accès (voir arbres.ts) :
//   lecture  → lecteur minimum,  écriture → éditeur minimum.
// Chaque identifiant reçu (personne, union, événement…) est revérifié :
// il doit appartenir à CET arbre, sinon « introuvable ».
//
// Après une modification, le serveur renvoie un « paquet » : les lignes
// à jour des personnes et unions concernées. L'appli les remplace
// dans ce qu'elle affiche, sans tout recharger.
// ============================================================
import { analyserDate, type DateAnalysee, type Qualif } from '../commun/dates';
import { EVENEMENTS_PERSONNE, EVENEMENTS_UNION, colonnesType, TYPES_UNION, type Relation, type TypeEvenement, type TypeUnion } from '../commun/libelles';
import { mediaPourAppli, routeDocuments } from './documents';
import { routeImport } from './import';
import { masquerVivants, type DonneesBrutes } from './masquage';
import type { Role } from './acces';
import { clean, HttpError, json, nowSql, readBody, setClause, type FieldType } from './http';
import type { Ctx } from './index';

type Stmt = D1PreparedStatement;
type Ligne = Record<string, unknown>;

const DANS = (n: number) => `IN (SELECT value FROM json_each(?${n}))`;

const PERSON_FIELDS: Record<string, FieldType> = {
  given_names: 'text', surname: 'text', married_name: 'text', nickname: 'text',
  sex: ['M', 'F', 'U'], living: 'bool', occupations: 'text', notes: 'longtext',
};
const UNION_TYPES = Object.keys(TYPES_UNION) as TypeUnion[];
const FAMILY_FIELDS: Record<string, FieldType> = { union_type: UNION_TYPES, end_type: ['', 'divorce', 'separation', 'annulment'], hidden: 'bool', notes: 'longtext' };

export const unionPourAppli = ({ kind, ...f }: Ligne) => ({ ...f, union_type: (kind as string) || f.union_type });
const EVENT_TYPES = [...new Set([...EVENEMENTS_PERSONNE, ...EVENEMENTS_UNION])];

// ---------- Outils ----------

/** Vérifie qu'un élément existe ET appartient à cet arbre. */
async function verifier(db: D1Database, table: 'persons' | 'families' | 'events' | 'todos', id: unknown, treeId: string, libelle: string) {
  const row = typeof id === 'string' && id.length <= 64
    ? await db.prepare(`SELECT * FROM ${table} WHERE id = ? AND tree_id = ?`).bind(id, treeId).first<Ligne>()
    : null;
  if (!row) throw new HttpError(404, `${libelle} introuvable`);
  return row;
}

const toucher = (db: D1Database, treeId: string) => db.prepare('UPDATE trees SET updated_at = ? WHERE id = ?').bind(nowSql(), treeId);

/** Lit une date envoyée par l'appli ({ date_qual, date_text }) et la vérifie. */
function lireDateCorps(o: Record<string, unknown>): DateAnalysee {
  try {
    return analyserDate((o.date_qual as Qualif) ?? 'exact', String(o.date_text ?? ''));
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
}

/**
 * Lieux : on retrouve un lieu déjà saisi (même nom, sans tenir compte des majuscules),
 * sinon on le crée. « Saint-Flour, Cantal, France » → commune, département, pays.
 */
class Lieux {
  private cache = new Map<string, string>();
  constructor(private db: D1Database, private treeId: string) {}
  async resoudre(brut: unknown, stmts: Stmt[]): Promise<string | null> {
    const nom = String(brut ?? '').trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ');
    if (!nom) return null;
    if (nom.length > 200) throw new HttpError(400, 'Nom de lieu trop long');
    const cle = nom.toLowerCase();
    if (this.cache.has(cle)) return this.cache.get(cle)!;
    const ex = await this.db.prepare('SELECT id FROM places WHERE tree_id = ? AND name = ? COLLATE NOCASE').bind(this.treeId, nom).first<{ id: string }>();
    let id = ex?.id;
    if (!id) {
      id = crypto.randomUUID();
      const [city = '', department = '', ...reste] = nom.split(', ');
      stmts.push(this.db.prepare('INSERT INTO places (id, tree_id, name, city, department, country) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, this.treeId, nom, city, department, reste.join(', ')));
    }
    this.cache.set(cle, id);
    return id;
  }
}

/** Retire tree_id des lignes envoyées à l'appli (inutile côté écran). */
export const sansArbre = (rows: Ligne[]) => rows.map(({ tree_id, ...r }) => r);

/** Tout l'arbre d'un coup (chargement de l'appli). */
async function toutLArbre(db: D1Database, treeId: string) {
  const q = (sql: string) => db.prepare(sql).bind(treeId);
  const [persons, families, children, events, places, todos, sources, citations, media, links] = await db.batch([
    q('SELECT * FROM persons WHERE tree_id = ? ORDER BY surname, given_names'),
    q('SELECT * FROM families WHERE tree_id = ?'),
    q('SELECT * FROM family_children WHERE tree_id = ? ORDER BY sort_order'),
    q('SELECT * FROM events WHERE tree_id = ? ORDER BY date_sort'),
    q('SELECT * FROM places WHERE tree_id = ? ORDER BY name'),
    q('SELECT * FROM todos WHERE tree_id = ? ORDER BY created_at'),
    q('SELECT * FROM sources WHERE tree_id = ? ORDER BY title'),
    q('SELECT * FROM citations WHERE tree_id = ? ORDER BY created_at'),
    q('SELECT * FROM media WHERE tree_id = ? ORDER BY created_at'),
    q('SELECT * FROM media_links WHERE tree_id = ?'),
  ]);
  return {
    persons: sansArbre(persons.results as Ligne[]), families: sansArbre(families.results as Ligne[]).map(unionPourAppli),
    children: sansArbre(children.results as Ligne[]), events: sansArbre(events.results as Ligne[]),
    places: sansArbre(places.results as Ligne[]), todos: sansArbre(todos.results as Ligne[]),
    sources: sansArbre(sources.results as Ligne[]), citations: sansArbre(citations.results as Ligne[]),
    media: (media.results as Ligne[]).map(mediaPourAppli),
    media_links: sansArbre(links.results as Ligne[]),
  };
}

/**
 * Le « paquet » renvoyé après une modification : les personnes demandées, TOUTES leurs
 * unions (comme conjoint ou comme enfant), et tout ce qui s'y rattache.
 */
export async function paquet(db: D1Database, treeId: string, personIds: string[], familyIds: string[] = [], deleted: Record<string, string[]> = {}) {
  const P = JSON.stringify(personIds);
  const { results: fams } = await db.prepare(`
    SELECT id FROM families WHERE tree_id = ?1 AND (id ${DANS(2)} OR partner1_id ${DANS(3)} OR partner2_id ${DANS(3)})
    UNION SELECT family_id FROM family_children WHERE tree_id = ?1 AND child_id ${DANS(3)}`)
    .bind(treeId, JSON.stringify(familyIds), P).all<{ id: string }>();
  const F = JSON.stringify(fams.map((f) => f.id));
  // ?1 = arbre, ?2 = liste de personnes ou d'unions, ?3 = liste d'unions
  const [persons, families, children, events, todos, places] = await db.batch([
    db.prepare(`SELECT * FROM persons WHERE tree_id = ?1 AND id ${DANS(2)}`).bind(treeId, P),
    db.prepare(`SELECT * FROM families WHERE tree_id = ?1 AND id ${DANS(2)}`).bind(treeId, F),
    db.prepare(`SELECT * FROM family_children WHERE tree_id = ?1 AND family_id ${DANS(2)} ORDER BY sort_order`).bind(treeId, F),
    db.prepare(`SELECT * FROM events WHERE tree_id = ?1 AND (person_id ${DANS(2)} OR family_id ${DANS(3)}) ORDER BY date_sort`).bind(treeId, P, F),
    db.prepare(`SELECT * FROM todos WHERE tree_id = ?1 AND person_id ${DANS(2)} ORDER BY created_at`).bind(treeId, P),
    db.prepare(`SELECT * FROM places WHERE tree_id = ?1 AND id IN (SELECT place_id FROM events WHERE tree_id = ?1 AND (person_id ${DANS(2)} OR family_id ${DANS(3)}))`).bind(treeId, P, F),
  ]);
  return {
    persons: sansArbre(persons.results as Ligne[]), families: sansArbre(families.results as Ligne[]).map(unionPourAppli),
    children: sansArbre(children.results as Ligne[]), events: sansArbre(events.results as Ligne[]),
    todos: sansArbre(todos.results as Ligne[]), places: sansArbre(places.results as Ligne[]),
    // Ce que l'appli doit rafraîchir (même si la liste revient vide) et ce qui a disparu
    refreshed: { persons: personIds, families: fams.map((f) => f.id) },
    deleted,
  };
}

/** Supprime les unions devenues vides : sans enfant, sans événement, avec au plus un conjoint. */
const nettoyerUnions = (db: D1Database, treeId: string, familyIds: string[]) =>
  db.prepare(`DELETE FROM families WHERE tree_id = ?1 AND id ${DANS(2)}
    AND (partner1_id IS NULL OR partner2_id IS NULL)
    AND NOT EXISTS (SELECT 1 FROM family_children c WHERE c.family_id = families.id)
    AND NOT EXISTS (SELECT 1 FROM events e WHERE e.family_id = families.id)`).bind(treeId, JSON.stringify(familyIds));

/** Photo principale : une image de CET arbre (ou null pour la retirer). */
async function photoValide(db: D1Database, treeId: string, id: unknown) {
  if (id === null) return null;
  const m = typeof id === 'string' ? await db.prepare('SELECT mime FROM media WHERE id = ? AND tree_id = ?').bind(id, treeId).first<{ mime: string }>() : null;
  if (!m) throw new HttpError(404, 'Photo introuvable');
  if (!m.mime.startsWith('image/')) throw new HttpError(400, 'La photo principale doit être une image');
  return id as string;
}

/** Unions où une personne apparaît (conjoint ou enfant). */
async function unionsDe(db: D1Database, personId: string) {
  const { results } = await db.prepare(`
    SELECT id FROM families WHERE partner1_id = ?1 OR partner2_id = ?1
    UNION SELECT family_id FROM family_children WHERE child_id = ?1`).bind(personId).all<{ id: string }>();
  return results.map((r) => r.id);
}

// ---------- Naissance et décès saisis directement dans le formulaire de la personne ----------
type DateLieu = { date_qual?: unknown; date_text?: unknown; place?: unknown };

async function evenementPrincipal(db: D1Database, treeId: string, personId: string, type: 'birth' | 'death', saisie: DateLieu, lieux: Lieux, stmts: Stmt[], nouveau: boolean) {
  const d = lireDateCorps(saisie as Record<string, unknown>);
  const placeId = await lieux.resoudre(saisie.place, stmts);
  const existant = nouveau ? null : await db
    .prepare('SELECT id, description FROM events WHERE person_id = ? AND type = ? ORDER BY date_sort IS NULL, date_sort LIMIT 1')
    .bind(personId, type).first<{ id: string; description: string }>();
  if (!d.date_text && !placeId) {
    // Tout a été effacé : on supprime l'événement, sauf s'il a une description à préserver
    if (existant && !existant.description) stmts.push(db.prepare('DELETE FROM events WHERE id = ?').bind(existant.id));
    else if (existant) stmts.push(db.prepare("UPDATE events SET date_text = '', date_qual = 'exact', date_sort = NULL, date_sort_end = NULL, place_id = NULL WHERE id = ?").bind(existant.id));
    return;
  }
  if (existant) {
    stmts.push(db.prepare('UPDATE events SET date_text = ?, date_qual = ?, date_sort = ?, date_sort_end = ?, place_id = ? WHERE id = ?')
      .bind(d.date_text, d.date_qual, d.date_sort, d.date_sort_end, placeId, existant.id));
  } else {
    stmts.push(db.prepare('INSERT INTO events (id, tree_id, person_id, type, date_text, date_qual, date_sort, date_sort_end, place_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), treeId, personId, type, d.date_text, d.date_qual, d.date_sort, d.date_sort_end, placeId));
  }
}

// ---------- Liens familiaux ----------
/**
 * Relie la personne `pid` à la personne `of` :
 *  - parent  : pid devient parent de `of` (complète l'union des parents, ou en crée une)
 *  - conjoint: nouvelle union entre `of` et pid
 *  - enfant  : pid devient enfant de `of` (dans l'union choisie, ou l'unique union de `of`)
 * Renvoie les requêtes à exécuter et les unions touchées.
 */
async function lier(db: D1Database, treeId: string, relation: Relation, of: string, pid: string, opts: { family_id?: unknown; other_id?: unknown; union_type?: unknown }, nouvelle: boolean) {
  if (of === pid) throw new HttpError(400, 'Une personne ne peut pas être liée à elle-même');
  const stmts: Stmt[] = [];
  const familles: string[] = [];

  if (relation === 'parent') {
    const fam = await db.prepare(`
      SELECT f.id, f.partner1_id, f.partner2_id FROM family_children c JOIN families f ON f.id = c.family_id
      WHERE c.child_id = ? ORDER BY c.relation = 'biological' DESC LIMIT 1`).bind(of).first<{ id: string; partner1_id: string | null; partner2_id: string | null }>();
    if (fam) {
      if (fam.partner1_id === pid || fam.partner2_id === pid) throw new HttpError(409, 'Cette personne est déjà son parent');
      if (fam.partner1_id && fam.partner2_id) throw new HttpError(409, 'Cette personne a déjà deux parents');
      // Le parent connu est déjà en union avec cette personne : l'enfant rejoint cette union
      // (sinon on créerait un second couple identique)
      const connu = fam.partner1_id ?? fam.partner2_id;
      const couple = connu && !nouvelle ? await unionDuCouple(db, connu, pid) : null;
      if (couple) {
        stmts.push(...deplacerEnfant(db, treeId, of, fam.id, couple));
        familles.push(fam.id, couple);
      } else {
        stmts.push(db.prepare(`UPDATE families SET ${fam.partner1_id ? 'partner2_id' : 'partner1_id'} = ?, updated_at = ? WHERE id = ?`).bind(pid, nowSql(), fam.id));
        familles.push(fam.id);
      }
    } else {
      const fid = crypto.randomUUID();
      stmts.push(
        db.prepare('INSERT INTO families (id, tree_id, partner1_id) VALUES (?, ?, ?)').bind(fid, treeId, pid),
        db.prepare('INSERT INTO family_children (family_id, child_id, tree_id) VALUES (?, ?, ?)').bind(fid, of, treeId),
      );
      familles.push(fid);
    }
  }

  if (relation === 'conjoint') {
    if (!nouvelle) {
      const deja = await db.prepare('SELECT 1 FROM families WHERE (partner1_id = ?1 AND partner2_id = ?2) OR (partner1_id = ?2 AND partner2_id = ?1)').bind(of, pid).first();
      if (deja) throw new HttpError(409, 'Ces deux personnes sont déjà en union');
    }
    const t = colonnesType(opts.union_type);
    const fid = crypto.randomUUID();
    stmts.push(db.prepare('INSERT INTO families (id, tree_id, partner1_id, partner2_id, union_type, kind) VALUES (?, ?, ?, ?, ?, ?)').bind(fid, treeId, of, pid, t.union_type, t.kind));
    familles.push(fid);
  }

  if (relation === 'enfant') {
    let fid: string;
    if (opts.family_id === 'nouvelle' || opts.other_id !== undefined) {
      // « Avec qui ? » : un autre parent précis (union trouvée ou créée), ou personne (parent inconnu)
      const autre = opts.other_id ? String(opts.other_id) : null;
      if (autre) {
        await verifier(db, 'persons', autre, treeId, 'Autre parent');
        if (autre === of || autre === pid) throw new HttpError(400, 'Autre parent invalide');
      }
      const existante = autre ? await unionDuCouple(db, of, autre) : null;
      if (existante) fid = existante;
      else {
        fid = crypto.randomUUID();
        stmts.push(db.prepare('INSERT INTO families (id, tree_id, partner1_id, partner2_id) VALUES (?, ?, ?, ?)').bind(fid, treeId, of, autre));
      }
    } else if (opts.family_id) {
      const f = await verifier(db, 'families', opts.family_id, treeId, 'Union');
      if (f.partner1_id !== of && f.partner2_id !== of) throw new HttpError(400, 'Cette union n’est pas celle de cette personne');
      fid = f.id as string;
    } else {
      const { results } = await db.prepare('SELECT id FROM families WHERE partner1_id = ?1 OR partner2_id = ?1').bind(of).all<{ id: string }>();
      if (results.length > 1) throw new HttpError(400, 'Cette personne a plusieurs unions : choisissez de laquelle naît l’enfant');
      if (results.length === 1) fid = results[0].id;
      else {
        fid = crypto.randomUUID();
        stmts.push(db.prepare('INSERT INTO families (id, tree_id, partner1_id) VALUES (?, ?, ?)').bind(fid, treeId, of));
      }
    }
    if (!nouvelle) {
      const f = await db.prepare('SELECT partner1_id, partner2_id FROM families WHERE id = ?').bind(fid).first<{ partner1_id: string; partner2_id: string }>();
      if (f && (f.partner1_id === pid || f.partner2_id === pid)) throw new HttpError(400, 'Un parent ne peut pas être son propre enfant');
      if (await db.prepare('SELECT 1 FROM family_children WHERE family_id = ? AND child_id = ?').bind(fid, pid).first()) {
        throw new HttpError(409, 'Cette personne est déjà son enfant');
      }
    }
    stmts.push(db.prepare(`INSERT INTO family_children (family_id, child_id, tree_id, sort_order)
      VALUES (?1, ?2, ?3, (SELECT COUNT(*) FROM family_children WHERE family_id = ?1))`).bind(fid, pid, treeId));
    familles.push(fid);
  }

  return { stmts, familles };
}

/** L'union qui réunit déjà ces deux personnes, s'il y en a une. */
async function unionDuCouple(db: D1Database, a: string, b: string) {
  const f = await db.prepare('SELECT id FROM families WHERE (partner1_id = ?1 AND partner2_id = ?2) OR (partner1_id = ?2 AND partner2_id = ?1) LIMIT 1').bind(a, b).first<{ id: string }>();
  return f?.id ?? null;
}

/** Fait passer un enfant d'une union à une autre (même nature de lien), puis supprime l'ancienne si elle est devenue vide. */
function deplacerEnfant(db: D1Database, treeId: string, enfant: string, depuis: string, vers: string): Stmt[] {
  return [
    db.prepare(`INSERT INTO family_children (family_id, child_id, tree_id, relation, sort_order)
      SELECT ?1, ?2, ?3, relation, (SELECT COUNT(*) FROM family_children WHERE family_id = ?1) FROM family_children WHERE family_id = ?4 AND child_id = ?2
      ON CONFLICT(family_id, child_id) DO NOTHING`).bind(vers, enfant, treeId, depuis),
    db.prepare('DELETE FROM family_children WHERE family_id = ? AND child_id = ?').bind(depuis, enfant),
    nettoyerUnions(db, treeId, [depuis]),
  ];
}

/** Parmi ces unions, celles qui n'existent plus (pour prévenir l'appli). */
async function disparues(db: D1Database, ids: string[]) {
  if (!ids.length) return [];
  const { results } = await db.prepare(`SELECT id FROM families WHERE id ${DANS(1)}`).bind(JSON.stringify(ids)).all<{ id: string }>();
  return ids.filter((x) => !results.some((r) => r.id === x));
}

const RELATIONS: Relation[] = ['parent', 'conjoint', 'enfant'];
function lireRelation(r: unknown) {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  if (!RELATIONS.includes(o.type as Relation)) throw new HttpError(400, 'Lien familial inconnu');
  return o as { type: Relation; of: unknown; family_id?: unknown; other_id?: unknown; union_type?: unknown };
}

// ---------- Routes ----------
export async function routeDonnees(ctx: Ctx, treeId: string, seg: string[], role: Role = 'viewer'): Promise<Response> {
  const { req, db, method } = ctx;
  const [quoi, id, sous, sousId, sous2] = seg;

  // Sources, citations, photos et documents : voir documents.ts
  if (quoi === 'sources' || quoi === 'citations' || quoi === 'media') return routeDocuments(ctx, treeId, seg, role);
  // Import GEDCOM par lots : voir import.ts
  if (quoi === 'import' && !id && method === 'POST') return routeImport(ctx, treeId);

  // Tout l'arbre (lecture)
  if (quoi === 'data' && !id && method === 'GET') {
    const tout = await toutLArbre(db, treeId);
    // Lecteur : les personnes vivantes sont masquées AVANT l'envoi (voir masquage.ts)
    return json(role === 'viewer' ? masquerVivants(tout as DonneesBrutes) : tout);
  }

  // ----- Position d'un lieu sur la carte (trouvée par l'appli via Nominatim, ou effacée) -----
  if (quoi === 'places' && id && !sous && method === 'PUT') {
    const lieu = await db.prepare('SELECT id FROM places WHERE id = ? AND tree_id = ?').bind(id, treeId).first();
    if (!lieu) throw new HttpError(404, 'Lieu introuvable');
    const body = await readBody(req);
    const coord = (v: unknown, max: number) => {
      if (v === null || v === undefined) return null;
      if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > max) throw new HttpError(400, 'Coordonnées invalides');
      return Math.round(v * 1e6) / 1e6;
    };
    const lat = coord(body.latitude, 90), lon = coord(body.longitude, 180);
    if ((lat === null) !== (lon === null)) throw new HttpError(400, 'Latitude et longitude vont ensemble');
    // geocoded_at est noté même si rien n'a été trouvé : on ne redemande pas à Nominatim à chaque fois
    const row = await db.prepare('UPDATE places SET latitude = ?, longitude = ?, geocoded_at = ? WHERE id = ? RETURNING *').bind(lat, lon, body.reset ? null : nowSql(), id).first<Ligne>();
    return json({ places: sansArbre([row!]) });
  }

  // ----- Personne racine (Sosa 1) -----
  if (quoi === 'root' && !id && method === 'PUT') {
    const body = await readBody(req);
    if (body.person_id !== null) await verifier(db, 'persons', body.person_id, treeId, 'Personne');
    await db.batch([db.prepare('UPDATE trees SET root_person_id = ? WHERE id = ?').bind(body.person_id ?? null, treeId), toucher(db, treeId)]);
    return json({ root_person_id: body.person_id ?? null });
  }

  // ----- Personnes -----
  if (quoi === 'persons') {
    if (!id && method === 'POST') {
      const body = await readBody(req);
      const data = clean(body, PERSON_FIELDS, true);
      if (!String(data.given_names ?? '').trim() && !String(data.surname ?? '').trim()) throw new HttpError(400, 'Indiquez au moins un prénom ou un nom');
      const relation = lireRelation(body.relation);
      if (relation) await verifier(db, 'persons', relation.of, treeId, 'Personne liée');
      const pid = crypto.randomUUID();
      const lieux = new Lieux(db, treeId);
      const stmts: Stmt[] = [];
      const cols = Object.keys(data);
      stmts.push(db.prepare(`INSERT INTO persons (id, tree_id${cols.map((c) => ', ' + c).join('')}) VALUES (?, ?${cols.map(() => ', ?').join('')})`)
        .bind(pid, treeId, ...Object.values(data)));
      if (body.birth) await evenementPrincipal(db, treeId, pid, 'birth', body.birth as DateLieu, lieux, stmts, true);
      if (body.death && !data.living) await evenementPrincipal(db, treeId, pid, 'death', body.death as DateLieu, lieux, stmts, true);
      let familles: string[] = [];
      if (relation) {
        const l = await lier(db, treeId, relation.type, relation.of as string, pid, relation, true);
        stmts.push(...l.stmts);
        familles = l.familles;
      }
      await db.batch([...stmts, toucher(db, treeId)]);
      const parties = await disparues(db, familles);
      return json({ id: pid, ...(await paquet(db, treeId, relation ? [pid, relation.of as string] : [pid], familles.filter((f) => !parties.includes(f)), { families: parties })) }, 201);
    }

    if (id && !sous && method === 'PUT') {
      const avant = await verifier(db, 'persons', id, treeId, 'Personne');
      const body = await readBody(req);
      const data: Record<string, string | number | null> = clean(body, PERSON_FIELDS, true);
      if ('photo_media_id' in body) data.photo_media_id = await photoValide(db, treeId, body.photo_media_id);
      const nom = { ...avant, ...data };
      if (!String(nom.given_names).trim() && !String(nom.surname).trim()) throw new HttpError(400, 'Indiquez au moins un prénom ou un nom');
      const lieux = new Lieux(db, treeId);
      const stmts: Stmt[] = [];
      if (Object.keys(data).length) {
        const set = setClause({ ...data, updated_at: nowSql() });
        stmts.push(db.prepare(`UPDATE persons SET ${set.sql} WHERE id = ?`).bind(...set.values, id));
      }
      if (body.birth) await evenementPrincipal(db, treeId, id, 'birth', body.birth as DateLieu, lieux, stmts, false);
      if (body.death && !nom.living) await evenementPrincipal(db, treeId, id, 'death', body.death as DateLieu, lieux, stmts, false);
      await db.batch([...stmts, toucher(db, treeId)]);
      return json(await paquet(db, treeId, [id]));
    }

    if (id && !sous && method === 'DELETE') {
      await verifier(db, 'persons', id, treeId, 'Personne');
      const fams = await unionsDe(db, id);
      await db.batch([
        db.prepare('DELETE FROM persons WHERE id = ?').bind(id), // événements, liens, « à chercher » suivent
        nettoyerUnions(db, treeId, fams),
        db.prepare('UPDATE trees SET root_person_id = NULL WHERE id = ? AND root_person_id = ?').bind(treeId, id),
        toucher(db, treeId),
      ]);
      const { results } = await db.prepare(`SELECT id FROM families WHERE id ${DANS(1)}`).bind(JSON.stringify(fams)).all<{ id: string }>();
      const restantes = results.map((r) => r.id);
      return json(await paquet(db, treeId, [], restantes, { persons: [id], families: fams.filter((f) => !restantes.includes(f)) }));
    }
  }

  // ----- Relier deux personnes déjà dans l'arbre -----
  if (quoi === 'links' && !id && method === 'POST') {
    const body = await readBody(req);
    const relation = lireRelation(body);
    if (!relation) throw new HttpError(400, 'Lien familial manquant');
    await verifier(db, 'persons', relation.of, treeId, 'Personne');
    await verifier(db, 'persons', body.person_id, treeId, 'Personne à relier');
    const l = await lier(db, treeId, relation.type, relation.of as string, body.person_id as string, relation, false);
    await db.batch([...l.stmts, toucher(db, treeId)]);
    const parties = await disparues(db, l.familles);
    return json(await paquet(db, treeId, [relation.of as string, body.person_id as string], l.familles.filter((f) => !parties.includes(f)), { families: parties }));
  }

  // ----- Unions -----
  if (quoi === 'families' && id) {
    const fam = await verifier(db, 'families', id, treeId, 'Union');
    const membres = async () => {
      const { results } = await db.prepare('SELECT child_id FROM family_children WHERE family_id = ?').bind(id).all<{ child_id: string }>();
      return [fam.partner1_id, fam.partner2_id, ...results.map((r) => r.child_id)].filter(Boolean) as string[];
    };

    if (!sous && method === 'PUT') {
      const data = clean(await readBody(req), FAMILY_FIELDS, true);
      if (!Object.keys(data).length) throw new HttpError(400, 'Rien à modifier');
      if ('union_type' in data) Object.assign(data, colonnesType(data.union_type));
      const set = setClause({ ...data, updated_at: nowSql() });
      await db.batch([db.prepare(`UPDATE families SET ${set.sql} WHERE id = ?`).bind(...set.values, id), toucher(db, treeId)]);
      return json(await paquet(db, treeId, [], [id]));
    }
    if (!sous && method === 'DELETE') {
      const personnes = await membres();
      await db.batch([db.prepare('DELETE FROM families WHERE id = ?').bind(id), toucher(db, treeId)]);
      return json(await paquet(db, treeId, personnes, [], { families: [id] }));
    }
    // Lien d'un enfant avec l'union : changer sa nature (biologique, adoptif…) ou le retirer
    if (sous === 'children' && sousId) {
      if (!(await db.prepare('SELECT 1 FROM family_children WHERE family_id = ? AND child_id = ?').bind(id, sousId).first())) {
        throw new HttpError(404, 'Cet enfant n’est pas lié à cette union');
      }
      // Changer les parents de l'enfant : vers une autre union, ou vers le couple « parent + autre parent »
      if (method === 'PUT' && sous2 === 'move') {
        const body = await readBody(req);
        let vers: string;
        const stmts: Stmt[] = [];
        if (body.family_id) {
          vers = (await verifier(db, 'families', body.family_id, treeId, 'Union')).id as string;
        } else {
          const parent = String(body.parent_id ?? '');
          await verifier(db, 'persons', parent, treeId, 'Parent');
          const autre = body.other_id ? String(body.other_id) : null;
          if (autre) await verifier(db, 'persons', autre, treeId, 'Autre parent');
          if (autre === parent) throw new HttpError(400, 'Choisissez deux parents différents');
          const trouvee = autre
            ? await unionDuCouple(db, parent, autre)
            : (await db.prepare('SELECT id FROM families WHERE (partner1_id = ?1 AND partner2_id IS NULL) OR (partner2_id = ?1 AND partner1_id IS NULL) LIMIT 1').bind(parent).first<{ id: string }>())?.id;
          vers = trouvee ?? crypto.randomUUID();
          if (!trouvee) stmts.push(db.prepare('INSERT INTO families (id, tree_id, partner1_id, partner2_id) VALUES (?, ?, ?, ?)').bind(vers, treeId, parent, autre));
        }
        if (vers === id) throw new HttpError(400, 'L’enfant est déjà dans cette union');
        const cible = await db.prepare('SELECT partner1_id, partner2_id FROM families WHERE id = ?').bind(vers).first<{ partner1_id: string | null; partner2_id: string | null }>();
        if ((cible && (cible.partner1_id === sousId || cible.partner2_id === sousId)) || body.parent_id === sousId || body.other_id === sousId) {
          throw new HttpError(400, 'Une personne ne peut pas être son propre parent');
        }
        const anciens = await membres();
        await db.batch([...stmts, ...deplacerEnfant(db, treeId, sousId, id, vers), toucher(db, treeId)]);
        const parties = await disparues(db, [id]);
        return json(await paquet(db, treeId, [sousId, ...anciens], [vers, ...(parties.length ? [] : [id])], { families: parties }));
      }
      if (method === 'PUT') {
        const { relation } = clean(await readBody(req), { relation: ['biological', 'adopted', 'unknown'] }, false);
        await db.batch([db.prepare('UPDATE family_children SET relation = ? WHERE family_id = ? AND child_id = ?').bind(relation, id, sousId), toucher(db, treeId)]);
        return json(await paquet(db, treeId, [sousId], [id]));
      }
      if (method === 'DELETE') {
        await db.batch([
          db.prepare('DELETE FROM family_children WHERE family_id = ? AND child_id = ?').bind(id, sousId),
          nettoyerUnions(db, treeId, [id]),
          toucher(db, treeId),
        ]);
        const existe = await db.prepare('SELECT 1 FROM families WHERE id = ?').bind(id).first();
        return json(await paquet(db, treeId, [sousId, ...(await membres())], existe ? [id] : [], existe ? {} : { families: [id] }));
      }
    }
  }

  // ----- Événements (d'une personne ou d'une union) -----
  if (quoi === 'events') {
    const lireEvenement = async (body: Record<string, unknown>, pourUnion: boolean, stmts: Stmt[]) => {
      const type = body.type as TypeEvenement;
      if (!(pourUnion ? EVENEMENTS_UNION : EVENEMENTS_PERSONNE).includes(type)) throw new HttpError(400, 'Type d’événement impossible ici');
      const date = lireDateCorps(body);
      const placeId = await new Lieux(db, treeId).resoudre(body.place, stmts);
      const description = String(body.description ?? '').trim();
      if (description.length > 2000) throw new HttpError(400, 'Description trop longue');
      return { type, ...date, place_id: placeId, description };
    };

    if (!id && method === 'POST') {
      const body = await readBody(req);
      if (!!body.person_id === !!body.family_id) throw new HttpError(400, 'Un événement concerne une personne OU une union');
      if (body.person_id) await verifier(db, 'persons', body.person_id, treeId, 'Personne');
      else await verifier(db, 'families', body.family_id, treeId, 'Union');
      const stmts: Stmt[] = [];
      const e = await lireEvenement(body, !!body.family_id, stmts);
      stmts.push(db.prepare(`INSERT INTO events (id, tree_id, person_id, family_id, type, date_text, date_qual, date_sort, date_sort_end, place_id, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), treeId, body.person_id ?? null, body.family_id ?? null, e.type, e.date_text, e.date_qual, e.date_sort, e.date_sort_end, e.place_id, e.description));
      await db.batch([...stmts, toucher(db, treeId)]);
      return json(await paquet(db, treeId, body.person_id ? [body.person_id as string] : [], body.family_id ? [body.family_id as string] : []), 201);
    }
    if (id && method === 'PUT') {
      const ev = await verifier(db, 'events', id, treeId, 'Événement');
      // Champs non envoyés par l'appli : on garde les anciens
      const body: Record<string, unknown> = { ...ev, place: undefined, ...(await readBody(req)) };
      const stmts: Stmt[] = [];
      const e = await lireEvenement(body, !!ev.family_id, stmts);
      const placeId = body.place !== undefined ? e.place_id : (ev.place_id as string | null);
      stmts.push(db.prepare('UPDATE events SET type = ?, date_text = ?, date_qual = ?, date_sort = ?, date_sort_end = ?, place_id = ?, description = ? WHERE id = ?')
        .bind(e.type, e.date_text, e.date_qual, e.date_sort, e.date_sort_end, placeId, e.description, id));
      await db.batch([...stmts, toucher(db, treeId)]);
      return json(await paquet(db, treeId, ev.person_id ? [ev.person_id as string] : [], ev.family_id ? [ev.family_id as string] : []));
    }
    if (id && method === 'DELETE') {
      const ev = await verifier(db, 'events', id, treeId, 'Événement');
      await db.batch([db.prepare('DELETE FROM events WHERE id = ?').bind(id), toucher(db, treeId)]);
      return json(await paquet(db, treeId, ev.person_id ? [ev.person_id as string] : [], ev.family_id ? [ev.family_id as string] : [], { events: [id] }));
    }
  }

  // ----- Liste « à chercher » -----
  if (quoi === 'todos') {
    if (!id && method === 'POST') {
      const body = await readBody(req);
      await verifier(db, 'persons', body.person_id, treeId, 'Personne');
      const { text } = clean(body, { text: 'text' }, false);
      if (!text) throw new HttpError(400, 'Texte vide');
      await db.batch([db.prepare('INSERT INTO todos (id, tree_id, person_id, text) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), treeId, body.person_id, text), toucher(db, treeId)]);
      return json(await paquet(db, treeId, [body.person_id as string]), 201);
    }
    if (id && (method === 'PUT' || method === 'DELETE')) {
      const t = await verifier(db, 'todos', id, treeId, 'Élément');
      if (method === 'PUT') {
        const data = clean(await readBody(req), { text: 'text', done: 'bool' }, true);
        if (data.text === '') throw new HttpError(400, 'Texte vide');
        if (!Object.keys(data).length) throw new HttpError(400, 'Rien à modifier');
        const set = setClause(data);
        await db.prepare(`UPDATE todos SET ${set.sql} WHERE id = ?`).bind(...set.values, id).run();
      } else {
        await db.prepare('DELETE FROM todos WHERE id = ?').bind(id).run();
      }
      return json(await paquet(db, treeId, [t.person_id as string], [], method === 'DELETE' ? { todos: [id] } : {}));
    }
  }

  throw new HttpError(404, 'Adresse inconnue');
}
