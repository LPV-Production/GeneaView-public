// ============================================================
// Analyses de l'arbre (calculées dans le navigateur, sans rien enregistrer) :
//  - numérotation Sosa à partir de la personne racine ;
//  - alertes d'incohérence (non bloquantes) ;
//  - fiches incomplètes.
// ============================================================
import { lireDate, type Qualif } from '../../commun/dates';
import type { DonneesArbre, Evenement } from './donnees';
import { accord, deces, naissance, parents, unionsDe } from './genealogie';

// ---------- Numérotation Sosa ----------
// Racine = 1, son père = 2, sa mère = 3 ; le père de n = 2n, la mère de n = 2n + 1.
// Une personne qui apparaît par plusieurs chemins (mariage entre cousins = « implexe »)
// reçoit plusieurs numéros ; ses propres ancêtres sont numérotés par le premier chemin seulement.
const GEN_MAX = 50; // au-delà, les numéros dépassent ce qu'un nombre JavaScript sait représenter exactement

export function calculerSosa(D: DonneesArbre, racineId: string | null | undefined): Map<string, number[]> {
  const sosa = new Map<string, number[]>();
  if (!racineId || !D.personnes.has(racineId)) return sosa;
  const file: [string, number, number][] = [[racineId, 1, 0]];
  const developpes = new Set<string>();
  while (file.length) {
    const [id, n, gen] = file.shift()!;
    const nums = sosa.get(id);
    if (nums) nums.push(n);
    else sosa.set(id, [n]);
    if (developpes.has(id) || gen >= GEN_MAX) continue;
    developpes.add(id);
    const { liste } = parents(D, id);
    if (liste.length === 2) {
      file.push([liste[0].id, 2 * n, gen + 1], [liste[1].id, 2 * n + 1, gen + 1]);
    } else if (liste.length === 1) {
      file.push([liste[0].id, liste[0].sex === 'F' ? 2 * n + 1 : 2 * n, gen + 1]);
    }
  }
  for (const l of sosa.values()) l.sort((a, b) => a - b);
  return sosa;
}

/** Génération d'un numéro Sosa (1 = racine, 2-3 = parents, 4-7 = grands-parents…). */
export const generationSosa = (n: number) => Math.floor(Math.log2(n)) + 1;

// ---------- Dates sous forme d'intervalles ----------
// Pour ne pas crier au loup avec des dates incertaines, chaque date devient un intervalle
// [au plus tôt, au plus tard] en années décimales ; on n'alerte que si l'incohérence est CERTAINE.
type Intervalle = { min: number; max: number };
const MARGE_VERS = 2; // « vers 1890 » = entre 1888 et 1892

function bornes(texte: string): Intervalle | null {
  const d = lireDate(texte);
  if (!d) return null;
  if (!d.m) return { min: d.y, max: d.y + 1 };
  if (!d.d) return { min: d.y + (d.m - 1) / 12, max: d.y + d.m / 12 };
  const x = d.y + (d.m - 1) / 12 + (d.d - 1) / 365;
  return { min: x, max: x + 1 / 365 };
}

export function intervalle(e: Pick<Evenement, 'date_text' | 'date_qual'> | undefined): Intervalle | null {
  if (!e?.date_text) return null;
  const q = e.date_qual as Qualif;
  if (q === 'between') {
    const [a, b] = e.date_text.split(/\s+et\s+/i).map(bornes);
    return a && b ? { min: a.min, max: b.max } : null;
  }
  const i = bornes(e.date_text);
  if (!i) return null;
  if (q === 'about') return { min: i.min - MARGE_VERS, max: i.max + MARGE_VERS };
  if (q === 'before') return { min: -Infinity, max: i.max };
  if (q === 'after') return { min: i.min, max: Infinity };
  return i;
}

// ---------- Alertes ----------
export type Alerte = { personId: string; code: string; message: string; autre?: string };

const ans = (x: number) => `${Math.floor(x)} ans`;

