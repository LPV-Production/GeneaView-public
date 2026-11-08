// Balayage de sécurité : CHAQUE adresse /api est essayée
//  - sans être connecté   → 401
//  - par un compte étranger à l'arbre → 404 (l'arbre « n'existe pas » pour lui)
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../worker/index';
import { creerServeur } from './outils';

let s: Awaited<ReturnType<typeof creerServeur>>;
let intrus: string;
let ids: Record<string, string> = {};

beforeAll(async () => {
  s = await creerServeur();
  for (const u of ['camille', 'intrus']) await s.creerCompte(u);
  const camille = await s.connecter('camille');
  intrus = await s.connecter('intrus');
  const t = (await s.appel('POST', '/trees', { cookie: camille, body: { name: 'Secret' } })).data.id;
  const api = (m: string, c: string, b?: unknown) => s.appel(m, `/trees/${t}${c}`, { cookie: camille, body: b });
  const p = (await api('POST', '/persons', { given_names: 'Jo', birth: { date_text: '1900', place: 'Aurillac' } })).data;
  const f = (await api('POST', '/persons', { given_names: 'Al', relation: { type: 'enfant', of: p.id } })).data;
  const ev = (await api('POST', '/events', { person_id: p.id, type: 'other' })).data.events.find((e: any) => e.type === 'other');
  const src = (await api('POST', '/sources', { title: 'S' })).data.sources[0];
  const cit = (await api('POST', '/citations', { source_id: src.id, person_id: p.id })).data.citations[0];
  const todo = (await api('POST', '/todos', { person_id: p.id, text: 'x' })).data.todos[0];
  const form = new FormData();
  form.set('file', new File([new TextEncoder().encode('%PDF-1.4 x')], 'a.pdf'));
  form.set('links', JSON.stringify([{ person_id: p.id }]));
  const m = (await (await worker.fetch(new Request(`https://geneaview.test/api/trees/${t}/media`, { method: 'POST', body: form, headers: { cookie: camille, origin: 'https://geneaview.test' } }), s.env)).json()) as any;
  ids = { t, p: p.id, enfant: f.id, fam: f.families[0].id, ev: ev.id, src: src.id, cit: cit.id, todo: todo.id, media: m.media[0].id, lieu: p.places[0].id };
});

// Toutes les routes d'un arbre, avec la méthode et un corps plausible
const routes = () => [
  ['GET', ''], ['PUT', '', { name: 'x' }], ['DELETE', ''],
  ['GET', '/data'], ['PUT', '/root', { person_id: ids.p }],
  ['POST', '/persons', { given_names: 'x' }], ['PUT', `/persons/${ids.p}`, { given_names: 'x' }], ['DELETE', `/persons/${ids.p}`],
  ['POST', '/links', { type: 'conjoint', of: ids.p, person_id: ids.enfant }],
  ['PUT', `/families/${ids.fam}`, { union_type: 'pacs' }], ['DELETE', `/families/${ids.fam}`],
  ['PUT', `/families/${ids.fam}/children/${ids.enfant}`, { relation: 'adopted' }], ['DELETE', `/families/${ids.fam}/children/${ids.enfant}`],
  ['POST', '/events', { person_id: ids.p, type: 'other' }], ['PUT', `/events/${ids.ev}`, { description: 'x' }], ['DELETE', `/events/${ids.ev}`],
  ['POST', '/todos', { person_id: ids.p, text: 'x' }], ['PUT', `/todos/${ids.todo}`, { done: true }], ['DELETE', `/todos/${ids.todo}`],
  ['POST', '/sources', { title: 'x' }], ['PUT', `/sources/${ids.src}`, { title: 'x' }], ['DELETE', `/sources/${ids.src}`],
  ['POST', '/citations', { source_id: ids.src, person_id: ids.p }], ['PUT', `/citations/${ids.cit}`, { detail: 'x' }], ['DELETE', `/citations/${ids.cit}`],
  ['GET', `/media/${ids.media}/file`], ['GET', `/media/${ids.media}/thumb`], ['PUT', `/media/${ids.media}`, { title: 'x' }], ['DELETE', `/media/${ids.media}`],
  ['POST', `/media/${ids.media}/links`, { person_id: ids.p }], ['DELETE', `/media/${ids.media}/links`, { person_id: ids.p }],
  ['PUT', `/places/${ids.lieu}`, { latitude: 1, longitude: 1 }],
  ['POST', '/import', { table: 'persons', rows: [{ id: crypto.randomUUID() }] }],
  ['GET', '/members'], ['POST', '/members', { user_id: 'intrus', role: 'editor' }], ['PUT', '/members/camille', { role: 'viewer' }], ['DELETE', '/members/camille'],
  ['GET', '/notifications'], ['PUT', '/notifications', { enabled: false }],
  ['GET', '/invitations'], ['POST', '/invitations', { role: 'editor' }], ['DELETE', '/invitations/x'],
] as [string, string, unknown?][];

describe('balayage de toutes les adresses /api', () => {
  it('sans être connecté : 401 partout', async () => {
    const autres = [['GET', '/api/me'], ['GET', '/api/trees'], ['POST', '/api/trees'], ['POST', '/api/password'], ['GET', '/api/push/key'], ['POST', '/api/push/subscribe'], ['POST', '/api/push/unsubscribe'], ['POST', '/api/push/test']];
    for (const [m, c, b] of routes()) {
      const r = await s.appel(m, `/trees/${ids.t}${c}`, { body: b });
      expect([m, c, r.status]).toEqual([m, c, 401]);
    }
    for (const [m, c] of autres) {
      const r = await worker.fetch(new Request(`https://geneaview.test${c}`, { method: m, headers: { origin: 'https://geneaview.test' } }), s.env);
      expect([m, c, r.status]).toEqual([m, c, 401]);
    }
  });

  it('un compte étranger à l’arbre : 404 partout, et rien n’a changé', async () => {
    const avant = s.sqlite.prepare('SELECT (SELECT COUNT(*) FROM persons) + (SELECT COUNT(*) FROM events) + (SELECT COUNT(*) FROM media) + (SELECT COUNT(*) FROM tree_members) AS n').get();
    for (const [m, c, b] of routes()) {
      const r = await s.appel(m, `/trees/${ids.t}${c}`, { cookie: intrus, body: b });
      expect([m, c, r.status]).toEqual([m, c, 404]);
    }
    expect(s.sqlite.prepare('SELECT (SELECT COUNT(*) FROM persons) + (SELECT COUNT(*) FROM events) + (SELECT COUNT(*) FROM media) + (SELECT COUNT(*) FROM tree_members) AS n').get()).toEqual(avant);
    expect(s.r2.objets.size).toBe(1);
  });
});
