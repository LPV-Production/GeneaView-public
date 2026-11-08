// Tests des familles recomposées : choisir l'autre parent d'un enfant, changer ses parents,
// types et fin d'union, liaisons cachées aux lecteurs.
import { beforeEach, describe, expect, it } from 'vitest';
import { creerServeur } from './outils';

let s: Awaited<ReturnType<typeof creerServeur>>;
let camille: string, paul: string;
let arbre: string;
let pere: string, marie: string, jeanne: string;

const api = (method: string, chemin: string, body?: unknown, cookie = camille) => s.appel(method, `/trees/${arbre}${chemin}`, { cookie, body });
const nouvelle = async (given_names: string, extra: Record<string, unknown> = {}) => (await api('POST', '/persons', { given_names, ...extra })).data;
/** Les deux parents d'un enfant, d'après la base. */
const parentsDe = (enfant: string) => {
  const f = s.sqlite.prepare('SELECT f.partner1_id, f.partner2_id FROM family_children c JOIN families f ON f.id = c.family_id WHERE c.child_id = ?').get(enfant) as any;
  return [f?.partner1_id, f?.partner2_id].filter(Boolean).sort();
};
const unionDe = (a: string, b: string) => (s.sqlite.prepare('SELECT * FROM families WHERE (partner1_id = ?1 AND partner2_id = ?2) OR (partner1_id = ?2 AND partner2_id = ?1)').get(a, b) as any);

beforeEach(async () => {
  s = await creerServeur();
  for (const u of ['camille', 'paul']) await s.creerCompte(u);
  [camille, paul] = await Promise.all(['camille', 'paul'].map((u) => s.connecter(u)));
  arbre = (await s.appel('POST', '/trees', { cookie: camille, body: { name: 'Martin' } })).data.id;
  s.sqlite.prepare("INSERT INTO tree_members (tree_id, user_id, role) VALUES (?, 'paul', 'viewer')").run(arbre);
  pere = (await nouvelle('Henri', { sex: 'M' })).id;
  marie = (await nouvelle('Marie', { sex: 'F', relation: { type: 'conjoint', of: pere, union_type: 'marriage' } })).id;
  jeanne = (await nouvelle('Jeanne', { sex: 'F' })).id;
});

describe('avec qui ? (l’autre parent d’un nouvel enfant)', () => {
  it('le père n’a qu’une union, mais l’enfant est d’une autre femme déjà dans l’arbre', async () => {
    const r = await nouvelle('Paul', { relation: { type: 'enfant', of: pere, other_id: jeanne } });
    expect(parentsDe(r.id)).toEqual([jeanne, pere].sort());
    expect(r.families.some((f: any) => f.id === unionDe(pere, jeanne).id)).toBe(true);
    // Un deuxième enfant du même couple rejoint la même union (pas de doublon)
    const r2 = await nouvelle('Léa', { relation: { type: 'enfant', of: pere, other_id: jeanne } });
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM family_children WHERE family_id = ?').get(unionDe(pere, jeanne).id)).toEqual({ n: 2 });
    expect(parentsDe(r2.id)).toEqual([jeanne, pere].sort());
  });

  it('autre parent inconnu : une union à un seul parent, même si le père a déjà une union', async () => {
    const r = await nouvelle('Louis', { relation: { type: 'enfant', of: pere, family_id: 'nouvelle' } });
    expect(parentsDe(r.id)).toEqual([pere]);
  });
});

