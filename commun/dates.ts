// ============================================================
// Dates incertaines — module partagé par le serveur ET l'interface.
//
// Une date est enregistrée en 4 morceaux :
//   - date_text     : le texte tel que saisi  (« 1890 », « 12/03/1890 », « 1864 et 1868 »)
//   - date_qual     : exacte, vers, avant, après, entre
//   - date_sort     : valeur triable AAAAMMJJ (00 si mois ou jour inconnu)
//   - date_sort_end : seulement pour « entre X et Y » (la valeur de Y)
//
// Formats acceptés : 1890 · 03/1890 · 12/03/1890 · 1890-03-12 · mars 1890 · 12 mars 1890 · 1er mars 1890
// ============================================================

export type Qualif = 'exact' | 'about' | 'before' | 'after' | 'between';

export const QUALIFS: { v: Qualif; label: string }[] = [
  { v: 'exact', label: 'Exacte' },
  { v: 'about', label: 'Vers' },
  { v: 'before', label: 'Avant' },
  { v: 'after', label: 'Après' },
  { v: 'between', label: 'Entre' },
];

/** Une date dont le mois (m) et le jour (d) peuvent être inconnus (0). */
export type DatePartielle = { y: number; m: number; d: number };

export type DateAnalysee = { date_text: string; date_qual: Qualif; date_sort: number | null; date_sort_end: number | null };

export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const MOIS_SIMPLES = MOIS.map(sansAccents);

/** « mars » → 3, « sept. » → 9, « fev » → 2. Une abréviation ambiguë (« jui ») est refusée. */
function moisDepuisNom(nom: string): number {
  const n = sansAccents(nom.replace(/\.$/, ''));
  if (n.length < 3) return 0;
  const exact = MOIS_SIMPLES.indexOf(n);
  if (exact >= 0) return exact + 1;
  const trouves = MOIS_SIMPLES.flatMap((m, i) => (m.startsWith(n) ? [i + 1] : []));
  return trouves.length === 1 ? trouves[0] : 0;
}

const joursDansMois = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function valider(y: number, m: number, d: number): DatePartielle | null {
  if (!Number.isInteger(y) || y < 1 || y > 2200) return null;
  if (m < 0 || m > 12 || (m === 0 && d !== 0)) return null;
  if (d < 0 || (m && d > joursDansMois(y, m))) return null;
  return { y, m, d };
}

/** Lit une date saisie. Renvoie null si le texte n'est pas compris. */
export function lireDate(texte: string): DatePartielle | null {
  const s = texte.trim().toLowerCase().replace(/\s+/g, ' ');
  let r: RegExpMatchArray | null;
  if ((r = s.match(/^(\d{1,4})$/))) return valider(+r[1], 0, 0);
  // Un mois ou un jour tapé en chiffres vaut au moins 1 (« 00/1890 » n'a pas de sens)
  if ((r = s.match(/^(\d{1,2})[/.-](\d{3,4})$/))) return +r[1] ? valider(+r[2], +r[1], 0) : null;
  if ((r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{3,4})$/))) return +r[1] && +r[2] ? valider(+r[3], +r[2], +r[1]) : null;
  if ((r = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/))) return +r[2] && (!r[3] || +r[3]) ? valider(+r[1], +r[2], r[3] ? +r[3] : 0) : null;
  if ((r = s.match(/^(?:(\d{1,2})(?:er)? )?([\p{L}.]+) (\d{3,4})$/u))) {
    const m = moisDepuisNom(r[2]);
    return m ? valider(+r[3], m, r[1] ? +r[1] : 0) : null;
  }
  return null;
}

export const valeurTri = (d: DatePartielle) => d.y * 10000 + d.m * 100 + d.d;

/** Sépare « 1864 et 1868 » en deux morceaux. */
const separerEntre = (texte: string) => texte.split(/\s+et\s+/i).map((s) => s.trim());

/**
 * Vérifie une date saisie et calcule ses valeurs triables.
 * Lève une erreur (avec un message en français) si la date n'est pas comprise.
 */
