// Tests de la vue en éventail (src/lib/eventail.ts).
import { describe, expect, it } from 'vitest';
import { DonneesArbre, type Paquet } from '../src/lib/donnees';
import { calculerEventail, rayons } from '../src/lib/eventail';

function arbre(personnes: Record<string, 'M' | 'F'>, unions: (string | null)[][]) {
  const p: Paquet = { persons: [], families: [], children: [], events: [], places: [], todos: [] };
  for (const [id, sex] of Object.entries(personnes)) {
    p.persons!.push({ id, given_names: id, surname: 'X', married_name: '', nickname: '', sex, living: 0, photo_media_id: null, occupations: '', notes: '', created_at: '', updated_at: '' });
  }
  unions.forEach(([a, b, ...enfants], i) => {
    p.families!.push({ id: `u${i}`, partner1_id: a, partner2_id: b, union_type: 'marriage', notes: '' });
    enfants.forEach((c, j) => p.children!.push({ family_id: `u${i}`, child_id: c!, relation: 'biological', sort_order: j }));
  });
  return new DonneesArbre(p);
}

const D = arbre({ moi: 'M', pere: 'M', mere: 'F', gpp: 'M', gmp: 'F', gpm: 'M' }, [['pere', 'mere', 'moi'], ['gpp', 'gmp', 'pere'], ['gpm', null, 'mere']]);

describe('éventail', () => {
  it('numérote les ancêtres comme le Sosa, père à gauche', () => {
    const { segments } = calculerEventail(D, 'moi', 4, false);
    expect(segments.map((s) => [s.n, s.id, s.cote])).toEqual([
      [2, 'pere', 'pat'], [3, 'mere', 'mat'], [4, 'gpp', 'pat'], [5, 'gmp', 'pat'], [6, 'gpm', 'mat'],
    ]);
  });

  it('cases « + » pour les parents inconnus de personnes connues', () => {
    const { segments } = calculerEventail(D, 'moi', 3, true);
    const vides = segments.filter((s) => !s.id).map((s) => [s.n, s.enfant, s.sexe]);
    expect(vides).toEqual([[7, 'mere', 'F'], [8, 'gpp', 'M'], [9, 'gpp', 'F'], [10, 'gmp', 'M'], [11, 'gmp', 'F'], [12, 'gpm', 'M'], [13, 'gpm', 'F']]);
  });

  it('des anneaux de plus en plus fins jusqu’à 8 générations', () => {
    const r = rayons(8);
    expect(r).toHaveLength(9);
    for (let g = 2; g <= 8; g++) expect(r[g] - r[g - 1]).toBeLessThan(r[g - 1] - r[g - 2] + 0.01);
    expect(calculerEventail(D, 'moi', 8, true).rayon).toBe(r[8]);
  });

  it('textes : nom et années près du centre, prénom seul plus loin, rien si trop petit', () => {
    const { segments } = calculerEventail(D, 'moi', 4, false);
    expect(segments.find((s) => s.n === 2)!.texte!.lignes).toEqual(['pere', 'X']);
    for (const s of segments) if (s.texte) expect(Math.abs(s.texte.rot)).toBeLessThanOrEqual(90); // jamais à l'envers
  });

  it('sans parents : éventail vide (ou cases « + » si l’on peut modifier)', () => {
    const E = arbre({ seul: 'F' }, []);
    expect(calculerEventail(E, 'seul', 5, false).segments).toEqual([]);
    expect(calculerEventail(E, 'seul', 5, true).segments.map((s) => s.n)).toEqual([2, 3]);
  });
});
