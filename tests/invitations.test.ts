// Tests des liens d'invitation : création de compte par l'invité, accès à l'arbre, usage unique.
import { beforeEach, describe, expect, it } from 'vitest';
import { creerServeur } from './outils';

let s: Awaited<ReturnType<typeof creerServeur>>;
let camille: string, marie: string, paul: string;
let arbre: string;

const inviter = (role: string, cookie = camille) => s.appel('POST', `/trees/${arbre}/invitations`, { cookie, body: { role } });
const NOUVEAU = { id: 'Soeur', label: 'Ma sœur', password: 'un-long-mot-de-passe' };

beforeEach(async () => {
  s = await creerServeur();
  for (const u of ['camille', 'marie', 'paul']) await s.creerCompte(u);
  [camille, marie, paul] = await Promise.all(['camille', 'marie', 'paul'].map((u) => s.connecter(u)));
  arbre = (await s.appel('POST', '/trees', { cookie: camille, body: { name: 'Famille Martin' } })).data.id;
  s.sqlite.prepare("INSERT INTO tree_members (tree_id, user_id, role) VALUES (?, 'paul', 'editor')").run(arbre);
});

describe('invitations', () => {
  it('le propriétaire crée un code ; seule son empreinte est gardée', async () => {
    const r = await inviter('editor');
    expect(r.status).toBe(201);
    expect(r.data.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(r.data.invitations).toHaveLength(1);
    expect(JSON.stringify(s.sqlite.prepare('SELECT * FROM invitations').all())).not.toContain(r.data.code.replace(/-/g, ''));
    // Un éditeur ne peut pas inviter
    expect((await inviter('editor', paul)).status).toBe(403);
    expect((await inviter('owner')).status).toBe(400);
  });

  it('sans compte : on voit l’arbre proposé, on crée son compte, on est connecté et membre', async () => {
    const { code } = (await inviter('editor')).data;
    const info = await s.appel('GET', `/invitations/${code.toLowerCase()}`);
    expect(info.data).toMatchObject({ tree_name: 'Famille Martin', role: 'editor', invited_by: 'Camille' });

    const r = await s.appel('POST', `/invitations/${code}/accept`, { body: NOUVEAU });
    expect(r.status).toBe(201);
    expect(r.data).toEqual({ user: { id: 'soeur', label: 'Ma sœur' }, tree_id: arbre });
    const cookie = r.setCookie!.split(';')[0];
    const arbres = (await s.appel('GET', '/trees', { cookie })).data.trees;
    expect(arbres.map((a: any) => [a.name, a.role])).toEqual([['Famille Martin', 'editor']]);
    // Le compte fonctionne aussi pour se reconnecter
    expect((await s.appel('POST', '/login', { body: { id: 'soeur', password: NOUVEAU.password } })).status).toBe(200);
  });

  it('un code ne sert qu’une fois', async () => {
    const { code } = (await inviter('viewer')).data;
    expect((await s.appel('POST', `/invitations/${code}/accept`, { body: NOUVEAU })).status).toBe(201);
    expect((await s.appel('GET', `/invitations/${code}`)).status).toBe(404);
    expect((await s.appel('POST', `/invitations/${code}/accept`, { body: { ...NOUVEAU, id: 'autre' } })).status).toBe(404);
    expect((await s.appel('POST', `/invitations/${code}/join`, { cookie: marie })).status).toBe(404);
  });

  it('un code expiré ou annulé ne marche plus', async () => {
    const a = (await inviter('viewer')).data.code;
    s.sqlite.prepare('UPDATE invitations SET expires_at = ?').run(Date.now() - 1);
    expect((await s.appel('GET', `/invitations/${a}`)).status).toBe(404);

    const r = await inviter('viewer');
    const annule = await s.appel('DELETE', `/trees/${arbre}/invitations/${r.data.invitations[0].id}`, { cookie: camille });
    expect(annule.data.invitations).toHaveLength(0);
    expect((await s.appel('GET', `/invitations/${r.data.code}`)).status).toBe(404);
    expect((await s.appel('GET', '/invitations/AAAA-BBBB-CCCC')).status).toBe(404);
  });

  it('identifiant déjà pris ou invalide, mot de passe trop court : refusé, et l’invitation reste utilisable', async () => {
    const { code } = (await inviter('editor')).data;
    expect((await s.appel('POST', `/invitations/${code}/accept`, { body: { ...NOUVEAU, id: 'Marie' } })).status).toBe(409);
    expect((await s.appel('POST', `/invitations/${code}/accept`, { body: { ...NOUVEAU, id: 'é t' } })).status).toBe(400);
    expect((await s.appel('POST', `/invitations/${code}/accept`, { body: { ...NOUVEAU, password: 'court' } })).status).toBe(400);
    expect((await s.appel('POST', `/invitations/${code}/accept`, { body: NOUVEAU })).status).toBe(201);
  });

  it('avec un compte existant : rejoindre l’arbre ; un éditeur n’est pas rétrogradé par une invitation lecteur', async () => {
    const r = await s.appel('POST', `/invitations/${(await inviter('viewer')).data.code}/join`, { cookie: marie });
    expect(r.data).toEqual({ tree_id: arbre });
    expect((await s.appel('GET', '/trees', { cookie: marie })).data.trees[0].role).toBe('viewer');

    await s.appel('POST', `/invitations/${(await inviter('viewer')).data.code}/join`, { cookie: paul });
    expect((await s.appel('GET', '/trees', { cookie: paul })).data.trees[0].role).toBe('editor');
    // Le propriétaire reste propriétaire
    await s.appel('POST', `/invitations/${(await inviter('viewer')).data.code}/join`, { cookie: camille });
    expect((await s.appel('GET', '/trees', { cookie: camille })).data.trees[0].role).toBe('owner');
    // Il faut être connecté pour « rejoindre »
    expect((await s.appel('POST', `/invitations/${(await inviter('viewer')).data.code}/join`)).status).toBe(401);
  });

  it('refuse les envois depuis un autre site', async () => {
    const { code } = (await inviter('editor')).data;
    expect((await s.appel('POST', `/invitations/${code}/accept`, { body: NOUVEAU, origin: 'https://pirate.example' })).status).toBe(403);
  });
});
