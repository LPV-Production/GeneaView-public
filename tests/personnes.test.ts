// Tests des personnes, liens familiaux, unions, événements et « à chercher ».
import { beforeEach, describe, expect, it } from 'vitest';
import { creerServeur } from './outils';

let s: Awaited<ReturnType<typeof creerServeur>>;
let camille: string;
let arbre: string;
let api: (method: string, chemin: string, body?: unknown, cookie?: string) => ReturnType<typeof s.appel>;

/** Crée une personne et renvoie son identifiant. */
async function personne(champs: Record<string, unknown>) {
  const r = await api('POST', '/persons', champs);
  if (r.status !== 201) throw new Error(r.data.error);
  return r.data.id as string;
}
const ligne = (sql: string, ...p: (string | number | null)[]) => s.sqlite.prepare(sql).get(...p) as any;
const lignes = (sql: string, ...p: (string | number | null)[]) => s.sqlite.prepare(sql).all(...p) as any[];

beforeEach(async () => {
  s = await creerServeur();
  await s.creerCompte('camille');
  camille = await s.connecter('camille');
  arbre = (await s.appel('POST', '/trees', { cookie: camille, body: { name: 'Famille Martin' } })).data.id;
  api = (method, chemin, body, cookie = camille) => s.appel(method, `/trees/${arbre}${chemin}`, { cookie, body });
});

describe('personnes', () => {
  it('création avec naissance et décès, lieux créés et découpés', async () => {
    const r = await api('POST', '/persons', {
      given_names: 'Joseph Antoine', surname: 'Martin', sex: 'M', occupations: 'Forgeron',
      birth: { date_qual: 'about', date_text: '1890', place: 'Saint-Flour ,  Cantal' },
      death: { date_qual: 'exact', date_text: '12/03/1962', place: 'Aurillac, Cantal, France' },
    });
    expect(r.status).toBe(201);
    expect(r.data.persons[0]).toMatchObject({ id: r.data.id, given_names: 'Joseph Antoine', surname: 'Martin', sex: 'M', living: 0 });
    const naissance = r.data.events.find((e: any) => e.type === 'birth');
    expect(naissance).toMatchObject({ date_text: '1890', date_qual: 'about', date_sort: 18900000 });
    expect(r.data.events.find((e: any) => e.type === 'death').date_sort).toBe(19620312);
    expect(r.data.places).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Saint-Flour, Cantal', city: 'Saint-Flour', department: 'Cantal', country: '' }),
      expect.objectContaining({ name: 'Aurillac, Cantal, France', country: 'France' }),
    ]));
    expect(r.data.persons[0].tree_id).toBeUndefined();
  });

  it('réutilise un lieu existant, sans tenir compte des majuscules', async () => {
    await personne({ given_names: 'A', birth: { date_text: '1900', place: 'Aurillac, Cantal' } });
    await personne({ given_names: 'B', birth: { date_text: '1901', place: 'aurillac, cantal' }, death: { date_text: '1980', place: 'AURILLAC, CANTAL' } });
    expect(ligne('SELECT COUNT(*) AS n FROM places').n).toBe(1);
  });

  it('refuse une date incomprise ou une personne sans nom', async () => {
    const r = await api('POST', '/persons', { given_names: 'Jean', birth: { date_text: 'printemps 1890' } });
    expect(r.status).toBe(400);
    expect(r.data.error).toMatch(/non comprise/);
    expect((await api('POST', '/persons', { given_names: ' ', surname: '' })).status).toBe(400);
    expect(ligne('SELECT COUNT(*) AS n FROM persons').n).toBe(0); // rien d'enregistré à moitié
  });

  it('personne vivante : pas de décès enregistré', async () => {
    const id = await personne({ given_names: 'Louise', living: true, death: { date_text: '2020' } });
    expect(lignes("SELECT * FROM events WHERE person_id = ? AND type = 'death'", id)).toHaveLength(0);
  });

  it('modifier la naissance met à jour l’événement ; tout effacer le supprime', async () => {
    const id = await personne({ given_names: 'Henri', birth: { date_text: '1921', place: 'Aurillac' } });
    await api('PUT', `/persons/${id}`, { birth: { date_qual: 'exact', date_text: '3 juin 1921', place: 'Aurillac' } });
    expect(ligne("SELECT date_sort FROM events WHERE person_id = ? AND type = 'birth'", id).date_sort).toBe(19210603);
    const r = await api('PUT', `/persons/${id}`, { birth: { date_text: '', place: '' } });
    expect(r.data.events).toHaveLength(0);
  });
});