describe('changer les parents d’un enfant', () => {
  it('de « Henri + Marie » vers « Henri + Jeanne » (union créée), puis retour', async () => {
    const enfant = (await nouvelle('Paul', { relation: { type: 'enfant', of: pere, family_id: unionDe(pere, marie).id } })).id;
    const depuis = unionDe(pere, marie).id;
    const r = await api('PUT', `/families/${depuis}/children/${enfant}/move`, { parent_id: pere, other_id: jeanne });
    expect(r.status).toBe(200);
    expect(parentsDe(enfant)).toEqual([jeanne, pere].sort());
    // L'union Henri + Marie reste (deux conjoints) même sans enfant
    expect(unionDe(pere, marie)).toBeTruthy();
    expect(r.data.refreshed.families).toEqual(expect.arrayContaining([depuis, unionDe(pere, jeanne).id]));

    await api('PUT', `/families/${unionDe(pere, jeanne).id}/children/${enfant}/move`, { family_id: depuis });
    expect(parentsDe(enfant)).toEqual([marie, pere].sort());
  });

  it('une union à un seul parent devenue vide disparaît, et l’appli en est prévenue', async () => {
    const enfant = (await nouvelle('Louis', { relation: { type: 'enfant', of: jeanne } })).id;
    const seule = (s.sqlite.prepare('SELECT family_id FROM family_children WHERE child_id = ?').get(enfant) as any).family_id;
    const r = await api('PUT', `/families/${seule}/children/${enfant}/move`, { parent_id: pere, other_id: jeanne });
    expect(r.data.deleted.families).toEqual([seule]);
    expect(parentsDe(enfant)).toEqual([jeanne, pere].sort());
  });

  it('garde la nature du lien (adoptif) et refuse les cas impossibles', async () => {
    const enfant = (await nouvelle('Paul', { relation: { type: 'enfant', of: pere, family_id: unionDe(pere, marie).id } })).id;
    const depuis = unionDe(pere, marie).id;
    await api('PUT', `/families/${depuis}/children/${enfant}`, { relation: 'adopted' });
    await api('PUT', `/families/${depuis}/children/${enfant}/move`, { parent_id: pere, other_id: jeanne });
    expect(s.sqlite.prepare('SELECT relation FROM family_children WHERE child_id = ?').get(enfant)).toEqual({ relation: 'adopted' });

    const ici = unionDe(pere, jeanne).id;
    expect((await api('PUT', `/families/${ici}/children/${enfant}/move`, { family_id: ici })).status).toBe(400);
    expect((await api('PUT', `/families/${ici}/children/${enfant}/move`, { parent_id: enfant })).status).toBe(400);
    expect((await api('PUT', `/families/${ici}/children/${enfant}/move`, { parent_id: pere, other_id: pere })).status).toBe(400);
    expect((await api('PUT', `/families/${ici}/children/${enfant}/move`, { parent_id: pere }, paul)).status).toBe(403);
  });
});

describe('ajouter la mère quand le père est déjà en couple avec elle', () => {
  it('l’enfant rejoint l’union existante au lieu d’en créer une seconde', async () => {
    const enfant = (await nouvelle('Paul', { relation: { type: 'enfant', of: pere, family_id: 'nouvelle' } })).id;
    const r = await api('POST', '/links', { type: 'parent', of: enfant, person_id: marie });
    expect(r.status).toBe(200);
    expect(parentsDe(enfant)).toEqual([marie, pere].sort());
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM families WHERE partner1_id = ?1 OR partner2_id = ?1').get(pere)).toEqual({ n: 1 });
    expect(r.data.deleted.families).toHaveLength(1);
  });
});

describe('types et fin d’union', () => {
  it('liaison et fiançailles se rangent à part, et l’appli voit un seul type', async () => {
    const r = await nouvelle('Rose', { relation: { type: 'conjoint', of: pere, union_type: 'liaison' } });
    const u = unionDe(pere, r.id);
    expect([u.union_type, u.kind]).toEqual(['unknown', 'liaison']);
    expect(r.families.find((f: any) => f.id === u.id)).toMatchObject({ union_type: 'liaison' });
    expect(r.families.find((f: any) => f.id === u.id).kind).toBeUndefined();

    const m = await api('PUT', `/families/${u.id}`, { union_type: 'pacs', end_type: 'separation' });
    expect(m.data.families[0]).toMatchObject({ union_type: 'pacs', end_type: 'separation' });
    expect(unionDe(pere, r.id).kind).toBe('');
    expect((await api('PUT', `/families/${u.id}`, { end_type: 'fâchés' })).status).toBe(400);
  });

  it('une union cachée disparaît complètement pour un lecteur, avec le lien de ses enfants', async () => {
    const r = await nouvelle('Rose', { relation: { type: 'conjoint', of: pere, union_type: 'liaison' } });
    const u = unionDe(pere, r.id).id;
    const enfant = (await nouvelle('Secret', { relation: { type: 'enfant', of: pere, family_id: u } })).id;
    await api('POST', '/events', { family_id: u, type: 'other', description: 'Rencontre' });
    await api('PUT', `/families/${u}`, { hidden: true });

    const vu = (await api('GET', '/data', undefined, paul)).data;
    expect(vu.families.map((f: any) => f.id)).not.toContain(u);
    expect(vu.children.some((c: any) => c.child_id === enfant)).toBe(false);
    expect(vu.events.some((e: any) => e.family_id === u)).toBe(false);
    // Le propriétaire la voit toujours
    const tout = (await api('GET', '/data')).data;
    expect(tout.families.find((f: any) => f.id === u)).toMatchObject({ hidden: 1, union_type: 'liaison' });
  });
});
