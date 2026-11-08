// Tests du partage d'un arbre et du masquage des personnes vivantes pour les lecteurs.
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../worker/index';
import { creerServeur } from './outils';

let s: Awaited<ReturnType<typeof creerServeur>>;
let camille: string, marie: string, paul: string;
let arbre: string;
let louise: string, henri: string, union: string;

const api = (method: string, chemin: string, body?: unknown, cookie = camille) => s.appel(method, `/trees/${arbre}${chemin}`, { cookie, body });
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);

async function envoyerPhoto(liens: unknown[]) {
  const form = new FormData();
  form.set('file', new File([WEBP], 'p.webp'));
  form.set('links', JSON.stringify(liens));
  const r = await worker.fetch(new Request(`https://geneaview.test/api/trees/${arbre}/media`, { method: 'POST', body: form, headers: { cookie: camille, origin: 'https://geneaview.test' } }), s.env);
  return ((await r.json()) as any).media[0].id as string;
}
const lirePhoto = async (id: string, cookie: string) =>
  (await worker.fetch(new Request(`https://geneaview.test/api/trees/${arbre}/media/${id}/file`, { headers: { cookie } }), s.env)).status;

beforeEach(async () => {
  s = await creerServeur();
  for (const u of ['camille', 'marie', 'paul']) await s.creerCompte(u);
  [camille, marie, paul] = await Promise.all(['camille', 'marie', 'paul'].map((u) => s.connecter(u)));
  arbre = (await s.appel('POST', '/trees', { cookie: camille, body: { name: 'Martin' } })).data.id;
  henri = (await api('POST', '/persons', { given_names: 'Henri', surname: 'Martin', notes: 'Instituteur', birth: { date_text: '1921', place: 'Aurillac' }, death: { date_text: '1998' } })).data.id;
  const r = (await api('POST', '/persons', { given_names: 'Louise', surname: 'Martin', living: true, nickname: 'Loulou', notes: 'Adresse : 3 rue…', birth: { date_text: '20/10/1952', place: 'Aurillac' }, relation: { type: 'enfant', of: henri } })).data;
  louise = r.id;
  union = (await api('POST', '/persons', { given_names: 'Pierre', surname: 'Bernard', living: true, relation: { type: 'conjoint', of: louise } })).data.families.find((f: any) => f.partner1_id === louise || f.partner2_id === louise).id;
  await api('POST', '/events', { family_id: union, type: 'marriage', date_text: '1975' });
  await api('POST', '/todos', { person_id: louise, text: 'Demander à Louise' });
});

describe('partage', () => {
  it('le propriétaire ajoute un lecteur et un éditeur', async () => {
    expect((await api('POST', '/members', { user_id: 'Paul', role: 'viewer' })).status).toBe(201);
    const r = await api('POST', '/members', { user_id: 'marie', role: 'editor' });
    expect(r.data.members.map((m: any) => [m.user_id, m.role])).toEqual([['camille', 'owner'], ['marie', 'editor'], ['paul', 'viewer']]);
    expect((await s.appel('GET', '/trees', { cookie: paul })).data.trees[0]).toMatchObject({ name: 'Martin', role: 'viewer', owner_label: 'Camille' });
  });

  it('refuse un compte inconnu, un rôle invalide, ou de se modifier soi-même', async () => {
    expect((await api('POST', '/members', { user_id: 'fantome', role: 'viewer' })).status).toBe(404);
    expect((await api('POST', '/members', { user_id: 'paul', role: 'owner' })).status).toBe(400);
    expect((await api('POST', '/members', { user_id: 'camille', role: 'viewer' })).status).toBe(400);
    expect((await api('DELETE', '/members/camille')).status).toBe(400);
  });

  it('seul le propriétaire gère le partage ; un membre peut partir', async () => {
    await api('POST', '/members', { user_id: 'marie', role: 'editor' });
    await api('POST', '/members', { user_id: 'paul', role: 'viewer' });
    expect((await api('POST', '/members', { user_id: 'paul', role: 'editor' }, marie)).status).toBe(403);
    expect((await api('PUT', '/members/paul', { role: 'editor' }, marie)).status).toBe(403);
    expect((await api('DELETE', '/members/paul', undefined, marie)).status).toBe(403);
    expect((await api('GET', '/members', undefined, paul)).status).toBe(200);
    expect((await api('DELETE', '/members/paul', undefined, paul)).status).toBe(200); // Paul quitte l'arbre
    expect((await api('GET', '/data', undefined, paul)).status).toBe(404);
    expect((await api('PUT', '/members/marie', { role: 'viewer' })).data.members.find((m: any) => m.user_id === 'marie').role).toBe('viewer');
  });

  it('un non-membre ne voit même pas la liste des membres', async () => {
    expect((await api('GET', '/members', undefined, paul)).status).toBe(404);
  });
});

