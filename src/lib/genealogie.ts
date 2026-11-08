// ============================================================
// Lecture de la famille à partir des données de l'arbre :
// noms, dates de vie, parents, unions (et leur fin), frères et sœurs,
// belle-famille, chronologie.
// ============================================================
import { afficherDate, age, anneeCourte, aujourdhui } from '../../commun/dates';
import { TYPES_EVENEMENT, TYPES_UNION, type FinUnion } from '../../commun/libelles';
import type { DonneesArbre, Evenement, Personne, Union } from './donnees';

export const nomComplet = (p: Personne | undefined) => (p ? [p.given_names, p.surname].filter((s) => s.trim()).join(' ') || 'Sans nom' : 'Inconnu');
/** Prénom usuel (le premier) + nom : « Joseph Martin » */
export const nomCourt = (p: Personne | undefined) => (p ? [p.given_names.trim().split(/\s+/)[0], p.surname].filter(Boolean).join(' ') || 'Sans nom' : 'Inconnu');
export const initiales = (p: Personne | undefined) =>
  p ? ((p.given_names.trim()[0] ?? '') + (p.surname.trim()[0] ?? '')).toUpperCase() || '?' : '?';

/** « Né », « Née » ou « Né(e) » selon le sexe. */
export const accord = (p: Personne | undefined, m: string, f: string, u = `${m}(e)`) => (p?.sex === 'M' ? m : p?.sex === 'F' ? f : u);

const parDate = (a: Evenement, b: Evenement) => (a.date_sort ?? Infinity) - (b.date_sort ?? Infinity);

/** Événement principal d'un type (le plus ancien daté). */
export function evenement(D: DonneesArbre, personId: string, ...types: Evenement['type'][]) {
  const liste = D.evPersonne.get(personId) ?? [];
  for (const t of types) {
    const e = liste.filter((x) => x.type === t).sort(parDate)[0];
    if (e) return e;
  }
  return undefined;
}
export const naissance = (D: DonneesArbre, id: string) => evenement(D, id, 'birth', 'baptism');
export const deces = (D: DonneesArbre, id: string) => evenement(D, id, 'death', 'burial');

