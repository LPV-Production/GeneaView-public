// Tests de la numérotation Sosa, des alertes d'incohérence et des fiches incomplètes.
import { describe, expect, it } from 'vitest';
import { DonneesArbre, type Paquet } from '../src/lib/donnees';
import { alertesDe, calculerSosa, generationSosa, intervalle, manques, toutesAlertes } from '../src/lib/analyse';

type Spec = Record<string, { sexe?: 'M' | 'F' | 'U'; n?: string; nq?: string; d?: string; dq?: string; lieu?: boolean }>;

/** Arbre de test : personnes (avec naissance / décès) et unions [p1, p2, enfants…, { mariage }]. */
function arbre(personnes: Spec, unions: (string | null | { mariage: string })[][]) {
  const p: Paquet = { persons: [], families: [], children: [], events: [], places: [{ id: 'l1', name: 'Aurillac', city: 'Aurillac', department: '', country: '', latitude: null, longitude: null }], todos: [] };
  for (const [id, x] of Object.entries(personnes)) {
    p.persons!.push({ id, given_names: id[0].toUpperCase() + id.slice(1), surname: 'Test', married_name: '', nickname: '', sex: x.sexe ?? 'U', living: 0, photo_media_id: null, occupations: '', notes: '', created_at: '', updated_at: '' });
    const ev = (type: 'birth' | 'death', t?: string, q = 'exact') =>
      t && p.events!.push({ id: `${id}-${type}`, person_id: id, family_id: null, type, date_text: t, date_qual: q as never, date_sort: null, date_sort_end: null, place_id: x.lieu ? 'l1' : null, description: '' });
    ev('birth', x.n, x.nq);
    ev('death', x.d, x.dq);
  }
  unions.forEach((u, i) => {
    const mariage = u.find((x) => x && typeof x === 'object') as { mariage: string } | undefined;
    const [a, b, ...enfants] = u.filter((x) => typeof x !== 'object' || x === null) as (string | null)[];
    p.families!.push({ id: `u${i}`, partner1_id: a, partner2_id: b, union_type: 'marriage', notes: '' });
    enfants.forEach((c, j) => p.children!.push({ family_id: `u${i}`, child_id: c!, relation: 'biological', sort_order: j }));
    if (mariage) p.events!.push({ id: `u${i}-m`, person_id: null, family_id: `u${i}`, type: 'marriage', date_text: mariage.mariage, date_qual: 'exact', date_sort: null, date_sort_end: null, place_id: null, description: '' });
  });
  return new DonneesArbre(p);
}

describe('numérotation Sosa', () => {
  const D = arbre(
    { louise: { sexe: 'F' }, henri: { sexe: 'M' }, marg: { sexe: 'F' }, joseph: { sexe: 'M' }, jeanne: { sexe: 'F' }, rose: { sexe: 'F' }, frere: {} },
    [['henri', 'marg', 'louise', 'frere'], ['joseph', 'jeanne', 'henri'], [null, 'rose', 'marg']],
  );
  it('racine 1, père 2n, mère 2n+1', () => {
    const s = calculerSosa(D, 'louise');
    expect(Object.fromEntries(s)).toEqual({ louise: [1], henri: [2], marg: [3], joseph: [4], jeanne: [5], rose: [7] });
    expect(s.has('frere')).toBe(false); // un frère n'est pas un ancêtre
  });
  it('rien sans personne racine', () => {
    expect(calculerSosa(D, null).size).toBe(0);
    expect(calculerSosa(D, 'inconnu').size).toBe(0);
  });
  it('implexe : un ancêtre commun reçoit deux numéros', () => {
    // Paul et Anne sont cousins (même grand-père Jean) ; leur enfant Léo est la racine
    const I = arbre(
      { leo: {}, paul: { sexe: 'M' }, anne: { sexe: 'F' }, pa: { sexe: 'M' }, ma: { sexe: 'F' }, jean: { sexe: 'M' } },
      [['paul', 'anne', 'leo'], ['jean', null, 'pa', 'ma'], ['pa', null, 'paul'], ['ma', null, 'anne']],
    );
    const s = calculerSosa(I, 'leo');
    expect(s.get('pa')).toEqual([4]);
    expect(s.get('ma')).toEqual([7]); // mère d'Anne (3) → 2 × 3 + 1
    expect(s.get('jean')).toEqual([8, 14]); // père de Pa (4) et de Ma (7)
  });
  it('résiste à une boucle', () => {
    const B = arbre({ a: { sexe: 'M' }, b: { sexe: 'M' } }, [['a', null, 'b'], ['b', null, 'a']]);
    expect(() => calculerSosa(B, 'a')).not.toThrow();
  });
  it('génération', () => {
    expect([1, 2, 3, 4, 7, 8, 15].map(generationSosa)).toEqual([1, 2, 2, 3, 3, 4, 4]);
  });
});