describe('liens familiaux', () => {
  it('ajouter le père puis la mère : une seule union des parents', async () => {
    const enfant = await personne({ given_names: 'Henri', surname: 'Martin' });
    const pere = await api('POST', '/persons', { given_names: 'Joseph', sex: 'M', relation: { type: 'parent', of: enfant } });
    const mere = await api('POST', '/persons', { given_names: 'Jeanne', sex: 'F', relation: { type: 'parent', of: enfant } });
    const unions = lignes('SELECT * FROM families');
    expect(unions).toHaveLength(1);
    expect([unions[0].partner1_id, unions[0].partner2_id]).toEqual([pere.data.id, mere.data.id]);
    expect(lignes('SELECT child_id FROM family_children')).toEqual([{ child_id: enfant }]);
    // Le paquet contient l'enfant, le parent ajouté et l'union
    expect(mere.data.persons.map((p: any) => p.id).sort()).toEqual([enfant, mere.data.id].sort());
    expect(mere.data.families).toHaveLength(1);
    // Pas de troisième parent
    const r = await api('POST', '/persons', { given_names: 'Intrus', relation: { type: 'parent', of: enfant } });
    expect(r.status).toBe(409);
    expect(ligne('SELECT COUNT(*) AS n FROM persons').n).toBe(3);
  });

  it('enfant : union unique utilisée, choix obligatoire s’il y en a plusieurs', async () => {
    const jo = await personne({ given_names: 'Joseph' });
    const premiere = (await api('POST', '/persons', { given_names: 'Jeanne', relation: { type: 'conjoint', of: jo, union_type: 'marriage' } })).data.families[0].id;
    await personne({ given_names: 'Henri', relation: { type: 'enfant', of: jo } });
    expect(lignes('SELECT family_id FROM family_children')).toEqual([{ family_id: premiere }]);

    const seconde = (await api('POST', '/persons', { given_names: 'Rose', relation: { type: 'conjoint', of: jo } })).data.families.find((f: any) => f.id !== premiere).id;
    const sansChoix = await api('POST', '/persons', { given_names: 'Paul', relation: { type: 'enfant', of: jo } });
    expect(sansChoix.status).toBe(400);
    expect(sansChoix.data.error).toMatch(/plusieurs unions/);
    await personne({ given_names: 'Paul', relation: { type: 'enfant', of: jo, family_id: seconde } });
    expect(lignes('SELECT family_id FROM family_children ORDER BY family_id = ?', premiere).map((r) => r.family_id)).toEqual([seconde, premiere]);
  });

  it('enfant d’une personne sans union : crée une union à un seul parent', async () => {
    const claire = await personne({ given_names: 'Claire' });
    await personne({ given_names: 'Léa', relation: { type: 'enfant', of: claire } });
    expect(ligne('SELECT partner1_id, partner2_id FROM families')).toEqual({ partner1_id: claire, partner2_id: null });
  });

  it('relier deux personnes existantes, sans doublon ni absurdité', async () => {
    const a = await personne({ given_names: 'Henri' });
    const b = await personne({ given_names: 'Marguerite' });
    expect((await api('POST', '/links', { type: 'conjoint', of: a, person_id: b, union_type: 'marriage' })).status).toBe(200);
    expect((await api('POST', '/links', { type: 'conjoint', of: b, person_id: a })).status).toBe(409);
    expect((await api('POST', '/links', { type: 'enfant', of: a, person_id: b })).status).toBe(400); // conjoint ≠ enfant
    expect((await api('POST', '/links', { type: 'parent', of: a, person_id: a })).status).toBe(400);
    const c = await personne({ given_names: 'Louise' });
    await api('POST', '/links', { type: 'enfant', of: a, person_id: c });
    expect((await api('POST', '/links', { type: 'enfant', of: b, person_id: c })).status).toBe(409);
  });

  it('modifier une union, la nature d’un lien enfant, retirer un enfant', async () => {
    const a = await personne({ given_names: 'Henri' });
    const b = (await api('POST', '/persons', { given_names: 'Marguerite', relation: { type: 'conjoint', of: a } })).data;
    const fam = b.families[0].id;
    const c = await personne({ given_names: 'Louise', relation: { type: 'enfant', of: a } });
    expect((await api('PUT', `/families/${fam}`, { union_type: 'pacs' })).data.families[0].union_type).toBe('pacs');
    expect((await api('PUT', `/families/${fam}`, { union_type: 'polygamie' })).status).toBe(400);
    await api('PUT', `/families/${fam}/children/${c}`, { relation: 'adopted' });
    expect(ligne('SELECT relation FROM family_children').relation).toBe('adopted');
    const r = await api('DELETE', `/families/${fam}/children/${c}`);
    expect(r.status).toBe(200);
    expect(lignes('SELECT * FROM family_children')).toHaveLength(0);
    expect(lignes('SELECT * FROM families')).toHaveLength(1); // le couple reste
  });
});

