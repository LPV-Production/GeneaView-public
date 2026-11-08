// Tests de l'enregistrement des positions des lieux (carte).
import { beforeEach, describe, expect, it } from 'vitest';
import { creerServeur } from './outils';

let s: Awaited<ReturnType<typeof creerServeur>>;
let camille: string, paul: string, arbre: string, lieu: string;
const api = (method: string, chemin: string, body?: unknown, cookie = camille, t = arbre) => s.appel(method, `/trees/${t}${chemin}`, { cookie, body });

beforeEach(async () => {
  s = await creerServeur();
  for (const u of ['camille', 'paul']) await s.creerCompte(u);
  [camille, paul] = await Promise.all(['camille', 'paul'].map((u) => s.connecter(u)));
  arbre = (await s.appel('POST', '/trees', { cookie: camille, body: { name: 'A' } })).data.id;
  s.sqlite.prepare("INSERT INTO tree_members (tree_id, user_id, role) VALUES (?, 'paul', 'viewer')").run(arbre);
  lieu = (await api('POST', '/persons', { given_names: 'Jo', birth: { date_text: '1900', place: 'Aurillac, Cantal' } })).data.places[0].id;
});

describe('positions des lieux', () => {
  it('enregistre et efface une position', async () => {
    const r = await api('PUT', `/places/${lieu}`, { latitude: 44.92636, longitude: 2.4397 });
    expect(r.data.places[0]).toMatchObject({ latitude: 44.92636, longitude: 2.4397, geocoded_at: expect.any(String) });
    const vide = await api('PUT', `/places/${lieu}`, { latitude: null, longitude: null });
    expect(vide.data.places[0]).toMatchObject({ latitude: null, longitude: null, geocoded_at: expect.any(String) }); // « cherché, rien trouvé »
    expect((await api('PUT', `/places/${lieu}`, { latitude: null, longitude: null, reset: true })).data.places[0].geocoded_at).toBeNull();
  });
  it('refuse des coordonnées absurdes, un lecteur, un autre arbre', async () => {
    expect((await api('PUT', `/places/${lieu}`, { latitude: 95, longitude: 2 })).status).toBe(400);
    expect((await api('PUT', `/places/${lieu}`, { latitude: 45, longitude: null })).status).toBe(400);
    expect((await api('PUT', `/places/${lieu}`, { latitude: 45, longitude: 2 }, paul)).status).toBe(403);
    const autre = (await s.appel('POST', '/trees', { cookie: camille, body: { name: 'B' } })).data.id;
    expect((await api('PUT', `/places/${lieu}`, { latitude: 45, longitude: 2 }, camille, autre)).status).toBe(404);
  });
});
