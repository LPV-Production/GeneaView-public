// Tests de la disposition de la vue arbre (src/lib/disposition.ts).
import { describe, expect, it } from 'vitest';
import { DonneesArbre, type Paquet } from '../src/lib/donnees';
import { disposer, H, L, type Disposition } from '../src/lib/disposition';

/** Petit constructeur d'arbre de test : personnes, unions [p1, p2, enfants…]. */
function arbre(personnes: Record<string, 'M' | 'F' | 'U'>, unions: [string | null, string | null, ...string[]][]) {
  const p: Paquet = { persons: [], families: [], children: [], events: [], places: [], todos: [] };
  for (const [id, sex] of Object.entries(personnes)) {
    p.persons.push({ id, given_names: id, surname: '', married_name: '', nickname: '', sex, living: 0, photo_media_id: null, occupations: '', notes: '', created_at: '', updated_at: '' });
  }
  unions.forEach(([a, b, ...enfants], i) => {
    p.families.push({ id: `u${i}`, partner1_id: a, partner2_id: b, union_type: 'marriage', notes: '' });
    enfants.forEach((c, j) => p.children.push({ family_id: `u${i}`, child_id: c, relation: 'biological', sort_order: j }));
  });
  return new DonneesArbre(p);
}

const carte = (d: Disposition, id: string) => d.cartes.find((c) => c.id === id)!;
const centre = (c: { x: number }) => c.x + L / 2;
const opts = { ascendants: 3, descendants: 2, casesVides: false };

/** Aucune carte ne doit en chevaucher une autre sur la même ligne. */
function sansChevauchement(d: Disposition) {
  const lignes = new Map<number, { x: number }[]>();
  for (const c of [...d.cartes, ...d.vides]) lignes.set(c.y, [...(lignes.get(c.y) ?? []), c]);
  for (const l of lignes.values()) {
    l.sort((a, b) => a.x - b.x);
    for (let i = 1; i < l.length; i++) expect(l[i].x - l[i - 1].x).toBeGreaterThanOrEqual(L - 0.01);
  }
}

// Famille de la maquette : Joseph × Jeanne → Henri ; Émile × Rose → Marguerite ;
// Henri × Marguerite → Louise ; Louise × Pierre → Claire, Thomas ; Claire → Léa ; Thomas → Hugo
const famille = () =>
  arbre(
    { joseph: 'M', jeanne: 'F', emile: 'M', rose: 'F', henri: 'M', marguerite: 'F', louise: 'F', pierre: 'M', claire: 'F', thomas: 'M', lea: 'F', hugo: 'M', antoine: 'M' },
    [['joseph', 'jeanne', 'henri'], ['emile', 'rose', 'marguerite'], ['henri', 'marguerite', 'louise'], ['louise', 'pierre', 'claire', 'thomas'], ['claire', null, 'lea'], ['thomas', null, 'hugo'], ['antoine', null, 'joseph']],
  );