describe('dates en intervalles', () => {
  it('précision et qualificatifs', () => {
    expect(intervalle({ date_text: '1890', date_qual: 'exact' })).toEqual({ min: 1890, max: 1891 });
    expect(intervalle({ date_text: '1890', date_qual: 'about' })).toEqual({ min: 1888, max: 1893 });
    expect(intervalle({ date_text: '1890', date_qual: 'before' })).toEqual({ min: -Infinity, max: 1891 });
    expect(intervalle({ date_text: '1864 et 1868', date_qual: 'between' })).toEqual({ min: 1864, max: 1869 });
    expect(intervalle({ date_text: 'n’importe quoi', date_qual: 'exact' })).toBeNull();
  });
});

describe('alertes d’incohérence', () => {
  const codes = (D: DonneesArbre, id: string) => alertesDe(D, id, 2026.8).map((a) => a.code);
  // Pour tester une règle à la fois : sans l'alerte « plus de 110 ans » (personnes de test sans décès)
  const autres = (D: DonneesArbre, id: string) => codes(D, id).filter((c) => c !== 'trop-age');

  it('décès avant la naissance', () => {
    expect(codes(arbre({ a: { n: '1900', d: '1890' } }, []), 'a')).toEqual(['deces-avant-naissance']);
  });

  it('plus de 110 ans sans date de décès', () => {
    const D = arbre({ vieille: { sexe: 'F', n: '1893' }, jeune: { n: '1950' }, morte: { n: '1800', d: '1870' } }, []);
    expect(alertesDe(D, 'vieille', 2026.8)[0]).toMatchObject({ code: 'trop-age', message: expect.stringContaining('132 ans') });
    expect(codes(D, 'jeune')).toEqual([]);
    expect(codes(D, 'morte')).toEqual([]);
  });

  it('enfant né avant son parent, parent trop jeune ou trop âgé', () => {
    const D = arbre(
      { pere: { sexe: 'M', n: '1900' }, mere: { sexe: 'F', n: '1890' }, e1: { n: '1895' }, e2: { n: '1911' }, e3: { n: '1965' } },
      [['pere', 'mere', 'e1', 'e2', 'e3']],
    );
    expect(autres(D, 'e1')).toEqual(['ne-avant-parent', 'parent-trop-jeune']); // avant le père (1900), mère de 5 ans
    expect(autres(D, 'e2')).toEqual(['parent-trop-jeune']); // le père aurait 11 ou 12 ans (en 1912, il aurait pu en avoir 13 : pas d'alerte)
    expect(autres(D, 'e3')).toEqual(['parent-trop-age']); // la mère aurait 75 ans
  });

  it('enfant né après le décès de sa mère (mais pas de son père)', () => {
    const D = arbre({ pere: { sexe: 'M', n: '1880', d: '1910' }, mere: { sexe: 'F', n: '1885', d: '1912' }, a: { n: '1911' }, b: { n: '1914' } }, [['pere', 'mere', 'a', 'b']]);
    expect(autres(D, 'a')).toEqual([]);
    expect(autres(D, 'b')).toEqual(['ne-apres-deces-mere']);
  });

  it('mariage avant 13 ans', () => {
    const D = arbre({ a: { sexe: 'M', n: '1900' }, b: { sexe: 'F', n: '1880' } }, [['a', 'b', { mariage: '1910' }]]);
    expect(autres(D, 'a')).toEqual(['mariage-trop-jeune']);
    expect(autres(D, 'b')).toEqual([]);
  });

  it('pas de fausse alerte avec des dates incertaines', () => {
    const D = arbre(
      { pere: { sexe: 'M', n: '1878', nq: 'about' }, mere: { sexe: 'F', n: '1880', nq: 'after' }, e: { n: '1892', nq: 'about' } },
      [['pere', 'mere', 'e']],
    );
    // « vers 1878 » et « vers 1892 » : le père a pu avoir 10 à 19 ans → pas certain qu'il en ait moins de 13
    expect(autres(D, 'e')).toEqual([]);
    expect(codes(arbre({ a: { n: '1900', nq: 'about' }, }, []), 'a')).toEqual(['trop-age']);
  });

  it('toutesAlertes ne garde que les personnes concernées', () => {
    const D = arbre({ a: { n: '1900', d: '1890' }, b: { n: '1950', d: '2000' } }, []);
    expect([...toutesAlertes(D, 2026.8).keys()]).toEqual(['a']);
  });
});

describe('fiches incomplètes', () => {
  it('liste ce qui manque', () => {
    const D = arbre({ e: { n: '1900', lieu: true }, pere: { sexe: 'M' } }, [['pere', null, 'e']]);
    expect(manques(D, 'e')).toEqual(['sources']);
    expect(manques(D, 'pere')).toEqual(['date de naissance', 'lieu de naissance', 'parents', 'sources']);
  });
});
