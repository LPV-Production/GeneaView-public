// Tests de l'import GEDCOM côté serveur (worker/import.ts), de bout en bout.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { lireGedcom } from '../src/lib/gedcom';
import { envoyerImport, type EnvoiLot } from '../src/lib/importer';
import { creerServeur } from './outils';

let s: Awaited<ReturnType<typeof creerServeur>>;
let camille: string, paul: string;
let arbre: string;

const EXEMPLE = readFileSync(join(import.meta.dirname, 'gedcom.test.ts'), 'utf8').match(/const EXEMPLE = `([\s\S]*?)`;/)![1];
const fichier = () => lireGedcom(new TextEncoder().encode(EXEMPLE), 2026);

const envoi = (cookie: string, treeId = arbre): EnvoiLot => async (table, rows) => {
  const r = await s.appel('POST', `/trees/${treeId}/import`, { cookie, body: { table, rows } });
  if (r.status !== 200) throw new Error(`${r.status} ${r.data.error}`);
  return r.data;
};

beforeEach(async () => {
  s = await creerServeur();
  for (const u of ['camille', 'paul']) await s.creerCompte(u);
  [camille, paul] = await Promise.all(['camille', 'paul'].map((u) => s.connecter(u)));
  arbre = (await s.appel('POST', '/trees', { cookie: camille, body: { name: 'Import' } })).data.id;
  s.sqlite.prepare("INSERT INTO tree_members (tree_id, user_id, role) VALUES (?, 'paul', 'viewer')").run(arbre);
});

describe('import GEDCOM', () => {
  it('tout arrive dans le nouvel arbre, avec les dates triables', async () => {
    const r = fichier();
    const etapes: number[] = [];
    const { total, refusees } = await envoyerImport(r.lignes, envoi(camille), (fait) => etapes.push(fait));
    expect(refusees).toBe(0);
    expect(etapes.at(-1)).toBe(total);
    const d = (await s.appel('GET', `/trees/${arbre}/data`, { cookie: camille })).data;
    expect([d.persons.length, d.families.length, d.children.length, d.events.length, d.places.length, d.sources.length, d.citations.length])
      .toEqual([5, 2, 3, r.lignes.events.length, 2, 1, 2]);
    expect(d.events.find((e: any) => e.date_text === '20/10/1952').date_sort).toBe(19521020);
    expect(d.events.find((e: any) => e.date_qual === 'between' && e.type === 'birth')).toMatchObject({ date_sort: 19240000, date_sort_end: 19260000 });
    // Date d'un autre calendrier : gardée, sans tri
    expect(d.events.find((e: any) => e.date_text.startsWith('@#DFRENCH'))).toMatchObject({ date_sort: null });
  });

  it('un lecteur ne peut pas importer ; un non-membre non plus', async () => {
    await expect(envoyerImport(fichier().lignes, envoi(paul))).rejects.toThrow(/403/);
    await s.creerCompte('intrus');
    const intrus = await s.connecter('intrus');
    await expect(envoyerImport(fichier().lignes, envoi(intrus))).rejects.toThrow(/404/);
  });

  it('refuse toute référence vers un autre arbre', async () => {
    const autre = (await s.appel('POST', '/trees', { cookie: camille, body: { name: 'Autre' } })).data.id;
    const etranger = (await s.appel('POST', `/trees/${autre}/persons`, { cookie: camille, body: { given_names: 'Étranger' } })).data.id;
    const r = await envoi(camille)('events', [{ id: crypto.randomUUID(), person_id: etranger, family_id: null, type: 'birth', date_text: '1900', date_qual: 'exact', place_id: null, description: '' }]);
    expect(r).toEqual({ inserted: 0, refused: 1 });
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM events').get()).toEqual({ n: 0 });
    const f = await envoi(camille)('families', [{ id: crypto.randomUUID(), partner1_id: etranger, partner2_id: null, union_type: 'marriage', notes: '' }]);
    expect(f.refused).toBe(1);
  });

  it('valide les champs, la taille des lots et les doublons', async () => {
    const appel = (table: string, rows: unknown[]) => s.appel('POST', `/trees/${arbre}/import`, { cookie: camille, body: { table, rows } });
    expect((await appel('persons', [{ id: 'pas-un-uuid', given_names: 'X' }])).status).toBe(400);
    expect((await appel('persons', [{ id: crypto.randomUUID(), sex: 'X' }])).status).toBe(400);
    expect((await appel('tables_secretes', [{}])).status).toBe(400);
    expect((await appel('events', [{ id: crypto.randomUUID(), person_id: null, family_id: null, type: 'birth' }])).status).toBe(400);
    expect((await appel('persons', Array.from({ length: 501 }, () => ({ id: crypto.randomUUID() })))).status).toBe(413);
    const p = { id: crypto.randomUUID(), given_names: 'Jean' };
    expect((await appel('persons', [p])).status).toBe(200);
    expect((await appel('persons', [p])).status).toBe(409); // même lot renvoyé
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM persons').get()).toEqual({ n: 1 });
  });
});
