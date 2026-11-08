// Tests des dates incertaines (module partagé commun/dates.ts).
import { describe, expect, it } from 'vitest';
import { afficherDate, age, analyserDate, anneeCourte, estApproximative, lireDate } from '../commun/dates';
import { datePhrase } from '../src/lib/genealogie';

describe('lireDate', () => {
  it.each([
    ['1890', { y: 1890, m: 0, d: 0 }],
    ['03/1890', { y: 1890, m: 3, d: 0 }],
    ['3.1890', { y: 1890, m: 3, d: 0 }],
    ['12/03/1890', { y: 1890, m: 3, d: 12 }],
    ['12-3-1890', { y: 1890, m: 3, d: 12 }],
    ['1890-03-12', { y: 1890, m: 3, d: 12 }],
    ['mars 1890', { y: 1890, m: 3, d: 0 }],
    ['12 mars 1890', { y: 1890, m: 3, d: 12 }],
    ['1er Août 1914', { y: 1914, m: 8, d: 1 }],
    ['  2   FÉVRIER   1901 ', { y: 1901, m: 2, d: 2 }],
    ['sept. 1915', { y: 1915, m: 9, d: 0 }],
    ['fev 1850', { y: 1850, m: 2, d: 0 }],
    ['29/02/1904', { y: 1904, m: 2, d: 29 }],
    ['987', { y: 987, m: 0, d: 0 }],
  ])('comprend « %s »', (texte, attendu) => {
    expect(lireDate(texte)).toEqual(attendu);
  });

  it.each(['', 'demain', '31/02/1890', '29/02/1900', '13/1890', '00/1890', '12/03/90', 'jui 1890', '3000', 'mars', '1890 mars'])(
    'refuse « %s »',
    (texte) => {
      expect(lireDate(texte)).toBeNull();
    },
  );
});

describe('analyserDate', () => {
  it('calcule une valeur triable AAAAMMJJ, avec 00 pour l’inconnu', () => {
    expect(analyserDate('exact', '12/03/1890')).toEqual({ date_text: '12/03/1890', date_qual: 'exact', date_sort: 18900312, date_sort_end: null });
    expect(analyserDate('about', ' 1890 ').date_sort).toBe(18900000);
    expect(analyserDate('before', 'mars 1890').date_sort).toBe(18900300);
  });

  it('garde le texte tel que saisi', () => {
    expect(analyserDate('exact', '12 mars 1890').date_text).toBe('12 mars 1890');
  });

  it('« entre » : deux dates dans l’ordre', () => {
    expect(analyserDate('between', '1864 et  1868')).toEqual({ date_text: '1864 et 1868', date_qual: 'between', date_sort: 18640000, date_sort_end: 18680000 });
    expect(() => analyserDate('between', '1868 et 1864')).toThrow(/avant la seconde/);
    expect(() => analyserDate('between', '1864')).toThrow(/deux dates/);
  });

  it('date vide : rien à trier', () => {
    expect(analyserDate('about', '  ')).toEqual({ date_text: '', date_qual: 'exact', date_sort: null, date_sort_end: null });
  });

  it('refuse une date incompréhensible avec un message d’aide', () => {
    expect(() => analyserDate('exact', 'printemps 1890')).toThrow(/Exemples/);
    expect(() => analyserDate('peut-être' as never, '1890')).toThrow();
  });

  it('trie correctement les dates de précisions différentes', () => {
    const tri = ['12/03/1890', '1890', '03/1890', '01/01/1891', '1889'].map((t) => analyserDate('exact', t).date_sort!);
    expect([...tri].sort((a, b) => a - b)).toEqual([18890000, 18900000, 18900300, 18900312, 18910101]);
  });
});

describe('affichage', () => {
  it('en toutes lettres', () => {
    expect(afficherDate({ date_text: '12/03/1962', date_qual: 'exact' })).toBe('12 mars 1962');
    expect(afficherDate({ date_text: '01/08/1914', date_qual: 'exact' })).toBe('1er août 1914');
    expect(afficherDate({ date_text: '1890', date_qual: 'about' })).toBe('vers 1890');
    expect(afficherDate({ date_text: '03/1890', date_qual: 'after' })).toBe('après mars 1890');
    expect(afficherDate({ date_text: '1864 et 1868', date_qual: 'between' })).toBe('entre 1864 et 1868');
    expect(afficherDate({ date_text: 'ABT 1890 (GEDCOM)', date_qual: 'exact' })).toBe('ABT 1890 (GEDCOM)');
    expect(afficherDate({ date_text: '', date_qual: 'exact' })).toBe('');
  });

  it('année courte pour les cartes', () => {
    expect(anneeCourte({ date_text: '1890', date_qual: 'about' })).toBe('v. 1890');
    expect(anneeCourte({ date_text: '12/03/1962', date_qual: 'exact' })).toBe('1962');
    expect(anneeCourte({ date_text: '1875', date_qual: 'before' })).toBe('av. 1875');
    expect(anneeCourte({ date_text: '1864 et 1868', date_qual: 'between' })).toBe('1864/1868');
    expect(anneeCourte(undefined)).toBe('');
  });

  it('repère les dates approximatives', () => {
    expect(estApproximative({ date_text: '12/03/1890', date_qual: 'exact' })).toBe(false);
    expect(estApproximative({ date_text: '1890', date_qual: 'exact' })).toBe(true);
    expect(estApproximative({ date_text: '12/03/1890', date_qual: 'about' })).toBe(true);
  });
});

describe('âge', () => {
  const ex = (t: string, q = 'exact') => ({ date_text: t, date_qual: q });
  it('exact, en tenant compte du jour anniversaire', () => {
    expect(age(ex('12/03/1890'), ex('11/03/1962'))).toEqual({ ans: 71, approx: false });
    expect(age(ex('12/03/1890'), ex('12/03/1962'))).toEqual({ ans: 72, approx: false });
  });
  it('approximatif si une date est incertaine ou incomplète', () => {
    expect(age(ex('1890', 'about'), ex('12/03/1962'))).toEqual({ ans: 72, approx: true });
    expect(age(ex('1864 et 1868', 'between'), ex('1932'))).toEqual({ ans: 66, approx: true });
  });
  it('par rapport à aujourd’hui', () => {
    expect(age(ex('20/10/1952'), { y: 2026, m: 10, d: 20 })).toEqual({ ans: 74, approx: false });
    expect(age(ex('21/10/1952'), { y: 2026, m: 10, d: 20 })).toEqual({ ans: 73, approx: false });
  });
  it('incalculable sans date ou si la fin précède le début', () => {
    expect(age(ex(''), ex('1962'))).toBeNull();
    expect(age(ex('1962'), ex('1890'))).toBeNull();
  });
});

describe('date avec préposition (affichage)', () => {
  const ev = (t: string, q = 'exact') => ({ date_text: t, date_qual: q }) as Parameters<typeof datePhrase>[0];
  it.each([
    ['20/10/1952', 'exact', 'le 20 octobre 1952'],
    ['01/08/1914', 'exact', 'le 1er août 1914'],
    ['03/1890', 'exact', 'en mars 1890'],
    ['1952', 'exact', 'en 1952'],
    ['1890', 'about', 'vers 1890'],
    ['1864 et 1868', 'between', 'entre 1864 et 1868'],
  ])('%s (%s) → %s', (t, q, attendu) => expect(datePhrase(ev(t, q))).toBe(attendu));
});
