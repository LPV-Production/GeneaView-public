// ============================================================
// Lien de parenté entre deux personnes, en français.
//
// Principe : on cherche l'ancêtre commun le plus proche. Si B est à
// gA générations de l'ancêtre du côté de A et gB du côté de B :
//   (0, 1) fils · (1, 0) père · (1, 1) frère · (2, 1) oncle · (1, 2) neveu
//   (2, 2) cousin germain · (3, 3) cousin issu de germain…
// Sans lien de sang, on essaie « par alliance » (conjoint, beau-frère,
// belle-mère, tante par alliance…).
// Le résultat dit ce que B est POUR A : « B est le grand-oncle de A ».
// ============================================================
import type { DonneesArbre, Personne } from './donnees';
import { parents, unionsDe } from './genealogie';

export type Etape = { id: string; sens: 'depart' | 'monte' | 'descend' | 'alliance' };
export type Parente = {
  terme: string; // « grand-oncle », « cousine germaine », « belle-sœur »…
  phrase: string; // « Émile Dubois est le grand-oncle de Louise Martin »
  degre: number | null; // degré en droit civil (nombre de générations jusqu'à l'ancêtre commun, des deux côtés)
  chemin: Etape[]; // de A vers B
  ancetres: string[]; // ancêtre(s) commun(s) le(s) plus proche(s)
};

const GEN_MAX = 40;

/** Tous les ancêtres d'une personne (elle-même comprise, à 0), avec la distance et l'enfant par lequel on y arrive. */
function ancetres(D: DonneesArbre, id: string) {
  const res = new Map<string, { dist: number; depuis: string | null }>([[id, { dist: 0, depuis: null }]]);
  let niveau = [id];
  for (let g = 1; g <= GEN_MAX && niveau.length; g++) {
    const suivant: string[] = [];
    for (const x of niveau) {
      for (const p of parents(D, x).liste) {
        if (res.has(p.id)) continue;
        res.set(p.id, { dist: g, depuis: x });
        suivant.push(p.id);
      }
    }
    niveau = suivant;
  }
  return res;
}

const f = (p: Personne | undefined, m: string, fe: string) => (p?.sex === 'F' ? fe : m);
const arriere = (n: number) => 'arrière-'.repeat(Math.max(0, n));

/** Ce que B est pour A, quand B est un ancêtre direct (g générations au-dessus). */
function ascendant(B: Personne | undefined, g: number) {
  if (g === 1) return f(B, 'père', 'mère');
  if (g <= 5) return `${arriere(g - 2)}${f(B, 'grand-père', 'grand-mère')}`;
  return `ancêtre (${g} générations)`;
}
function descendant(B: Personne | undefined, g: number) {
  if (g === 1) return f(B, 'fils', 'fille');
  if (g <= 5) return `${arriere(g - 2)}${f(B, 'petit-fils', 'petite-fille')}`;
  return `descendant${B?.sex === 'F' ? 'e' : ''} (${g} générations)`;
}
/** cousin germain (2), issu de germain (3), issu d'issu de germain (4)… */
function cousinage(B: Personne | undefined, n: number) {
  const e = B?.sex === 'F' ? 'e' : '';
  if (n === 2) return `cousin${e} germain${e}`;
  if (n === 3) return `cousin${e} issu${e} de germain`;
  if (n === 4) return `cousin${e} issu${e} d’issu de germain`;
  return `cousin${e} au ${n - 1}e degré`;
}