describe('suppression', () => {
  it('supprimer une personne nettoie événements, liens et unions devenues vides', async () => {
    const enfant = await personne({ given_names: 'Henri', birth: { date_text: '1921' } });
    const pere = (await api('POST', '/persons', { given_names: 'Joseph', relation: { type: 'parent', of: enfant } })).data.id;
    await api('POST', '/todos', { person_id: enfant, text: 'Trouver l’acte' });
    await api('PUT', '/root', { person_id: enfant });

    const r = await api('DELETE', `/persons/${enfant}`);
    expect(r.status).toBe(200);
    expect(r.data.deleted).toEqual({ persons: [enfant], families: [expect.any(String)] });
    expect(lignes('SELECT id FROM persons')).toEqual([{ id: pere }]);
    expect(lignes('SELECT * FROM events')).toHaveLength(0);
    expect(lignes('SELECT * FROM todos')).toHaveLength(0);
    expect(lignes('SELECT * FROM families')).toHaveLength(0); // union du père seul, sans enfant : supprimée
    expect(ligne('SELECT root_person_id FROM trees').root_person_id).toBeNull();
  });

  it('un couple sans enfant reste quand on supprime un tiers', async () => {
    const a = await personne({ given_names: 'Pierre' });
    await personne({ given_names: 'Louise', relation: { type: 'conjoint', of: a } });
    const tiers = await personne({ given_names: 'Tiers' });
    await api('DELETE', `/persons/${tiers}`);
    expect(lignes('SELECT * FROM families')).toHaveLength(1);
  });

  it('supprimer une union garde les personnes', async () => {
    const a = await personne({ given_names: 'Pierre' });
    const fam = (await api('POST', '/persons', { given_names: 'Louise', relation: { type: 'conjoint', of: a } })).data.families[0].id;
    await api('POST', '/events', { family_id: fam, type: 'marriage', date_text: '1975' });
    const r = await api('DELETE', `/families/${fam}`);
    expect(r.data.deleted).toEqual({ families: [fam] });
    expect(lignes('SELECT * FROM persons')).toHaveLength(2);
    expect(lignes('SELECT * FROM events')).toHaveLength(0);
  });
});

