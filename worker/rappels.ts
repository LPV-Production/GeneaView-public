// ============================================================
// Notifications d'anniversaires et de commémorations.
//
// Chaque matin à 9 h (heure de Paris), chaque appareil abonné reçoit
// UNE notification, seulement s'il y a quelque chose ce jour-là :
//  - ancêtres : « Il y a 100 ans naissait Jeanne Martin » (tous les 10 ans
//    par défaut, ou chaque année selon le réglage) ;
//  - personnes vivantes : « Louise Martin a 74 ans aujourd'hui »,
//    « Louise et Pierre fêtent leurs 50 ans de mariage » (chaque année).
// Réglages par arbre et par compte (table notification_prefs).
// Un LECTEUR n'est jamais prévenu au sujet d'une personne vivante.
// ============================================================
import { HttpError, json, readBody } from './http';
import type { Ctx } from './index';
import type { Role } from './acces';

export type LigneRappel = {
  type: 'birth' | 'death' | 'marriage';
  annee: number; // année de l'événement
  tree_id: string; tree_name: string; role: Role;
  pid: string | null; prenom: string | null; nom: string | null; vivant: number | null;
  p1_prenom: string | null; p1_nom: string | null; p1_vivant: number | null;
  p2_prenom: string | null; p2_nom: string | null; p2_vivant: number | null;
  enabled: number; births: number; deaths: number; marriages: number; round_only: number;
};
export type Rappel = { texte: string; tree_id: string; ans: number };

const nomCourt = (prenom: string | null, nom: string | null) => [String(prenom ?? '').split(' ')[0], nom].filter(Boolean).join(' ') || 'Une personne';
const rond = (n: number) => n > 0 && n % 10 === 0 || n === 25 || n === 75;

/** Transforme les événements du jour en phrases, selon les réglages et les droits. */
export function formulerRappels(lignes: LigneRappel[], anneeCourante: number): Rappel[] {
  const res: Rappel[] = [];
  for (const l of lignes) {
    if (!l.enabled) continue;
    const ans = anneeCourante - l.annee;
    if (ans <= 0) continue;
    const lecteur = l.role === 'viewer';
    if (l.type === 'birth' && l.births) {
      if (l.vivant) {
        if (!lecteur) res.push({ texte: `${nomCourt(l.prenom, l.nom)} a ${ans} an${ans > 1 ? 's' : ''} aujourd’hui`, tree_id: l.tree_id, ans });
      } else if (!l.round_only || rond(ans)) res.push({ texte: `Il y a ${ans} ans naissait ${nomCourt(l.prenom, l.nom)}`, tree_id: l.tree_id, ans });
    }
    if (l.type === 'death' && l.deaths && !l.vivant && (!l.round_only || rond(ans))) {
      res.push({ texte: `Il y a ${ans} ans disparaissait ${nomCourt(l.prenom, l.nom)}`, tree_id: l.tree_id, ans });
    }
    if (l.type === 'marriage' && l.marriages) {
      const vivants = !!(l.p1_vivant || l.p2_vivant);
      const couple = [l.p1_prenom && nomCourt(l.p1_prenom, l.p1_nom), l.p2_prenom && nomCourt(l.p2_prenom, l.p2_nom)].filter(Boolean).join(' et ');
      if (!couple) continue;
      if (vivants) {
        if (!lecteur) res.push({ texte: `${couple} fêtent leurs ${ans} ans de mariage`, tree_id: l.tree_id, ans });
      } else if (!l.round_only || rond(ans)) res.push({ texte: `Il y a ${ans} ans, ${couple} se mariaient`, tree_id: l.tree_id, ans });
    }
  }
  // Les personnes vivantes d'abord, puis les anniversaires les plus « ronds »
  return res.sort((a, b) => Number(b.texte.includes('aujourd’hui') || b.texte.includes('fêtent')) - Number(a.texte.includes('aujourd’hui') || a.texte.includes('fêtent')) || b.ans - a.ans);
}