/** « le 12 mars 1890 », « en mars 1890 », « en 1890 », « vers 1890 » : la date avec la bonne préposition. */
export function datePhrase(e: Evenement | undefined) {
  const txt = e ? afficherDate(e) : '';
  if (!txt) return '';
  if (/^(1er|\d{1,2}) /.test(txt)) return `le ${txt}`;
  if (/^(\d|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/.test(txt)) return `en ${txt}`;
  return txt;
}

export const nomLieu =(D: DonneesArbre, placeId: string | null) => (placeId ? (D.lieux.get(placeId)?.name ?? '') : '');

/** « 1890 – 1962 », « v. 1890 – ? », « née en 1952 » */
export function vieCourte(D: DonneesArbre, id: string) {
  const p = D.personnes.get(id);
  const n = anneeCourte(naissance(D, id));
  const d = anneeCourte(deces(D, id));
  if (p?.living) return n ? `${accord(p, 'né', 'née')} en ${n.replace(/^v\. /, 'vers ')}` : '';
  if (!n && !d) return '';
  return `${n || '?'} – ${d || '?'}`;
}

/** Âge au décès, ou âge actuel pour une personne vivante : « 72 ans », « environ 72 ans ». */
export function ageTexte(D: DonneesArbre, id: string) {
  const p = D.personnes.get(id);
  const n = naissance(D, id);
  const r = p?.living ? age(n, aujourdhui()) : age(n, deces(D, id));
  if (!r) return '';
  return `${r.approx ? 'environ ' : ''}${r.ans} an${r.ans > 1 ? 's' : ''}`;
}

const ORDRE_SEXE = { M: 0, U: 1, F: 2 };

/** Les parents (le père d'abord, la mère ensuite) et l'union dont la personne est issue. */
export function parents(D: DonneesArbre, id: string) {
  const liens = D.unionsEnfant.get(id) ?? [];
  const lien = liens.find((l) => l.relation === 'biological') ?? liens[0];
  const u = lien ? D.unions.get(lien.family_id) : undefined;
  const liste = [u?.partner1_id, u?.partner2_id]
    .map((x) => (x ? D.personnes.get(x) : undefined))
    .filter((x): x is Personne => !!x)
    .sort((a, b) => ORDRE_SEXE[a.sex] - ORDRE_SEXE[b.sex]);
  return { union: u, lien, liste, autres: liens.filter((l) => l !== lien) };
}

/** « Père », « Mère » ou « Parent ». */
export const roleParent = (p: Personne) => (p.sex === 'M' ? 'Père' : p.sex === 'F' ? 'Mère' : 'Parent');

/** Le conjoint d'une personne dans une union. */
export const conjointDans = (u: Union, id: string) => (u.partner1_id === id ? u.partner2_id : u.partner1_id);

/** Enfants d'une union, triés par date de naissance. */
export function enfantsDe(D: DonneesArbre, unionId: string) {
  return (D.enfantsUnion.get(unionId) ?? [])
    .map((l) => ({ lien: l, p: D.personnes.get(l.child_id)! }))
    .filter((x) => x.p)
    .sort((a, b) => (naissance(D, a.p.id)?.date_sort ?? Infinity) - (naissance(D, b.p.id)?.date_sort ?? Infinity));
}

/** Les unions d'une personne, avec le conjoint et les enfants, dans l'ordre chronologique. */
export function unionsDe(D: DonneesArbre, id: string) {
  return (D.unionsConjoint.get(id) ?? [])
    .map((uid) => D.unions.get(uid)!)
    .filter(Boolean)
    .map((u) => {
      const cid = conjointDans(u, id);
      const evs = D.evUnion.get(u.id) ?? [];
      return { union: u, conjoint: cid ? D.personnes.get(cid) : undefined, enfants: enfantsDe(D, u.id), mariage: evs.find((e) => e.type === 'marriage') };
    })
    .sort((a, b) => (a.mariage?.date_sort ?? Infinity) - (b.mariage?.date_sort ?? Infinity));
}

/** Frères et sœurs (même union de parents) et demi-frères et sœurs (un seul parent commun). */
export function fratrie(D: DonneesArbre, id: string) {
  const vus = new Set([id]);
  // demi : frère ou sœur par un seul parent ; commun : ce parent (« même père », « même mère »)
  const res: { p: Personne; demi: boolean; commun?: Personne }[] = [];
  for (const lien of D.unionsEnfant.get(id) ?? []) {
    for (const e of enfantsDe(D, lien.family_id)) if (!vus.has(e.p.id)) { vus.add(e.p.id); res.push({ p: e.p, demi: false }); }
    const u = D.unions.get(lien.family_id);
    for (const parent of [u?.partner1_id, u?.partner2_id]) {
      if (!parent) continue;
      for (const autre of D.unionsConjoint.get(parent) ?? []) {
        if (autre === lien.family_id) continue;
        for (const e of enfantsDe(D, autre)) if (!vus.has(e.p.id)) { vus.add(e.p.id); res.push({ p: e.p, demi: true, commun: D.personnes.get(parent) }); }
      }
    }
  }
  return res.sort((a, b) => (naissance(D, a.p.id)?.date_sort ?? Infinity) - (naissance(D, b.p.id)?.date_sort ?? Infinity));
}

export type LigneChrono = {
  cle: string; titre: string; date: string; tri: number | null; lieu: string; texte: string;
  icone: string; evenement?: Evenement; lien?: string; approx: boolean;
};

const ICONES: Record<string, string> = {
  birth: 'naissance', baptism: 'bapteme', death: 'deces', burial: 'inhumation', marriage: 'mariage', divorce: 'divorce',
  residence: 'accueil', occupation: 'profession', military: 'militaire', census: 'recensement', other: 'note',
};
export const iconeEvenement = (t: string) => ICONES[t] ?? 'note';

/** Frise d'une personne : ses événements, ceux de ses unions et la naissance de ses enfants. */
export function chronologie(D: DonneesArbre, id: string): LigneChrono[] {
  const lignes: LigneChrono[] = (D.evPersonne.get(id) ?? []).map((e) => ({
    cle: e.id, titre: TYPES_EVENEMENT[e.type], date: afficherDate(e), tri: e.date_sort, lieu: nomLieu(D, e.place_id),
    texte: e.description, icone: iconeEvenement(e.type), evenement: e, approx: e.date_qual !== 'exact',
  }));
  for (const u of unionsDe(D, id)) {
    for (const e of D.evUnion.get(u.union.id) ?? []) {
      lignes.push({
        cle: e.id, titre: `${TYPES_EVENEMENT[e.type]}${u.conjoint ? ` avec ${nomCourt(u.conjoint)}` : ''}`, date: afficherDate(e), tri: e.date_sort,
        lieu: nomLieu(D, e.place_id), texte: e.description, icone: iconeEvenement(e.type), evenement: e, lien: u.conjoint?.id, approx: e.date_qual !== 'exact',
      });
    }
    for (const { p: enfant } of u.enfants) {
      const n = naissance(D, enfant.id);
      if (!n?.date_sort) continue; // sans date, la naissance d'un enfant n'apprend rien sur la frise
      lignes.push({
        cle: `enfant-${enfant.id}`, titre: `Naissance ${accord(enfant, 'de son fils', 'de sa fille', 'de son enfant')}`,
        date: afficherDate(n), tri: n.date_sort, lieu: nomLieu(D, n.place_id), texte: nomCourt(enfant), icone: 'enfant', lien: enfant.id, approx: n.date_qual !== 'exact',
      });
    }
  }
  // Ordre : par date ; sans date, la naissance en premier et le décès / l'inhumation à la fin
  const rang = (l: LigneChrono) => (l.tri != null ? 1 : l.evenement?.type === 'birth' || l.evenement?.type === 'baptism' ? 0 : l.evenement?.type === 'death' || l.evenement?.type === 'burial' ? 3 : 2);
  return lignes.sort((a, b) => rang(a) - rang(b) || (a.tri ?? 0) - (b.tri ?? 0));
}

export const libelleUnion = (u: Union) => TYPES_UNION[u.union_type] ?? TYPES_UNION.unknown;

/** « 1re union », « 2e union »… quand une personne en a plusieurs. */
export const rangUnion = (i: number) => (i === 0 ? '1re union' : `${i + 1}e union`);

/**
 * Comment une union a pris fin : ce qui est indiqué, sinon un événement « divorce »,
 * sinon le décès d'un conjoint (veuvage). Vide : union en cours (ou fin inconnue).
 */
export function finUnion(D: DonneesArbre, u: Union): { type: FinUnion | 'veuvage'; date?: Evenement; decede?: Personne } {
  const divorce = (D.evUnion.get(u.id) ?? []).find((e) => e.type === 'divorce');
  if (u.end_type) return { type: u.end_type, date: u.end_type === 'divorce' ? divorce : undefined };
  if (divorce) return { type: 'divorce', date: divorce };
  // Le premier des deux à mourir met fin à l'union
  const morts = [u.partner1_id, u.partner2_id]
    .map((id) => (id ? { p: D.personnes.get(id), d: deces(D, id) } : null))
    .filter((x): x is { p: Personne; d: Evenement | undefined } => !!x?.p && !!x.d);
  if (morts.length) {
    morts.sort((a, b) => (a.d?.date_sort ?? Infinity) - (b.d?.date_sort ?? Infinity));
    return { type: 'veuvage', date: morts[0].d, decede: morts[0].p };
  }
  return { type: '' };
}

/** La fin d'une union racontée du point de vue d'une personne : « Divorcés en 1980 », « Veuve depuis 1998 »… */
export function texteFin(D: DonneesArbre, u: Union, pourId: string) {
  const f = finUnion(D, u);
  const moi = D.personnes.get(pourId);
  const quand = f.date?.date_text ? ` · ${afficherDate(f.date)}` : '';
  switch (f.type) {
    case 'divorce': return `Divorcés${quand}`;
    case 'separation': return 'Séparés';
    case 'annulment': return 'Union annulée';
    case 'veuvage':
      // Seul le conjoint survivant est « veuf » ; pour le défunt, l'union s'arrête à son propre décès
      if (f.decede?.id === pourId) return '';
      return `${accord(moi, 'Veuf', 'Veuve')}${quand}`;
    default: return '';
  }
}

/** Une personne de la belle-famille, avec son rôle et la personne par qui passe le lien. */
export type Allie = { p: Personne; role: string; via: Personne };

/**
 * La belle-famille d'une personne, rangée par groupes :
 *  - beaux-parents (parents de son conjoint) ;
 *  - conjoints de ses parents qui ne sont pas son autre parent (beau-père, belle-mère par remariage) ;
 *  - beaux-frères et belles-sœurs (frères et sœurs du conjoint, conjoints des frères et sœurs) ;
 *  - enfants de son conjoint nés d'une autre union (beaux-fils, belles-filles) ;
 *  - conjoints de ses enfants (gendres, belles-filles).
 * `manquants` : conjoints (hors liaisons) dont on ne connaît pas encore les deux parents (raccourcis d'ajout).
 */
export function belleFamille(D: DonneesArbre, id: string) {
  const vus = new Set([id]);
  const groupe = (liste: Allie[]) => liste.filter((a) => (vus.has(a.p.id) ? false : (vus.add(a.p.id), true)));
  const unions = unionsDe(D, id);
  const conjoints = unions.map((u) => u.conjoint).filter((c): c is Personne => !!c);
  const mesParents = parents(D, id).liste;
  // Les personnes de la famille de sang proche ne sont pas « par alliance »
  for (const p of mesParents) vus.add(p.id);
  for (const f of fratrie(D, id)) vus.add(f.p.id);
  for (const u of unions) for (const e of u.enfants) vus.add(e.p.id);
  for (const c of conjoints) vus.add(c.id);

  const beauxParents = groupe(conjoints.flatMap((c) => parents(D, c.id).liste.map((p) => ({ p, via: c, role: accord(p, 'beau-père', 'belle-mère', 'beau-parent') }))));
  // Une liaison d'un parent ne fait pas de beau-parent
  const parAlliance = groupe(mesParents.flatMap((parent) => unionsDe(D, parent.id)
    .filter((u) => u.union.union_type !== 'liaison')
    .map((u) => u.conjoint)
    .filter((c): c is Personne => !!c && !mesParents.some((m) => m.id === c.id))
    .map((c) => ({ p: c, via: parent, role: accord(c, 'beau-père', 'belle-mère', 'beau-parent') }))));
  const beauxFreres = groupe([
    ...conjoints.flatMap((c) => fratrie(D, c.id).map((f) => ({ p: f.p, via: c, role: accord(f.p, 'beau-frère', 'belle-sœur', 'beau-frère / belle-sœur') }))),
    ...fratrie(D, id).flatMap((f) => unionsDe(D, f.p.id).map((u) => u.conjoint).filter((c): c is Personne => !!c)
      .map((c) => ({ p: c, via: f.p, role: accord(c, 'beau-frère', 'belle-sœur', 'beau-frère / belle-sœur') }))),
  ]);
  const beauxEnfants = groupe(conjoints.flatMap((c) => unionsDe(D, c.id)
    .filter((u) => u.conjoint?.id !== id)
    .flatMap((u) => u.enfants.map((e) => ({ p: e.p, via: c, role: accord(e.p, 'beau-fils', 'belle-fille', 'bel-enfant') })))));
  const gendres = groupe(unions.flatMap((u) => u.enfants).flatMap((e) => unionsDe(D, e.p.id).map((u) => u.conjoint).filter((c): c is Personne => !!c)
    .map((c) => ({ p: c, via: e.p, role: accord(c, 'gendre', 'belle-fille', 'gendre / belle-fille') }))));

  return {
    groupes: [
      { titre: 'Beaux-parents', liste: beauxParents },
      { titre: 'Conjoints de ses parents', liste: parAlliance },
      { titre: 'Beaux-frères et belles-sœurs', liste: beauxFreres },
      { titre: 'Enfants de son conjoint', liste: beauxEnfants },
      { titre: 'Gendres et belles-filles', liste: gendres },
    ].filter((g) => g.liste.length),
    manquants: unions.filter((u) => u.conjoint && u.union.union_type !== 'liaison' && parents(D, u.conjoint.id).liste.length < 2).map((u) => u.conjoint!),
  };
}

/** Texte de recherche (sans accents, en minuscules) d'une personne. */
export const pourRecherche = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