/** Terme de parenté de sang, à partir des distances gA (côté A) et gB (côté B). */
export function terme(B: Personne | undefined, gA: number, gB: number, demi = false): string {
  const d = demi ? 'demi-' : '';
  if (gA === 0 && gB === 0) return 'la même personne';
  if (gA === 0) return descendant(B, gB);
  if (gB === 0) return ascendant(B, gA);
  if (gA === 1 && gB === 1) return d + f(B, 'frère', 'sœur');
  if (gA === 1) {
    // Descendant d'un frère ou d'une sœur
    if (gB === 2) return d + f(B, 'neveu', 'nièce');
    return `${arriere(gB - 3)}${d}${f(B, 'petit-neveu', 'petite-nièce')}`;
  }
  if (gB === 1) {
    // Frère ou sœur d'un ancêtre
    if (gA === 2) return d + f(B, 'oncle', 'tante');
    return `${arriere(gA - 3)}${d}${f(B, 'grand-oncle', 'grand-tante')}`;
  }
  // Cousinage : même génération, ou décalé
  const n = Math.min(gA, gB);
  if (gA === gB) return cousinage(B, n);
  if (n === 2 && Math.abs(gA - gB) === 1) {
    // Cousin germain d'un parent / enfant d'un cousin germain
    return gA > gB ? `${f(B, 'oncle', 'tante')} à la mode de Bretagne` : `${f(B, 'neveu', 'nièce')} à la mode de Bretagne`;
  }
  const ecart = Math.abs(gA - gB);
  if (gA > gB) {
    // B est cousin d'un ancêtre de A : « cousin germain d'un grand-parent »
    const aieul = ecart === 1 ? 'parent' : `${arriere(ecart - 2)}grand-parent`;
    return `${cousinage(B, n)} d’un ${aieul}`;
  }
  // B descend d'un cousin de A : « petite-fille d'un cousin issu de germain »
  return `${descendant(B, ecart)} d’un ${cousinage(undefined, n)}`;
}

/** Lien de sang le plus proche entre A et B (ou null). */
function sang(D: DonneesArbre, a: string, b: string) {
  const ancA = ancetres(D, a);
  const ancB = ancetres(D, b);
  let meilleur: { id: string; gA: number; gB: number } | null = null;
  for (const [id, x] of ancA) {
    const y = ancB.get(id);
    if (!y) continue;
    if (!meilleur || x.dist + y.dist < meilleur.gA + meilleur.gB || (x.dist + y.dist === meilleur.gA + meilleur.gB && x.dist < meilleur.gA)) {
      meilleur = { id, gA: x.dist, gB: y.dist };
    }
  }
  if (!meilleur) return null;
  // Tous les ancêtres communs à la même distance (souvent un couple)
  const communs = [...ancA].filter(([id, x]) => x.dist === meilleur!.gA && ancB.get(id)?.dist === meilleur!.gB).map(([id]) => id);
  // Demi-frère, demi-neveu… : un seul ancêtre commun alors qu'on attendrait un couple
  const demi = communs.length === 1 && meilleur.gA >= 1 && meilleur.gB >= 1 && Math.min(meilleur.gA, meilleur.gB) === 1;
  // Chemin : de A jusqu'à l'ancêtre, puis de l'ancêtre jusqu'à B
  const monte: string[] = [];
  for (let x: string | null = meilleur.id; x; x = ancA.get(x)!.depuis) monte.unshift(x);
  const descend: string[] = [];
  for (let x: string | null = ancB.get(meilleur.id)!.depuis; x; x = ancB.get(x)!.depuis) descend.push(x);
  const chemin: Etape[] = [
    ...monte.map((id, i) => ({ id, sens: (i === 0 ? 'depart' : 'monte') as Etape['sens'] })),
    ...descend.map((id) => ({ id, sens: 'descend' as const })),
  ];
  return { ...meilleur, communs, demi, chemin };
}

const nom = (D: DonneesArbre, id: string) => {
  const p = D.personnes.get(id);
  return p ? [p.given_names.split(' ')[0], p.surname].filter(Boolean).join(' ') || 'Sans nom' : '?';
};
const article = (t: string, B?: Personne) => (/^[aeéiouyh]/i.test(t) ? 'l’' : B?.sex === 'F' ? 'la ' : 'le ');