const bissextile = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Événements (naissance, décès, mariage à date complète) tombant ce jour-là, dans les arbres d'un compte. */
export async function rappelsDuJour(db: D1Database, userId: string, jour: { y: number; m: number; d: number }) {
  const jours = [jour.m * 100 + jour.d];
  if (jour.m === 2 && jour.d === 28 && !bissextile(jour.y)) jours.push(229); // nés un 29 février
  const { results } = await db.prepare(`
    SELECT e.type, e.date_sort / 10000 AS annee, m.tree_id, t.name AS tree_name, m.role,
           p.id AS pid, p.given_names AS prenom, p.surname AS nom, p.living AS vivant,
           p1.given_names AS p1_prenom, p1.surname AS p1_nom, p1.living AS p1_vivant,
           p2.given_names AS p2_prenom, p2.surname AS p2_nom, p2.living AS p2_vivant,
           COALESCE(np.enabled, 1) AS enabled, COALESCE(np.births, 1) AS births, COALESCE(np.deaths, 1) AS deaths,
           COALESCE(np.marriages, 1) AS marriages, COALESCE(np.round_only, 1) AS round_only
    FROM tree_members m
    JOIN trees t ON t.id = m.tree_id
    JOIN events e ON e.tree_id = m.tree_id
    LEFT JOIN persons p ON p.id = e.person_id
    LEFT JOIN families f ON f.id = e.family_id
    LEFT JOIN persons p1 ON p1.id = f.partner1_id
    LEFT JOIN persons p2 ON p2.id = f.partner2_id
    LEFT JOIN notification_prefs np ON np.user_id = m.user_id AND np.tree_id = m.tree_id
    WHERE m.user_id = ?1 AND e.type IN ('birth', 'death', 'marriage') AND e.date_qual = 'exact'
      AND e.date_sort % 10000 IN (SELECT value FROM json_each(?2))`)
    .bind(userId, JSON.stringify(jours)).all<LigneRappel>();
  return formulerRappels(results, jour.y);
}

/** Le contenu de la notification (null s'il n'y a rien à dire aujourd'hui). */
export function notification(rappels: Rappel[]) {
  if (!rappels.length) return null;
  const [premier, ...autres] = rappels;
  const corps = autres.length ? `${premier.texte}${autres.length === 1 ? ` · ${autres[0].texte}` : ` · et ${autres.length} autre${autres.length > 1 ? 's' : ''} rappel${autres.length > 1 ? 's' : ''}`}` : premier.texte;
  const arbres = new Set(rappels.map((r) => r.tree_id));
  return {
    title: rappels.length === 1 ? 'Ce jour dans votre famille' : `${rappels.length} rappels de famille aujourd’hui`,
    body: corps,
    url: arbres.size === 1 ? `/#/arbre/${[...arbres][0]}` : '/',
    tag: 'rappels',
  };
}

// ---------- Réglages par arbre : /api/trees/<arbre>/notifications ----------
export async function routePrefs({ req, db, user, method }: Ctx, treeId: string): Promise<Response> {
  const lire = async () =>
    (await db.prepare('SELECT enabled, births, deaths, marriages, round_only FROM notification_prefs WHERE user_id = ? AND tree_id = ?').bind(user.id, treeId).first())
    ?? { enabled: 1, births: 1, deaths: 1, marriages: 1, round_only: 1 };
  if (method === 'GET') return json(await lire());
  if (method === 'PUT') {
    const body = await readBody(req);
    const actuel = (await lire()) as Record<string, number>;
    const v = (k: string) => (k in body ? (body[k] ? 1 : 0) : actuel[k]);
    await db.prepare(`INSERT INTO notification_prefs (user_id, tree_id, enabled, births, deaths, marriages, round_only) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, tree_id) DO UPDATE SET enabled = excluded.enabled, births = excluded.births, deaths = excluded.deaths,
      marriages = excluded.marriages, round_only = excluded.round_only`)
      .bind(user.id, treeId, v('enabled'), v('births'), v('deaths'), v('marriages'), v('round_only')).run();
    return json(await lire());
  }
  throw new HttpError(404, 'Adresse inconnue');
}