/** Toutes les alertes concernant une personne. `maintenant` en années décimales (pour les tests). */
export function alertesDe(D: DonneesArbre, id: string, maintenant = new Date().getFullYear() + new Date().getMonth() / 12): Alerte[] {
  const p = D.personnes.get(id);
  if (!p) return [];
  const res: Alerte[] = [];
  const n = intervalle(naissance(D, id));
  const d = intervalle(deces(D, id));
  const nom = (x: string) => {
    const q = D.personnes.get(x);
    return q ? [q.given_names.split(' ')[0], q.surname].filter(Boolean).join(' ') : '?';
  };

  // Décès avant la naissance
  if (n && d && d.max < n.min) res.push({ personId: id, code: 'deces-avant-naissance', message: 'Décès avant la naissance' });

  // Plus de 110 ans sans date de décès
  if (n && !deces(D, id) && maintenant - n.max > 110) {
    res.push({ personId: id, code: 'trop-age', message: `Aurait plus de ${ans(maintenant - n.max)} : date de décès manquante ?` });
  }

  // Par rapport aux parents
  const { liste: lesParents } = parents(D, id);
  for (const par of lesParents) {
    const np = intervalle(naissance(D, par.id));
    const role = par.sex === 'F' ? 'sa mère' : par.sex === 'M' ? 'son père' : 'son parent';
    if (n && np) {
      if (n.max < np.min) res.push({ personId: id, code: 'ne-avant-parent', message: `${accord(p, 'Né', 'Née')} avant ${role}, ${nom(par.id)}`, autre: par.id });
      else {
        const ageMax = n.max - np.min, ageMin = n.min - np.max;
        if (ageMax < 13) res.push({ personId: id, code: 'parent-trop-jeune', message: `${nom(par.id)} (${role}) aurait eu moins de 13 ans à sa naissance`, autre: par.id });
        if (ageMin > 70) res.push({ personId: id, code: 'parent-trop-age', message: `${nom(par.id)} (${role}) aurait eu plus de 70 ans à sa naissance`, autre: par.id });
      }
    }
    if (par.sex === 'F' && n) {
      const dm = intervalle(deces(D, par.id));
      if (dm && n.min > dm.max) res.push({ personId: id, code: 'ne-apres-deces-mere', message: `${accord(p, 'Né', 'Née')} après le décès de sa mère, ${nom(par.id)}`, autre: par.id });
    }
  }

  // Mariage avant 13 ans
  if (n) {
    for (const u of unionsDe(D, id)) {
      const m = intervalle(u.mariage);
      if (m && m.max - n.min < 13) res.push({ personId: id, code: 'mariage-trop-jeune', message: `${accord(p, 'Marié', 'Mariée')} avant 13 ans${u.conjoint ? ` (avec ${nom(u.conjoint.id)})` : ''}`, autre: u.conjoint?.id });
    }
  }
  return res;
}

/** Alertes de tout l'arbre, par personne (seulement celles qui en ont). */
export function toutesAlertes(D: DonneesArbre, maintenant?: number) {
  const m = new Map<string, Alerte[]>();
  for (const id of D.personnes.keys()) {
    const a = alertesDe(D, id, maintenant);
    if (a.length) m.set(id, a);
  }
  return m;
}

// ---------- Fiche incomplète ----------
/** Ce qui manque à une fiche (liste vide = fiche complète). */
export function manques(D: DonneesArbre, id: string): string[] {
  const res: string[] = [];
  const n = naissance(D, id);
  if (!n?.date_text) res.push('date de naissance');
  if (!n?.place_id) res.push('lieu de naissance');
  if (!parents(D, id).liste.length) res.push('parents');
  const sources = (D.citationsCible.get(`p:${id}`) ?? []).length
    + (D.evPersonne.get(id) ?? []).reduce((s, e) => s + (D.citationsCible.get(`e:${e.id}`) ?? []).length, 0);
  if (!sources) res.push('sources');
  return res;
}
