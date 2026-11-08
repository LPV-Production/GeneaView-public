// ============================================================
// Import d'un fichier GEDCOM : le navigateur lit le fichier et envoie
// les lignes par petits lots (500 au plus), table par table :
//   lieux → sources → personnes → unions → enfants → événements → citations
//
//   POST /api/trees/<arbre>/import   { table, rows }   (éditeur minimum)
//
// Pourquoi par lots : l'offre gratuite de Cloudflare limite le temps de
// calcul de chaque requête ; de petits lots restent toujours rapides.
// Sécurité : chaque champ est vérifié, et chaque référence (personne,
// union, lieu, source…) doit appartenir à CET arbre, sinon la ligne est refusée.
// ============================================================
import { analyserDate, type Qualif } from '../commun/dates';
import { colonnesType, EVENEMENTS_PERSONNE, EVENEMENTS_UNION, type TypeEvenement } from '../commun/libelles';
import { clean, HttpError, json, nowSql, readBody, type FieldType } from './http';
import type { Ctx } from './index';

export const LOT_MAX = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

function idValide(v: unknown, champ: string, facultatif = false): string | null {
  if ((v === null || v === undefined) && facultatif) return null;
  if (typeof v !== 'string' || !UUID.test(v)) throw new HttpError(400, `Identifiant invalide : ${champ}`);
  return v.toLowerCase();
}
const nombre = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

/** Condition SQL « l'élément ?n existe dans l'arbre ?2 » (ou est vide si facultatif). */
const existe = (table: string, n: number, facultatif = true) =>
  `(${facultatif ? `?${n} IS NULL OR ` : ''}EXISTS (SELECT 1 FROM ${table} WHERE id = ?${n} AND tree_id = ?2))`;

const CHAMPS: Record<string, Record<string, FieldType>> = {
  places: { name: 'text', city: 'text', department: 'text', country: 'text' },
  sources: {
    title: 'text', type: ['civil', 'parish', 'census', 'website', 'book', 'testimony', 'other'], url: 'url',
    reference: 'text', reliability: ['proof', 'clue', 'hypothesis'], notes: 'longtext',
  },
  persons: { given_names: 'text', surname: 'text', married_name: 'text', nickname: 'text', sex: ['M', 'F', 'U'], living: 'bool', occupations: 'text', notes: 'longtext' },
  families: { union_type: ['marriage', 'pacs', 'cohabitation', 'engagement', 'liaison', 'unknown'], end_type: ['', 'divorce', 'separation', 'annulment'], hidden: 'bool', notes: 'longtext' },
  children: { relation: ['biological', 'adopted', 'unknown'], sort_order: 'int' },
  events: { description: 'longtext' },
  citations: { detail: 'text' },
};