describe('masquage des personnes vivantes', () => {
  beforeEach(async () => {
    await api('POST', '/members', { user_id: 'paul', role: 'viewer' });
    await api('POST', '/members', { user_id: 'marie', role: 'editor' });
  });

  it('un lecteur voit « Personne vivante », sans aucune information personnelle', async () => {
    const d = (await api('GET', '/data', undefined, paul)).data;
    const l = d.persons.find((p: any) => p.id === louise);
    expect(l).toMatchObject({ given_names: 'Personne vivante', surname: '', nickname: '', notes: '', occupations: '', photo_media_id: null, masked: 1 });
    expect(d.events.some((e: any) => e.person_id === louise)).toBe(false);
    expect(d.events.some((e: any) => e.family_id === union)).toBe(false); // mariage avec un conjoint vivant
    expect(d.todos).toEqual([]);
    expect(JSON.stringify(d)).not.toMatch(/Louise|Loulou|1952|3 rue|Pierre|Bernard|1975|Lilas/);
    // Les personnes décédées restent visibles, et la structure de l'arbre aussi
    expect(d.persons.find((p: any) => p.id === henri)).toMatchObject({ given_names: 'Henri', notes: 'Instituteur' });
    expect(d.children.some((c: any) => c.child_id === louise)).toBe(true);
  });

  it('un éditeur et le propriétaire voient tout', async () => {
    for (const cookie of [camille, marie]) {
      const d = (await api('GET', '/data', undefined, cookie)).data;
      expect(d.persons.find((p: any) => p.id === louise)).toMatchObject({ given_names: 'Louise', nickname: 'Loulou' });
      expect(d.persons.find((p: any) => p.id === louise).masked).toBeUndefined();
    }
  });

  it('documents et sources liés à une personne vivante : cachés aux lecteurs', async () => {
    const photoLouise = await envoyerPhoto([{ person_id: louise }]);
    const photoPartagee = await envoyerPhoto([{ person_id: henri }, { person_id: louise }]);
    const photoHenri = await envoyerPhoto([{ person_id: henri }]);
    const photoMariage = await envoyerPhoto([{ family_id: union }]);
    const src = (await api('POST', '/sources', { title: 'Acte de naissance de Louise' })).data.sources[0];
    await api('POST', '/citations', { source_id: src.id, person_id: louise, detail: 'n° 123' });

    const d = (await api('GET', '/data', undefined, paul)).data;
    expect(d.media.map((m: any) => m.id)).toEqual([photoHenri]);
    expect(d.citations).toEqual([]);
    expect(d.sources).toEqual([]); // la source ne concerne que Louise
    expect(await lirePhoto(photoLouise, paul)).toBe(404);
    expect(await lirePhoto(photoPartagee, paul)).toBe(404);
    expect(await lirePhoto(photoMariage, paul)).toBe(404);
    expect(await lirePhoto(photoHenri, paul)).toBe(200);
    expect(await lirePhoto(photoLouise, marie)).toBe(200);
    expect(await lirePhoto(photoLouise, camille)).toBe(200);
  });

  it('cocher « décédée » rend la personne visible aux lecteurs', async () => {
    await api('PUT', `/persons/${louise}`, { living: false });
    const d = (await api('GET', '/data', undefined, paul)).data;
    expect(d.persons.find((p: any) => p.id === louise).given_names).toBe('Louise');
  });
});
