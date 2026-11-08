// Tests du calcul du lien de parenté (src/lib/parente.ts).
import { describe, expect, it } from 'vitest';
import { DonneesArbre, type Paquet } from '../src/lib/donnees';
import { lienDeParente, terme } from '../src/lib/parente';

function arbre(personnes: Record<string, 'M' | 'F'>, unions: (string | null)[][]) {
  const p: Paquet = { persons: [], families: [], children: [], events: [], places: [], todos: [] };
  for (const [id, sex] of Object.entries(personnes)) {
    p.persons!.push({ id, given_names: id[0].toUpperCase() + id.slice(1), surname: '', married_name: '', nickname: '', sex, living: 0, photo_media_id: null, occupations: '', notes: '', created_at: '', updated_at: '' });
  }
  unions.forEach(([a, b, ...enfants], i) => {
    p.families!.push({ id: `u${i}`, partner1_id: a, partner2_id: b, union_type: 'marriage', notes: '' });
    enfants.forEach((c, j) => p.children!.push({ family_id: `u${i}`, child_id: c!, relation: 'biological', sort_order: j }));
  });
  return new DonneesArbre(p);
}

// Une grande famille sur 5 générations :
//                 bisaieul × bisaieule
//               /                      \
//       grandpere × grandmere         grandoncle × grandtante
//        /                \                  |
//   pere × mere         oncle × tante      cousinp (cousin du père)
//    /    \               |                  |
//  moi   soeur          cousine            cousin2 (issu de germain)
//   |      |              |                  |
// fils   neveu          petitcousin         cousin3
//   |
// petitfils
const P = {
  bisaieul: 'M', bisaieule: 'F', grandpere: 'M', grandmere: 'F', grandoncle: 'M', grandtante: 'F',
  pere: 'M', mere: 'F', oncle: 'M', tante: 'F', cousinp: 'M', moi: 'M', soeur: 'F', cousine: 'F', cousin2: 'M',
  fils: 'M', neveu: 'M', petitcousin: 'M', cousin3: 'F', petitfils: 'M', epouse: 'F', beaufrere: 'M', demisoeur: 'F', autrefemme: 'F',
} as const;
const D = arbre(P, [
  ['bisaieul', 'bisaieule', 'grandpere', 'grandoncle'],
  ['grandpere', 'grandmere', 'pere', 'oncle'],
  ['grandoncle', 'grandtante', 'cousinp'],
  ['pere', 'mere', 'moi', 'soeur'],
  ['pere', 'autrefemme', 'demisoeur'],
  ['oncle', 'tante', 'cousine'],
  ['cousinp', null, 'cousin2'],
  ['moi', 'epouse', 'fils'],
  ['soeur', 'beaufrere', 'neveu'],
  ['cousine', null, 'petitcousin'],
  ['cousin2', null, 'cousin3'],
  ['fils', null, 'petitfils'],
]);
const lien = (b: string, a = 'moi') => lienDeParente(D, a, b)?.terme;

describe('liens de sang', () => {
  it.each([
    ['pere', 'père'], ['mere', 'mère'], ['grandpere', 'grand-père'], ['bisaieule', 'arrière-grand-mère'],
    ['fils', 'fils'], ['petitfils', 'petit-fils'],
    ['soeur', 'sœur'], ['demisoeur', 'demi-sœur'], ['neveu', 'neveu'],
    ['oncle', 'oncle'], ['grandoncle', 'grand-oncle'], ['grandtante', undefined],
    ['cousine', 'cousine germaine'], ['cousin2', 'cousin issu de germain'], ['cousin3', 'fille d’un cousin issu de germain'], // une génération en dessous de moi
    ['cousinp', 'oncle à la mode de Bretagne'], ['petitcousin', 'neveu à la mode de Bretagne'],
  ])('%s est « %s » de moi', (b, attendu) => {
    if (attendu === undefined) return; // la grand-tante par alliance est testée plus bas
    expect(lien(b)).toBe(attendu);
  });

  it('dans l’autre sens', () => {
    expect(lien('moi', 'pere')).toBe('fils');
    expect(lien('moi', 'grandoncle')).toBe('petit-neveu');
    expect(lien('soeur', 'neveu')).toBe('mère');
  });

  it('phrase, degré et chemin', () => {
    const r = lienDeParente(D, 'moi', 'cousine')!;
    expect(r.phrase).toBe('Cousine est la cousine germaine de Moi');
    expect(r.degre).toBe(4);
    expect(r.chemin.map((e) => `${e.sens}:${e.id}`)).toEqual(['depart:moi', 'monte:pere', 'monte:grandpere', 'descend:oncle', 'descend:cousine']);
    expect(r.ancetres.sort()).toEqual(['grandmere', 'grandpere']);
  });

  it('termes généraux', () => {
    expect(terme(undefined, 3, 0)).toBe('arrière-grand-père');
    expect(terme(undefined, 5, 0)).toBe('arrière-arrière-arrière-grand-père');
    expect(terme(undefined, 9, 0)).toBe('ancêtre (9 générations)');
    expect(terme(undefined, 4, 1)).toBe('arrière-grand-oncle');
    expect(terme(undefined, 1, 4)).toBe('arrière-petit-neveu');
    expect(terme(undefined, 5, 5)).toBe('cousin au 4e degré');
    expect(terme(undefined, 4, 3)).toBe('cousin issu de germain d’un parent');
    expect(terme(undefined, 4, 2)).toBe('cousin germain d’un grand-parent');
    expect(terme(undefined, 2, 4)).toBe('petit-fils d’un cousin germain');
  });
});

describe('liens par alliance', () => {
  it.each([
    ['epouse', 'moi', 'épouse'],
    ['beaufrere', 'moi', 'beau-frère'], // conjoint de ma sœur
    ['epouse', 'pere', 'belle-fille'], // conjointe de son fils
    ['mere', 'epouse', 'belle-mère'], // mère de son conjoint
    ['soeur', 'epouse', 'belle-sœur'], // sœur de son conjoint
    ['tante', 'moi', 'tante par alliance'],
    ['grandtante', 'moi', 'grand-tante par alliance'],
    ['autrefemme', 'moi', 'belle-mère'], // autre épouse de mon père
  ])('%s est « %s » de %s', (b, a, attendu) => {
    expect(lien(b, a)).toBe(attendu);
  });
  it('aucun lien', () => {
    const E = arbre({ a: 'M', b: 'F' }, []);
    expect(lienDeParente(E, 'a', 'b')).toBeNull();
  });
  it('résiste à une boucle', () => {
    const B = arbre({ a: 'M', b: 'M' }, [['a', null, 'b'], ['b', null, 'a']]);
    expect(() => lienDeParente(B, 'a', 'b')).not.toThrow();
  });
});