describe('événements et « à chercher »', () => {
  it('événements de personne et d’union, avec types autorisés', async () => {
    const a = await personne({ given_names: 'Joseph' });
    const fam = (await api('POST', '/persons', { given_names: 'Jeanne', relation: { type: 'conjoint', of: a } })).data.families[0].id;
    const m = await api('POST', '/events', { family_id: fam, type: 'marriage', date_qual: 'exact', date_text: '14/10/1919', place: 'Aurillac' });
    expect(m.status).toBe(201);
    expect(m.data.events[0]).toMatchObject({ family_id: fam, person_id: null, date_sort: 19191014 });
    expect((await api('POST', '/events', { family_id: fam, type: 'birth' })).status).toBe(400);
    expect((await api('POST', '/events', { person_id: a, type: 'marriage' })).status).toBe(400);
    expect((await api('POST', '/events', { person_id: a, family_id: fam, type: 'other' })).status).toBe(400);

    const ev = (await api('POST', '/events', { person_id: a, type: 'military', date_qual: 'between', date_text: '1914 et 1918', place: 'Verdun', description: '139e RI' })).data.events[0];
    // Modification partielle : le lieu et la date sont gardés
    const r = await api('PUT', `/events/${ev.id}`, { description: 'Blessé en 1916' });
    expect(r.data.events[0]).toMatchObject({ description: 'Blessé en 1916', date_sort: 19140000, date_sort_end: 19180000, place_id: ev.place_id });
    await api('DELETE', `/events/${ev.id}`);
    expect(lignes('SELECT * FROM events WHERE person_id = ?', a)).toHaveLength(0);
  });

  it('liste « à chercher »', async () => {
    const a = await personne({ given_names: 'Joseph' });
    const t = (await api('POST', '/todos', { person_id: a, text: 'Acte de naissance' })).data.todos[0];
    expect(t.done).toBe(0);
    expect((await api('PUT', `/todos/${t.id}`, { done: true })).data.todos[0].done).toBe(1);
    expect((await api('POST', '/todos', { person_id: a, text: '  ' })).status).toBe(400);
    await api('DELETE', `/todos/${t.id}`);
    expect(lignes('SELECT * FROM todos')).toHaveLength(0);
  });

  it('chargement complet de l’arbre', async () => {
    const a = await personne({ given_names: 'Joseph', birth: { date_text: '1890', place: 'Saint-Flour' } });
    await personne({ given_names: 'Henri', relation: { type: 'enfant', of: a } });
    const r = await api('GET', '/data');
    expect(r.status).toBe(200);
    expect(r.data.persons).toHaveLength(2);
    expect(r.data.families).toHaveLength(1);
    expect(r.data.children).toHaveLength(1);
    expect(r.data.events).toHaveLength(1);
    expect(r.data.places).toHaveLength(1);
  });
});

describe('cloisonnement entre arbres et rôles', () => {
  it('aucun identifiant d’un autre arbre n’est accepté', async () => {
    const autreArbre = (await s.appel('POST', '/trees', { cookie: camille, body: { name: 'Autre' } })).data.id;
    const etranger = (await s.appel('POST', `/trees/${autreArbre}/persons`, { cookie: camille, body: { given_names: 'Étranger' } })).data;
    const ici = await personne({ given_names: 'Joseph' });
    const ev = (await s.appel('POST', `/trees/${autreArbre}/events`, { cookie: camille, body: { person_id: etranger.id, type: 'other' } })).data.events[0];

    expect((await api('POST', '/persons', { given_names: 'X', relation: { type: 'parent', of: etranger.id } })).status).toBe(404);
    expect((await api('POST', '/links', { type: 'conjoint', of: ici, person_id: etranger.id })).status).toBe(404);
    expect((await api('PUT', `/persons/${etranger.id}`, { given_names: 'Volé' })).status).toBe(404);
    expect((await api('DELETE', `/persons/${etranger.id}`)).status).toBe(404);
    expect((await api('POST', '/events', { person_id: etranger.id, type: 'other' })).status).toBe(404);
    expect((await api('PUT', `/events/${ev.id}`, { description: 'Volé' })).status).toBe(404);
    expect((await api('POST', '/todos', { person_id: etranger.id, text: 'x' })).status).toBe(404);
    expect((await api('PUT', '/root', { person_id: etranger.id })).status).toBe(404);
    expect(ligne('SELECT given_names FROM persons WHERE id = ?', etranger.id).given_names).toBe('Étranger');
  });

  it('un lecteur lit mais ne modifie rien ; un non-membre ne voit rien', async () => {
    const id = await personne({ given_names: 'Joseph' });
    for (const u of ['paul', 'inconnu']) await s.creerCompte(u);
    s.sqlite.prepare("INSERT INTO tree_members (tree_id, user_id, role) VALUES (?, 'paul', 'viewer')").run(arbre);
    const paul = await s.connecter('paul');
    const inconnu = await s.connecter('inconnu');

    expect((await api('GET', '/data', undefined, paul)).status).toBe(200);
    expect((await api('POST', '/persons', { given_names: 'X' }, paul)).status).toBe(403);
    expect((await api('PUT', `/persons/${id}`, { given_names: 'X' }, paul)).status).toBe(403);
    expect((await api('DELETE', `/persons/${id}`, undefined, paul)).status).toBe(403);
    expect((await api('POST', '/events', { person_id: id, type: 'other' }, paul)).status).toBe(403);
    expect((await api('GET', '/data', undefined, inconnu)).status).toBe(404);
    expect((await api('POST', '/persons', { given_names: 'X' }, inconnu)).status).toBe(404);
  });
});
