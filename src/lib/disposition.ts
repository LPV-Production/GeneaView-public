// ============================================================
// Disposition de la vue arbre « personne centrale ».
//
//   ancêtres  ↑  (2 à 4 générations, le père à gauche, la mère à droite)
//   centre       la personne choisie, ses conjoints de part et d'autre
//   descendants ↓ (2 générations, avec les conjoints des enfants)
//
// On ne calcule QUE cette fenêtre autour de la personne centrale :
// même dans un arbre de 2 000 personnes, il n'y a que quelques dizaines
// de cartes à placer, d'où une vue toujours fluide.
//
// Principe (« arbre bien rangé ») : chaque personne réserve une largeur
// égale à celle de toute sa branche ; un enfant est centré sous ses
// parents, des parents sont centrés au-dessus de leurs enfants.
// Deux branches ne peuvent donc jamais se chevaucher.
// ============================================================
import type { DonneesArbre, Union } from './donnees';
import { enfantsDe, parents, unionsDe } from './genealogie';

export const L = 200; // largeur d'une carte
export const H = 64; // hauteur d'une carte
const GC = 16; // écart entre deux conjoints
const GX = 32; // écart entre deux branches
const GY = 64; // écart entre deux générations
const RANG = H + GY;

export type CarteArbre = {
  id: string;
  x: number;
  y: number;
  gen: number; // négatif = ancêtres, 0 = centre, positif = descendants
  role: 'centre' | 'ancetre' | 'conjoint' | 'descendant';
  ancetresCaches?: boolean; // a des parents au-delà de la fenêtre
  descendantsCaches?: number; // nombre d'enfants au-delà de la fenêtre
};
/** Case « + Père / + Mère » pour un parent manquant (seulement pour qui peut modifier). */
export type CaseVide = { cle: string; x: number; y: number; gen: number; enfant: string; sexe: 'M' | 'F' };
// union : trait plein ; rompue : divorce, séparation, annulation (tirets) ; liaison : pointillés
export type Trait = { d: string; style: 'filiation' | 'union' | 'rompue' | 'liaison' | 'vide' };

/** Style du trait entre deux conjoints. */
function styleUnion(D: DonneesArbre, u: Union | undefined): Trait['style'] {
  if (!u) return 'union';
  if (u.union_type === 'liaison') return 'liaison';
  const rompue = !!u.end_type || (D.evUnion.get(u.id) ?? []).some((e) => e.type === 'divorce');
  return rompue ? 'rompue' : 'union';
}
export type Disposition = { cartes: CarteArbre[]; vides: CaseVide[]; traits: Trait[]; minX: number; minY: number; maxX: number; maxY: number };
export type Options = { ascendants: number; descendants: number; casesVides: boolean };

// ---------- Ancêtres ----------
type NA = { id: string | null; sexe: 'M' | 'F' | 'U'; gen: number; pere?: NA; mere?: NA; larg: number; x: number };

const estFeuille = (n?: NA) => !n || (!n.pere && !n.mere);
const ecartParents = (n: NA) => (n.pere && n.mere ? (estFeuille(n.pere) && estFeuille(n.mere) ? GC : GX) : 0);

function construireAsc(D: DonneesArbre, id: string, gen: number, o: Options, chemin: Set<string>): NA {
  const p = D.personnes.get(id);
  const n: NA = { id, sexe: p?.sex ?? 'U', gen, larg: L, x: 0 };
  if (gen < o.ascendants && !chemin.has(id)) {
    chemin.add(id);
    const { liste } = parents(D, id);
    const pere = liste.length === 2 ? liste[0] : liste.find((x) => x.sex !== 'F');
    const mere = liste.length === 2 ? liste[1] : liste.find((x) => x.sex === 'F');
    // Cases vides pour compléter les parents et grands-parents de la personne centrale
    const vide = o.casesVides && gen < 2;
    if (pere) n.pere = construireAsc(D, pere.id, gen + 1, o, chemin);
    else if (vide) n.pere = { id: null, sexe: 'M', gen: gen + 1, larg: L, x: 0 };
    if (mere) n.mere = construireAsc(D, mere.id, gen + 1, o, chemin);
    else if (vide) n.mere = { id: null, sexe: 'F', gen: gen + 1, larg: L, x: 0 };
    chemin.delete(id);
  }
  if (!estFeuille(n)) n.larg = Math.max(L, (n.pere?.larg ?? 0) + ecartParents(n) + (n.mere?.larg ?? 0));
  return n;
}

