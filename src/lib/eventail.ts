// ============================================================
// Vue en éventail des ascendants (4 à 8 générations).
// La personne au centre, ses parents sur le premier anneau, ses
// grands-parents sur le deuxième, etc. Côté gauche : lignée paternelle,
// côté droit : lignée maternelle. Chaque case porte le numéro Sosa
// relatif à la personne du centre (père = 2, mère = 3…).
// ============================================================
import type { DonneesArbre } from './donnees';
import { anneeCourte } from '../../commun/dates';
import { deces, naissance, parents } from './genealogie';

export const OUVERTURE = 240; // degrés couverts par l'éventail
const DEBUT = -90 - OUVERTURE / 2;
const EPAISSEURS = [0, 82, 76, 70, 64, 58, 52, 48, 44]; // épaisseur de chaque anneau (génération 1 à 8)
export const RAYON_CENTRE = 72;

export type Segment = {
  n: number; // numéro dans l'éventail (2 = père, 3 = mère, 4 = grand-père paternel…)
  gen: number;
  id: string | null; // null = ancêtre inconnu (case « + »)
  enfant: string | null; // la personne dont c'est le parent (pour ajouter un parent inconnu)
  sexe: 'M' | 'F';
  cote: 'pat' | 'mat';
  d: string; // tracé SVG
  texte: { x: number; y: number; rot: number; lignes: string[]; taille: number } | null;
};

/** Rayons des anneaux : rayons[g] = rayon extérieur de la génération g (rayons[0] = disque central). */
export function rayons(gens: number) {
  const r = [RAYON_CENTRE];
  for (let g = 1; g <= gens; g++) r.push(r[g - 1] + EPAISSEURS[g]);
  return r;
}

const rad = (a: number) => (a * Math.PI) / 180;
const pt = (r: number, a: number) => [r * Math.cos(rad(a)), r * Math.sin(rad(a))].map((v) => v.toFixed(1)).join(' ');
const arc = (r0: number, r1: number, a0: number, a1: number) => {
  const grand = a1 - a0 > 180 ? 1 : 0;
  return `M${pt(r1, a0)}A${r1} ${r1} 0 ${grand} 1 ${pt(r1, a1)}L${pt(r0, a1)}A${r0} ${r0} 0 ${grand} 0 ${pt(r0, a0)}Z`;
};

/** Numérotation des ancêtres à partir du centre (premier chemin seulement). */
function numeros(D: DonneesArbre, centre: string, gens: number) {
  const m = new Map<number, string>([[1, centre]]);
  const vus = new Set([centre]);
  for (let n = 1; n < 2 ** gens; n++) {
    const id = m.get(n);
    if (!id) continue;
    const { liste } = parents(D, id);
    const pere = liste.length === 2 ? liste[0] : liste.find((x) => x.sex !== 'F');
    const mere = liste.length === 2 ? liste[1] : liste.find((x) => x.sex === 'F');
    for (const [p, k] of [[pere, 2 * n], [mere, 2 * n + 1]] as const) {
      if (!p || vus.has(p.id + ':' + k)) continue;
      vus.add(p.id + ':' + k);
      m.set(k, p.id);
    }
  }
  return m;
}

export function calculerEventail(D: DonneesArbre, centre: string, gens: number, casesVides: boolean): { segments: Segment[]; rayon: number } {
  const R = rayons(gens);
  const nums = numeros(D, centre, gens);
  const segments: Segment[] = [];
  for (let g = 1; g <= gens; g++) {
    const nb = 2 ** g;
    const pas = OUVERTURE / nb;
    for (let i = 0; i < nb; i++) {
      const n = nb + i;
      const id = nums.get(n) ?? null;
      const enfant = nums.get(n >> 1) ?? null;
      if (!id && (!enfant || !casesVides)) continue; // rien à montrer
      const a0 = DEBUT + i * pas, a1 = a0 + pas;
      const m = (a0 + a1) / 2, rm = (R[g - 1] + R[g]) / 2;
      const [x, y] = pt(rm, m).split(' ').map(Number);
      const taille = [0, 13, 12, 11, 10.5, 10, 9, 8, 7][g];
      // Place disponible : le long de l'arc (anneaux intérieurs) ou le long du rayon (anneaux extérieurs)
      const longueurArc = rm * rad(pas);
      const radial = g >= 4;
      let texte: Segment['texte'] = null;
      if (longueurArc > taille * 1.6) {
        let lignes: string[];
        if (!id) lignes = ['+'];
        else {
          const p = D.personnes.get(id)!;
          const prenom = p.given_names.split(' ')[0] || '?';
          const ans = [anneeCourte(naissance(D, id)), anneeCourte(deces(D, id))].filter(Boolean).join('–');
          if (g <= 2) lignes = [prenom, p.surname, ans].filter(Boolean);
          else if (g === 3) lignes = [prenom, p.surname].filter(Boolean);
          else if (g <= 5 && longueurArc > taille * 2.8) lignes = [prenom, p.surname].filter(Boolean);
          else lignes = [prenom];
          // On coupe ce qui ne tient pas
          const max = Math.floor((radial ? EPAISSEURS[g] - 6 : longueurArc - 6) / (taille * 0.58));
          lignes = lignes.map((l) => (l.length > max ? l.slice(0, Math.max(1, max - 1)) + '…' : l));
        }
        let rot = radial ? m : m + 90;
        if (rot > 90) rot -= 180;
        if (rot < -90) rot += 180;
        texte = { x, y, rot, lignes, taille };
      }
      segments.push({
        n, gen: g, id, enfant, sexe: n % 2 === 0 ? 'M' : 'F',
        cote: i < nb / 2 ? 'pat' : 'mat',
        d: arc(R[g - 1] + 1, R[g], a0 + 0.15, a1 - 0.15),
        texte,
      });
    }
  }
  return { segments, rayon: R[gens] };
}