export function analyserDate(qual: Qualif, texte: string): DateAnalysee {
  const t = texte.trim().replace(/\s+/g, ' ');
  if (!QUALIFS.some((q) => q.v === qual)) throw new Error('Précision de date inconnue');
  if (!t) return { date_text: '', date_qual: 'exact', date_sort: null, date_sort_end: null };
  if (t.length > 60) throw new Error('Date trop longue');
  if (qual === 'between') {
    const morceaux = separerEntre(t);
    if (morceaux.length !== 2) throw new Error('Pour « entre », indiquez deux dates, par exemple : 1864 et 1868');
    const [a, b] = morceaux.map(lireDate);
    if (!a || !b) throw new Error(`Date non comprise : « ${t} »`);
    if (valeurTri(a) > valeurTri(b)) throw new Error('La première date doit être avant la seconde');
    return { date_text: `${morceaux[0]} et ${morceaux[1]}`, date_qual: qual, date_sort: valeurTri(a), date_sort_end: valeurTri(b) };
  }
  const d = lireDate(t);
  if (!d) throw new Error(`Date non comprise : « ${t} ». Exemples : 1890, 03/1890, 12/03/1890, 12 mars 1890`);
  return { date_text: t, date_qual: qual, date_sort: valeurTri(d), date_sort_end: null };
}

/** 12 mars 1890 · mars 1890 · 1890 */
export function ecrireDate(d: DatePartielle) {
  if (d.d) return `${d.d === 1 ? '1er' : d.d} ${MOIS[d.m - 1]} ${d.y}`;
  if (d.m) return `${MOIS[d.m - 1]} ${d.y}`;
  return String(d.y);
}

type AvecDate = { date_text: string; date_qual: Qualif | string };

/** Date en toutes lettres : « vers 1890 », « entre 1864 et 1868 », « 12 mars 1962 ». */
export function afficherDate(e: AvecDate): string {
  if (!e.date_text) return '';
  if (e.date_qual === 'between') {
    const [a, b] = separerEntre(e.date_text).map(lireDate);
    return a && b ? `entre ${ecrireDate(a)} et ${ecrireDate(b)}` : e.date_text;
  }
  const d = lireDate(e.date_text);
  const txt = d ? ecrireDate(d) : e.date_text; // texte non compris (ex. import) : affiché tel quel
  const prefixe = { about: 'vers ', before: 'avant ', after: 'après ' }[e.date_qual as string] ?? '';
  return prefixe + txt;
}

/** Année seule, pour les cartes et les listes : « v. 1890 », « av. 1875 », « 1864/1868 ». */
export function anneeCourte(e: AvecDate | undefined | null): string {
  if (!e?.date_text) return '';
  if (e.date_qual === 'between') {
    const [a, b] = separerEntre(e.date_text).map(lireDate);
    return a && b ? (a.y === b.y ? String(a.y) : `${a.y}/${b.y}`) : e.date_text;
  }
  const d = lireDate(e.date_text);
  if (!d) return e.date_text;
  const prefixe = { about: 'v. ', before: 'av. ', after: 'ap. ' }[e.date_qual as string] ?? '';
  return prefixe + d.y;
}

/** La date est-elle approximative (qualificatif, ou jour / mois inconnu) ? */
export function estApproximative(e: AvecDate) {
  if (e.date_qual !== 'exact') return true;
  const d = lireDate(e.date_text);
  return !d || !d.d;
}

/**
 * Âge entre deux dates (ex. naissance → décès, ou naissance → aujourd'hui).
 * Renvoie le nombre d'années et s'il est approximatif, ou null si incalculable.
 */
export function age(debut: AvecDate | undefined | null, fin: AvecDate | DatePartielle | undefined | null): { ans: number; approx: boolean } | null {
  if (!debut?.date_text || !fin) return null;
  const point = (e: AvecDate): DatePartielle | null => {
    if (e.date_qual === 'between') {
      const [a, b] = separerEntre(e.date_text).map(lireDate);
      return a && b ? { y: Math.round((a.y + b.y) / 2), m: 0, d: 0 } : null;
    }
    return lireDate(e.date_text);
  };
  const a = point(debut);
  const b = 'y' in fin ? fin : point(fin);
  if (!a || !b) return null;
  let ans = b.y - a.y;
  const precis = a.m && b.m && a.d && b.d;
  if (precis && (b.m < a.m || (b.m === a.m && b.d < a.d))) ans -= 1;
  const approx = !precis || debut.date_qual !== 'exact' || ('date_qual' in fin && fin.date_qual !== 'exact');
  return ans < 0 ? null : { ans, approx };
}

/** Date du jour sous forme de DatePartielle. */
export function aujourdhui(): DatePartielle {
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() };
}