/** Ce que B est pour A. Renvoie null si aucun lien n'est trouvé (même par alliance). */
export function lienDeParente(D: DonneesArbre, a: string, b: string): Parente | null {
  const A = D.personnes.get(a), B = D.personnes.get(b);
  if (!A || !B) return null;
  const phrase = (t: string) => `${nom(D, b)} est ${article(t, B)}${t} de ${nom(D, a)}`;

  if (a === b) return { terme: 'la même personne', phrase: 'Il s’agit de la même personne', degre: 0, chemin: [{ id: a, sens: 'depart' }], ancetres: [a] };

  const s = sang(D, a, b);
  if (s) {
    const t = terme(B, s.gA, s.gB, s.demi);
    return { terme: t, phrase: phrase(t), degre: s.gA + s.gB, chemin: s.chemin, ancetres: s.communs };
  }

  // ----- Par alliance -----
  const conjointsDe = (id: string) => unionsDe(D, id).map((u) => u.conjoint).filter((x): x is Personne => !!x);
  // B est le conjoint de A
  if (conjointsDe(a).some((c) => c.id === b)) {
    const t = f(B, 'époux', 'épouse');
    return { terme: t, phrase: phrase(t), degre: null, chemin: [{ id: a, sens: 'depart' }, { id: b, sens: 'alliance' }], ancetres: [] };
  }
  // Entre parenthèses, la phrase dit par qui passe le lien : « belle-mère (conjointe de son père, Henri Martin) »
  // n'est pas « belle-mère (mère de son conjoint, Pierre Bernard) ».
  const par = (t: string, lien: string, via: string) => `${phrase(t)} (${lien}, ${nom(D, via)})`;

  // B est le conjoint d'un parent de sang de A (beau-père, belle-sœur, tante par alliance…)
  let meilleur: Parente | null = null;
  for (const c of conjointsDe(b)) {
    const x = sang(D, a, c.id);
    if (!x) continue;
    let t: string, p: string;
    const conjoint = `${f(B, 'conjoint', 'conjointe')} de `;
    if (x.gA === 1 && x.gB === 0) p = par(t = f(B, 'beau-père', 'belle-mère'), conjoint + f(c, 'son père', 'sa mère'), c.id); // conjoint d'un parent
    else if (x.gA === 0 && x.gB === 1) p = par(t = f(B, 'gendre', 'belle-fille'), conjoint + f(c, 'son fils', 'sa fille'), c.id); // conjoint d'un enfant
    else if (x.gA === 1 && x.gB === 1) p = par(t = f(B, 'beau-frère', 'belle-sœur'), conjoint + f(c, 'son frère', 'sa sœur'), c.id); // conjoint d'un frère / d'une sœur
    else p = phrase(t = `${terme(B, x.gA, x.gB)} par alliance`);
    const r: Parente = { terme: t, phrase: p, degre: null, chemin: [...x.chemin, { id: b, sens: 'alliance' }], ancetres: x.communs };
    if (!meilleur || r.chemin.length < meilleur.chemin.length) meilleur = r;
  }
  // B est un parent de sang du conjoint de A (beaux-parents, beau-frère, beau-fils…)
  for (const c of conjointsDe(a)) {
    const x = sang(D, c.id, b);
    if (!x) continue;
    let t: string, p: string;
    const deSonConjoint = ` de ${f(c, 'son conjoint', 'sa conjointe')}`;
    if (x.gA === 1 && x.gB === 0) p = par(t = f(B, 'beau-père', 'belle-mère'), f(B, 'père', 'mère') + deSonConjoint, c.id);
    else if (x.gA === 0 && x.gB === 1) p = par(t = f(B, 'beau-fils', 'belle-fille'), f(B, 'fils', 'fille') + deSonConjoint, c.id);
    else if (x.gA === 1 && x.gB === 1) p = par(t = f(B, 'beau-frère', 'belle-sœur'), f(B, 'frère', 'sœur') + deSonConjoint, c.id);
    else p = phrase(t = `${terme(B, x.gA, x.gB)} par alliance`);
    const r: Parente = { terme: t, phrase: p, degre: null, chemin: [{ id: a, sens: 'depart' }, ...x.chemin.map((e, i) => (i === 0 ? { ...e, sens: 'alliance' as const } : e))], ancetres: x.communs };
    if (!meilleur || r.chemin.length < meilleur.chemin.length) meilleur = r;
  }
  return meilleur;
}
