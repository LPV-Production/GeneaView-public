// Tests du contrôle d'accès par arbre : chacun ne voit et ne modifie que ses arbres.
import { beforeEach, describe, expect, it } from 'vitest';
import { creerServeur } from './outils';

let s: Awaited<ReturnType<typeof creerServeur>>;
let camille: string, marie: string, paul: string;
let arbre: string;

beforeEach(async () => {
  s = await creerServeur();
  for (const id of ['camille', 'marie', 'paul']) await s.creerCompte(id);
  [camille, marie, paul] = await Promise.all(['camille', 'marie', 'paul'].map((id) => s.connecter(id)));
  const r = await s.appel('POST', '/trees', { cookie: camille, body: { name: 'Famille Martin', description: 'Côté paternel' } });
  arbre = r.data.id;
  // Partage (en attendant l'écran de partage) : Marie éditrice, Paul lecteur
  s.sqlite.prepare("INSERT INTO tree_members (tree_id, user_id, role) VALUES (?, 'marie', 'editor'), (?, 'paul', 'viewer')").run(arbre, arbre);
});

describe('arbres', () => {
  it('le créateur devient propriétaire', async () => {
    const r = await s.appel('GET', `/trees/${arbre}`, { cookie: camille });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ name: 'Famille Martin', description: 'Côté paternel', role: 'owner', owner_label: 'Camille', person_count: 0 });
  });

  it('chacun ne liste que ses arbres', async () => {
    await s.creerCompte('inconnu');
    const inconnu = await s.connecter('inconnu');
    await s.appel('POST', '/trees', { cookie: inconnu, body: { name: 'Mon arbre secret' } });
    const liste = (await s.appel('GET', '/trees', { cookie: camille })).data.trees.map((t: any) => t.name);
    expect(liste).toEqual(['Famille Martin']);
    expect((await s.appel('GET', '/trees', { cookie: paul })).data.trees[0]).toMatchObject({ name: 'Famille Martin', role: 'viewer' });
  });

  it('un non-membre reçoit « introuvable », sans savoir que l’arbre existe', async () => {
    await s.creerCompte('inconnu');
    const inconnu = await s.connecter('inconnu');
    for (const [method, body] of [['GET'], ['PUT', { name: 'Volé' }], ['DELETE']] as const) {
      const r = await s.appel(method, `/trees/${arbre}`, { cookie: inconnu, body });
      expect(r.status).toBe(404);
    }
    const inexistant = await s.appel('GET', '/trees/arbre-qui-n-existe-pas', { cookie: inconnu });
    expect(inexistant.data.error).toBe((await s.appel('GET', `/trees/${arbre}`, { cookie: inconnu })).data.error);
  });

  it('seul le propriétaire renomme ou supprime l’arbre', async () => {
    expect((await s.appel('PUT', `/trees/${arbre}`, { cookie: marie, body: { name: 'Autre' } })).status).toBe(403);
    expect((await s.appel('PUT', `/trees/${arbre}`, { cookie: paul, body: { name: 'Autre' } })).status).toBe(403);
    expect((await s.appel('DELETE', `/trees/${arbre}`, { cookie: marie })).status).toBe(403);
    const r = await s.appel('PUT', `/trees/${arbre}`, { cookie: camille, body: { name: '  Famille Martin – Dubois  ' } });
    expect(r.status).toBe(200);
    expect(r.data.name).toBe('Famille Martin – Dubois');
  });

  it('refuse un nom vide ou trop long', async () => {
    expect((await s.appel('POST', '/trees', { cookie: camille, body: { name: '   ' } })).status).toBe(400);
    expect((await s.appel('POST', '/trees', { cookie: camille, body: {} })).status).toBe(400);
    expect((await s.appel('PUT', `/trees/${arbre}`, { cookie: camille, body: { name: 'x'.repeat(101) } })).status).toBe(400);
  });

  it('supprimer un arbre efface ses données, ses membres et SES fichiers seulement', async () => {
    const autre = (await s.appel('POST', '/trees', { cookie: camille, body: { name: 'Autre arbre' } })).data.id;
    s.sqlite.prepare("INSERT INTO persons (id, tree_id, given_names, surname) VALUES ('p1', ?, 'Joseph', 'Martin')").run(arbre);
    for (const k of [`trees/${arbre}/a.webp`, `trees/${arbre}/a-mini.webp`, `trees/${arbre}/b.pdf`, `trees/${autre}/c.webp`]) await s.r2.put(k, 'x');

    expect((await s.appel('DELETE', `/trees/${arbre}`, { cookie: camille })).status).toBe(200);
    expect([...s.r2.objets.keys()]).toEqual([`trees/${autre}/c.webp`]);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM persons').get()).toEqual({ n: 0 });
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM tree_members WHERE tree_id = ?').get(arbre)).toEqual({ n: 0 });
    expect((await s.appel('GET', `/trees/${arbre}`, { cookie: marie })).status).toBe(404);
  });
});