function placerAsc(n: NA, gauche: number) {
  if (estFeuille(n)) {
    n.x = gauche + (n.larg - L) / 2;
    return;
  }
  const g = ecartParents(n);
  let debut = gauche + (n.larg - ((n.pere?.larg ?? 0) + g + (n.mere?.larg ?? 0))) / 2;
  if (n.pere) { placerAsc(n.pere, debut); debut += n.pere.larg + g; }
  if (n.mere) placerAsc(n.mere, debut);
  const centres = [n.pere, n.mere].filter((x): x is NA => !!x).map((x) => x.x + L / 2);
  n.x = centres.reduce((a, b) => a + b, 0) / centres.length - L / 2;
}

// ---------- Descendants ----------
type UnionND = { union: Union; conjoint: string | null; cote: 'g' | 'd' | null; xConjoint: number; enfants: ND[]; largEnf: number };
type ND = { id: string; gen: number; unions: UnionND[]; nbGauche: number; largCartes: number; largBlocs: number; larg: number; x: number; caches: number };

function construireDesc(D: DonneesArbre, id: string, gen: number, o: Options, chemin: Set<string>): ND {
  const n: ND = { id, gen, unions: [], nbGauche: 0, largCartes: L, largBlocs: 0, larg: L, x: 0, caches: 0 };
  const unions = unionsDe(D, id);
  if (gen >= o.descendants || chemin.has(id)) {
    n.caches = unions.reduce((s, u) => s + u.enfants.length, 0);
    return n;
  }
  chemin.add(id);
  let i = 0;
  for (const u of unions) {
    // Conjoints de part et d'autre : le 1er à droite, le 2e à gauche, le 3e à droite…
    const cote = u.conjoint ? (i++ % 2 === 0 ? 'd' : 'g') : null;
    const enfants = enfantsDe(D, u.union.id).map((e) => construireDesc(D, e.p.id, gen + 1, o, chemin));
    const largEnf = enfants.reduce((s, e) => s + e.larg, 0) + GX * Math.max(0, enfants.length - 1);
    n.unions.push({ union: u.union, conjoint: u.conjoint?.id ?? null, cote, xConjoint: 0, enfants, largEnf });
  }
  chemin.delete(id);
  const nbConjoints = n.unions.filter((u) => u.conjoint).length;
  n.nbGauche = n.unions.filter((u) => u.cote === 'g').length;
  n.largCartes = (nbConjoints + 1) * L + nbConjoints * GC;
  const blocs = n.unions.filter((u) => u.enfants.length);
  n.largBlocs = blocs.reduce((s, u) => s + u.largEnf, 0) + GX * Math.max(0, blocs.length - 1);
  n.larg = Math.max(n.largCartes, n.largBlocs);
  return n;
}

/** Ordre de gauche à droite : conjoints de gauche (du plus loin au plus proche), sans conjoint, puis de droite. */
function ordreUnions(n: ND) {
  const g = n.unions.filter((u) => u.cote === 'g').reverse();
  const d = n.unions.filter((u) => u.cote === 'd');
  return [...g, ...n.unions.filter((u) => !u.cote), ...d];
}

function placerDesc(n: ND, gauche: number) {
  const cartes = gauche + (n.larg - n.largCartes) / 2;
  n.x = cartes + n.nbGauche * (L + GC);
  let g = 0, d = 0;
  for (const u of n.unions) {
    if (u.cote === 'g') u.xConjoint = n.x - ++g * (L + GC);
    if (u.cote === 'd') u.xConjoint = n.x + ++d * (L + GC);
  }
  let curseur = gauche + (n.larg - n.largBlocs) / 2;
  for (const u of ordreUnions(n)) {
    if (!u.enfants.length) continue;
    for (const e of u.enfants) {
      placerDesc(e, curseur);
      curseur += e.larg + GX;
    }
  }
}

