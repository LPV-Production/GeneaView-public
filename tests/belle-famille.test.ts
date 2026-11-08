// Tests de la belle-famille, de la fin des unions et des demi-frères (src/lib/genealogie.ts),
// et des précisions « par qui » du lien de parenté par alliance (src/lib/parente.ts).
import { describe, expect, it } from 'vitest';
import { DonneesArbre, type Paquet } from '../src/lib/donnees';
import { belleFamille, finUnion, fratrie, texteFin } from '../src/lib/genealogie';
import { lienDeParente } from '../src/lib/parente';

// pere × mere → moi, soeur ; pere × belledoche (2e union) → demifrere
// moi × epouse → fils ; epouse × exmari (union précédente, divorcée) → beaufils
// beaupere × bellemere → epouse, beausoeur ; soeur × beaufrere ; fils × bru
const SEXES: Record<string, 'M' | 'F'> = {
  pere: 'M', mere: 'F', belledoche: 'F', moi: 'M', soeur: 'F', demifrere: 'M', epouse: 'F', exmari: 'M', beaufils: 'M',
  beaupere: 'M', bellemere: 'F', beausoeur: 'F', beaufrere: 'M', fils: 'M', bru: 'F',
};
const UNIONS: [string, string, string[], Partial<{ end_type: 'divorce'; union_type: 'liaison' }>?][] = [
  ['pere', 'mere', ['moi', 'soeur']],
  ['pere', 'belledoche', ['demifrere']],
  ['moi', 'epouse', ['fils']],
  ['exmari', 'epouse', ['beaufils'], { end_type: 'divorce' }],
  ['beaupere', 'bellemere', ['epouse', 'beausoeur']],
  ['soeur', 'beaufrere', []],
  ['fils', 'bru', []],
];
function arbre(deces: Record<string, string> = {}) {
  const p: Paquet = { persons: [], families: [], children: [], events: [], places: [], todos: [] };
  for (const [id, sex] of Object.entries(SEXES)) {
    p.persons!.push({ id, given_names: id, surname: '', married_name: '', nickname: '', sex, living: 0, photo_media_id: null, occupations: '', notes: '', created_at: '', updated_at: '' });
  }
  UNIONS.forEach(([a, b, enfants, extra], i) => {
    p.families!.push({ id: `u${i}`, partner1_id: a, partner2_id: b, union_type: 'marriage', notes: '', ...extra });
    enfants.forEach((c, j) => p.children!.push({ family_id: `u${i}`, child_id: c, relation: 'biological', sort_order: j }));
  });
  for (const [id, annee] of Object.entries(deces)) {
    p.events!.push({ id: `d-${id}`, person_id: id, family_id: null, type: 'death', date_text: annee, date_qual: 'exact', date_sort: Number(annee) * 10000, date_sort_end: null, place_id: null, description: '' });
  }
  return new DonneesArbre(p);
}

describe('belle-famille', () => {
  const D = arbre();
  const groupes = Object.fromEntries(belleFamille(D, 'moi').groupes.map((g) => [g.titre, g.liste.map((a) => `${a.p.id}:${a.role}:${a.via.id}`)]));

  it('range chacun dans le bon groupe, avec la personne par qui passe le lien', () => {
    expect(groupes).toEqual({
      'Beaux-parents': ['beaupere:beau-père:epouse', 'bellemere:belle-mère:epouse'],
      'Conjoints de ses parents': ['belledoche:belle-mère:pere'],
      'Beaux-frères et belles-sœurs': ['beausoeur:belle-sœur:epouse', 'beaufrere:beau-frère:soeur'],
      'Enfants de son conjoint': ['beaufils:beau-fils:epouse'],
      'Gendres et belles-filles': ['bru:belle-fille:fils'],
    });
  });

  it('ne range pas la famille de sang (demi-frère, enfants) dans la belle-famille', () => {
    const tous = Object.values(groupes).flat().join(' ');
    expect(tous).not.toMatch(/(^| )(demifrere|fils|soeur|mere|pere):/);
  });

  it('propose d’ajouter les parents manquants des conjoints', () => {
    expect(belleFamille(D, 'fils').manquants.map((p) => p.id)).toEqual(['bru']);
    expect(belleFamille(D, 'moi').manquants).toEqual([]);
  });

  it('un demi-frère indique le parent en commun', () => {
    const d = fratrie(D, 'moi').find((f) => f.p.id === 'demifrere')!;
    expect([d.demi, d.commun?.id]).toEqual([true, 'pere']);
  });
});

describe('fin des unions', () => {
  it('divorce indiqué, veuvage calculé du point de vue du survivant', () => {
    const D = arbre({ moi: '2001' });
    expect(texteFin(D, D.unions.get('u3')!, 'epouse')).toBe('Divorcés');
    expect(finUnion(D, D.unions.get('u2')!)).toMatchObject({ type: 'veuvage', decede: { id: 'moi' } });
    expect(texteFin(D, D.unions.get('u2')!, 'epouse')).toBe('Veuve · 2001');
    expect(texteFin(D, D.unions.get('u2')!, 'moi')).toBe('');
    // Le premier des deux à mourir met fin à l'union
    const D2 = arbre({ pere: '1990', mere: '1980' });
    expect(texteFin(D2, D2.unions.get('u0')!, 'pere')).toBe('Veuf · 1980');
  });
});

describe('parenté par alliance : par qui ?', () => {
  const D = arbre();
  it('distingue la belle-mère « conjointe du père » de la belle-mère « mère de l’épouse »', () => {
    expect(lienDeParente(D, 'moi', 'belledoche')?.phrase).toBe('belledoche est la belle-mère de moi (conjointe de son père, pere)');
    expect(lienDeParente(D, 'moi', 'bellemere')?.phrase).toBe('bellemere est la belle-mère de moi (mère de sa conjointe, epouse)');
    expect(lienDeParente(D, 'moi', 'bellemere')?.terme).toBe('belle-mère');
  });
});