describe('disposition de la vue arbre', () => {
  it('une personne seule : une seule carte, au centre', () => {
    const d = disposer(arbre({ a: 'U' }, []), 'a', opts);
    expect(d.cartes).toEqual([{ id: 'a', x: 0, y: 0, gen: 0, role: 'centre', descendantsCaches: undefined }]);
    expect(d.traits).toEqual([]);
  });

  it('ancêtres au-dessus : père à gauche, mère à droite, enfant centré sous eux', () => {
    const d = disposer(famille(), 'louise', opts);
    const [h, m, l] = [carte(d, 'henri'), carte(d, 'marguerite'), carte(d, 'louise')];
    expect(h.y).toBeLessThan(l.y);
    expect(h.y).toBe(m.y);
    expect(h.x).toBeLessThan(m.x);
    expect(centre(l)).toBeCloseTo((centre(h) + centre(m)) / 2);
    expect(carte(d, 'joseph').gen).toBe(-2);
    expect(carte(d, 'antoine').gen).toBe(-3);
    sansChevauchement(d);
  });

  it('conjoint à côté, enfants et petits-enfants en dessous', () => {
    const d = disposer(famille(), 'louise', opts);
    const [l, p] = [carte(d, 'louise'), carte(d, 'pierre')];
    expect(p).toMatchObject({ role: 'conjoint', y: l.y });
    expect(p.x).toBe(l.x + L + 16);
    const [c, t] = [carte(d, 'claire'), carte(d, 'thomas')];
    expect(c.gen).toBe(1);
    expect(c.x).toBeLessThan(t.x);
    // Les enfants sont centrés sous le couple
    expect((centre(c) + centre(t)) / 2).toBeCloseTo((l.x + L + p.x) / 2);
    expect(carte(d, 'lea').gen).toBe(2);
    expect(carte(d, 'hugo').gen).toBe(2);
    sansChevauchement(d);
  });

  it('limite le nombre de générations et signale ce qui est caché', () => {
    const d = disposer(famille(), 'louise', { ascendants: 2, descendants: 1, casesVides: false });
    expect(d.cartes.find((c) => c.id === 'antoine')).toBeUndefined();
    expect(carte(d, 'joseph').ancetresCaches).toBe(true);
    expect(carte(d, 'jeanne').ancetresCaches).toBeUndefined();
    expect(d.cartes.find((c) => c.id === 'lea')).toBeUndefined();
    expect(carte(d, 'claire').descendantsCaches).toBe(1);
  });

  it('cases vides « + Père / + Mère » pour les parents et grands-parents manquants', () => {
    const d = disposer(famille(), 'pierre', { ...opts, casesVides: true });
    expect(d.vides.map((v) => [v.enfant, v.sexe, v.gen])).toEqual([['pierre', 'M', -1], ['pierre', 'F', -1]]);
    const d2 = disposer(famille(), 'henri', { ...opts, casesVides: true });
    // Henri a ses parents ; Jeanne n'a pas de parents (cases à -2), Joseph a son père mais pas sa mère
    expect(d2.vides.map((v) => `${v.enfant}-${v.sexe}`).sort()).toEqual(['jeanne-F', 'jeanne-M', 'joseph-F']);
    sansChevauchement(d2);
  });

  it('plusieurs unions : conjoints de part et d’autre, enfants sous chaque couple', () => {
    const D = arbre({ a: 'M', b: 'F', c: 'F', x: 'U', y: 'U', z: 'U' }, [['a', 'b', 'x', 'y'], ['a', 'c', 'z']]);
    const d = disposer(D, 'a', opts);
    const [a, b, c] = [carte(d, 'a'), carte(d, 'b'), carte(d, 'c')];
    expect(b.x).toBeGreaterThan(a.x);
    expect(c.x).toBeLessThan(a.x);
    expect(centre(carte(d, 'z'))).toBeLessThan(centre(carte(d, 'x')));
    sansChevauchement(d);
  });

  it('résiste à une boucle dans les données (personne qui serait son propre ancêtre)', () => {
    const D = arbre({ a: 'M', b: 'M' }, [['a', null, 'b'], ['b', null, 'a']]);
    expect(() => disposer(D, 'a', opts)).not.toThrow();
  });

  it('reste rapide et sans chevauchement dans un grand arbre (2 500 personnes)', () => {
    // Arbre généré : 12 générations, 1 à 4 enfants par couple, quelques remariages
    let n = 0;
    const personnes: Record<string, 'M' | 'F'> = {};
    const unions: [string | null, string | null, ...string[]][] = [];
    const nouveau = (s: 'M' | 'F') => { const id = `p${n++}`; personnes[id] = s; return id; };
    let generation = [nouveau('M')];
    let alea = 42;
    const hasard = () => (alea = (alea * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    while (n < 2500) {
      const suivante: string[] = [];
      for (const p of generation) {
        for (let u = 0; u < (hasard() < 0.1 ? 2 : 1) && n < 2500; u++) {
          const conjoint = nouveau(personnes[p] === 'M' ? 'F' : 'M');
          const enfants = Array.from({ length: 1 + Math.floor(hasard() * 4) }, () => nouveau(hasard() < 0.5 ? 'M' : 'F'));
          unions.push([p, conjoint, ...enfants]);
          suivante.push(...enfants);
        }
      }
      generation = suivante.slice(0, 400);
    }
    const D = arbre(personnes, unions);
    const ids = Object.keys(personnes);
    const debut = performance.now();
    for (const id of ids.slice(0, 200)) {
      const d = disposer(D, id, { ascendants: 4, descendants: 2, casesVides: true });
      sansChevauchement(d);
      expect(d.cartes.length).toBeLessThan(400);
    }
    const parVue = (performance.now() - debut) / 200;
    expect(parVue).toBeLessThan(20); // millisecondes par vue, vérification comprise
    expect(H).toBe(64);
  });
});