// ---------- Traits ----------
/** Trait vertical – horizontal – vertical, aux coins arrondis. */
function coude(x1: number, y1: number, x2: number, y2: number, ym: number, r = 10) {
  if (Math.abs(x1 - x2) < 0.5) return `M${x1} ${y1}V${y2}`;
  const s = x2 > x1 ? 1 : -1;
  const rr = Math.min(r, Math.abs(x2 - x1) / 2, Math.abs(ym - y1), Math.abs(y2 - ym));
  return `M${x1} ${y1}V${ym - rr}Q${x1} ${ym} ${x1 + s * rr} ${ym}H${x2 - s * rr}Q${x2} ${ym} ${x2} ${ym + rr}V${y2}`;
}

/** Calcule toute la vue autour de `centreId`. */
export function disposer(D: DonneesArbre, centreId: string, o: Options): Disposition {
  const cartes: CarteArbre[] = [];
  const vides: CaseVide[] = [];
  const traits: Trait[] = [];

  // Descendants (et la personne centrale avec ses conjoints)
  const desc = construireDesc(D, centreId, 0, o, new Set());
  placerDesc(desc, 0);
  const emettreDesc = (n: ND) => {
    const y = n.gen * RANG;
    cartes.push({ id: n.id, x: n.x, y, gen: n.gen, role: n.gen === 0 ? 'centre' : 'descendant', descendantsCaches: n.caches || undefined });
    for (const u of n.unions) {
      let sx = n.x + L / 2, sy = y + H; // départ des traits vers les enfants
      if (u.conjoint) {
        cartes.push({ id: u.conjoint, x: u.xConjoint, y, gen: n.gen, role: 'conjoint' });
        const [a, b] = u.cote === 'd' ? [n.x + L, u.xConjoint] : [u.xConjoint + L, n.x];
        traits.push({ d: `M${a} ${y + H / 2}H${b}`, style: styleUnion(D, u.union) });
        sx = (a + b) / 2;
        sy = y + H / 2;
      }
      for (const e of u.enfants) {
        traits.push({ d: coude(sx, sy, e.x + L / 2, e.gen * RANG, e.gen * RANG - GY / 2), style: 'filiation' });
        emettreDesc(e);
      }
    }
  };
  emettreDesc(desc);

  // Ancêtres, recalés pour que la personne centrale tombe au même endroit
  const asc = construireAsc(D, centreId, 0, o, new Set());
  placerAsc(asc, 0);
  const decalage = desc.x - asc.x;
  const emettreAsc = (n: NA, enfantId: string | null) => {
    const x = n.x + decalage;
    const y = -n.gen * RANG;
    if (n.gen > 0) {
      if (n.id) {
        const aDesParents = n.gen >= o.ascendants && parents(D, n.id).liste.length > 0;
        cartes.push({ id: n.id, x, y, gen: -n.gen, role: 'ancetre', ancetresCaches: aDesParents || undefined });
      } else if (enfantId) {
        vides.push({ cle: `${enfantId}-${n.sexe}`, x, y, gen: -n.gen, enfant: enfantId, sexe: n.sexe as 'M' | 'F' });
      }
    }
    const p = n.pere, m = n.mere;
    if (!p && !m) return;
    const xp = (p?.x ?? 0) + decalage, xm = (m?.x ?? 0) + decalage;
    const yp = y - RANG;
    const style = (a?: NA) => (a && a.id ? 'filiation' : 'vide');
    if (p && m) {
      traits.push({ d: `M${xp + L} ${yp + H / 2}H${xm}`, style: p.id && m.id ? styleUnion(D, n.id ? parents(D, n.id).union : undefined) : 'vide' });
      traits.push({ d: `M${x + L / 2} ${yp + H / 2}V${y}`, style: p.id || m.id ? 'filiation' : 'vide' });
    } else {
      const seul = (p ?? m)!;
      traits.push({ d: coude(seul.x + decalage + L / 2, yp + H, x + L / 2, y, y - GY / 2), style: style(seul) });
    }
    if (n.id) {
      if (p) emettreAsc(p, n.id);
      if (m) emettreAsc(m, n.id);
    }
  };
  emettreAsc(asc, null);

  const tout = [...cartes, ...vides];
  return {
    cartes, vides, traits,
    minX: Math.min(...tout.map((c) => c.x)),
    maxX: Math.max(...tout.map((c) => c.x + L)),
    minY: Math.min(...tout.map((c) => c.y)),
    maxY: Math.max(...tout.map((c) => c.y + H)),
  };
}