/** Prépare la requête d'insertion d'une ligne (avec ses gardes « appartient à cet arbre »). */
function requete(db: D1Database, treeId: string, table: string, r: Row): D1PreparedStatement {
  const c = clean(r, CHAMPS[table], true);
  switch (table) {
    case 'places':
      if (!String(c.name ?? '').trim()) throw new HttpError(400, 'Lieu sans nom');
      return db.prepare('INSERT INTO places (id, tree_id, name, city, department, country, latitude, longitude) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
        .bind(idValide(r.id, 'id'), treeId, c.name, c.city ?? '', c.department ?? '', c.country ?? '', nombre(r.latitude, -90, 90), nombre(r.longitude, -180, 180));
    case 'sources':
      if (!String(c.title ?? '').trim()) throw new HttpError(400, 'Source sans titre');
      return db.prepare('INSERT INTO sources (id, tree_id, title, type, url, reference, reliability, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
        .bind(idValide(r.id, 'id'), treeId, c.title, c.type ?? 'other', c.url ?? '', c.reference ?? '', c.reliability ?? 'clue', c.notes ?? '');
    case 'persons':
      return db.prepare(`INSERT INTO persons (id, tree_id, given_names, surname, married_name, nickname, sex, living, occupations, notes)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
        .bind(idValide(r.id, 'id'), treeId, c.given_names ?? '', c.surname ?? '', c.married_name ?? '', c.nickname ?? '', c.sex ?? 'U', c.living ?? 0, c.occupations ?? '', c.notes ?? '');
    case 'families': {
      const t = colonnesType(c.union_type);
      return db.prepare(`INSERT INTO families (id, tree_id, partner1_id, partner2_id, union_type, kind, end_type, hidden, notes)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 WHERE ${existe('persons', 3)} AND ${existe('persons', 4)}`)
        .bind(idValide(r.id, 'id'), treeId, idValide(r.partner1_id, 'partner1_id', true), idValide(r.partner2_id, 'partner2_id', true),
          t.union_type, t.kind, c.end_type ?? '', c.hidden ?? 0, c.notes ?? '');
    }
    case 'children':
      return db.prepare(`INSERT INTO family_children (family_id, child_id, tree_id, relation, sort_order)
        SELECT ?3, ?4, ?2, ?5, ?6 WHERE ${existe('families', 3, false)} AND ${existe('persons', 4, false)}`)
        .bind(null, treeId, idValide(r.family_id, 'family_id'), idValide(r.child_id, 'child_id'), c.relation ?? 'biological', c.sort_order ?? 0);
    case 'events': {
      const pourUnion = !!r.family_id;
      if (!!r.person_id === pourUnion) throw new HttpError(400, 'Un événement concerne une personne OU une union');
      const type = r.type as TypeEvenement;
      if (!(pourUnion ? EVENEMENTS_UNION : EVENEMENTS_PERSONNE).includes(type)) throw new HttpError(400, 'Type d’événement invalide');
      // Date comprise → valeurs triables ; sinon (calendrier républicain…) gardée telle quelle, sans tri
      let d: { date_text: string; date_qual: Qualif; date_sort: number | null; date_sort_end: number | null };
      try {
        d = analyserDate((r.date_qual as Qualif) ?? 'exact', String(r.date_text ?? ''));
      } catch {
        d = { date_text: String(r.date_text ?? '').slice(0, 60), date_qual: 'exact', date_sort: null, date_sort_end: null };
      }
      return db.prepare(`INSERT INTO events (id, tree_id, person_id, family_id, type, date_text, date_qual, date_sort, date_sort_end, place_id, description)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11
        WHERE ${existe('persons', 3)} AND ${existe('families', 4)} AND ${existe('places', 10)}`)
        .bind(idValide(r.id, 'id'), treeId, idValide(r.person_id, 'person_id', true), idValide(r.family_id, 'family_id', true), type,
          d.date_text, d.date_qual, d.date_sort, d.date_sort_end, idValide(r.place_id, 'place_id', true), c.description ?? '');
    }
    case 'citations': {
      const cibles = [r.person_id, r.family_id, r.event_id].filter(Boolean).length;
      if (cibles !== 1) throw new HttpError(400, 'Une citation concerne une personne, une union OU un événement');
      return db.prepare(`INSERT INTO citations (id, tree_id, source_id, person_id, family_id, event_id, detail)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
        WHERE ${existe('sources', 3, false)} AND ${existe('persons', 4)} AND ${existe('families', 5)} AND ${existe('events', 6)}`)
        .bind(idValide(r.id, 'id'), treeId, idValide(r.source_id, 'source_id'), idValide(r.person_id, 'person_id', true),
          idValide(r.family_id, 'family_id', true), idValide(r.event_id, 'event_id', true), c.detail ?? '');
    }
  }
  throw new HttpError(400, 'Table inconnue');
}

export async function routeImport({ req, db }: Ctx, treeId: string): Promise<Response> {
  const body = await readBody(req);
  const table = String(body.table ?? '');
  if (!(table in CHAMPS)) throw new HttpError(400, 'Table inconnue');
  const rows = body.rows;
  if (!Array.isArray(rows) || !rows.length) throw new HttpError(400, 'Aucune ligne reçue');
  if (rows.length > LOT_MAX) throw new HttpError(413, `Lot trop gros (${LOT_MAX} lignes maximum)`);
  const stmts = rows.map((r, i) => {
    if (!r || typeof r !== 'object') throw new HttpError(400, `Ligne ${i + 1} illisible`);
    try {
      return requete(db, treeId, table, r as Row);
    } catch (e) {
      if (e instanceof HttpError) throw new HttpError(400, `${table}, ligne ${i + 1} : ${e.message}`);
      throw e;
    }
  });
  let resultats;
  try {
    resultats = await db.batch([...stmts, db.prepare('UPDATE trees SET updated_at = ? WHERE id = ?').bind(nowSql(), treeId)]);
  } catch (e) {
    // Identifiant déjà pris (lot envoyé deux fois…) ou lien impossible : rien n'est enregistré pour ce lot
    if (/UNIQUE|PRIMARY KEY|FOREIGN KEY|constraint/i.test(String(e))) throw new HttpError(409, `${table} : lot refusé (élément en double ou lien impossible)`);
    throw e;
  }
  const inseres = resultats.slice(0, -1).reduce((s, r) => s + (r.meta.changes ?? 0), 0);
  // Les lignes dont une référence n'est pas dans cet arbre ne sont pas insérées : on le signale
  return json({ inserted: inseres, refused: rows.length - inseres });
}
