// Tests des notifications d'anniversaires (worker/rappels.ts).
import { beforeEach, describe, expect, it } from 'vitest';
import { formulerRappels, notification, rappelsDuJour, type LigneRappel } from '../worker/rappels';
import { creerServeur } from './outils';

const base: LigneRappel = {
  type: 'birth', annee: 1926, tree_id: 't', tree_name: 'Martin', role: 'owner',
  pid: 'p', prenom: 'Jeanne Marie', nom: 'Martin', vivant: 0,
  p1_prenom: null, p1_nom: null, p1_vivant: null, p2_prenom: null, p2_nom: null, p2_vivant: null,
  enabled: 1, births: 1, deaths: 1, marriages: 1, round_only: 1,
};
const l = (x: Partial<LigneRappel>) => ({ ...base, ...x });

describe('phrases des rappels', () => {
  it('ancêtres : anniversaires ronds seulement, par défaut', () => {
    expect(formulerRappels([l({ annee: 1926 })], 2026).map((r) => r.texte)).toEqual(['Il y a 100 ans naissait Jeanne Martin']);
    expect(formulerRappels([l({ annee: 1927 })], 2026)).toEqual([]);
    expect(formulerRappels([l({ annee: 1927, round_only: 0 })], 2026)).toHaveLength(1);
    expect(formulerRappels([l({ type: 'death', annee: 1946 })], 2026)[0].texte).toBe('Il y a 80 ans disparaissait Jeanne Martin');
  });
  it('personnes vivantes : chaque année, jamais pour un lecteur', () => {
    expect(formulerRappels([l({ annee: 1952, vivant: 1, prenom: 'Louise' })], 2026)[0].texte).toBe('Louise Martin a 74 ans aujourd’hui');
    expect(formulerRappels([l({ annee: 1952, vivant: 1, role: 'viewer' })], 2026)).toEqual([]);
    const mariage = l({ type: 'marriage', annee: 1976, pid: null, prenom: null, nom: null, p1_prenom: 'Pierre', p1_nom: 'Bernard', p1_vivant: 1, p2_prenom: 'Louise', p2_nom: 'Martin', p2_vivant: 1 });
    expect(formulerRappels([mariage], 2026)[0].texte).toBe('Pierre Bernard et Louise Martin fêtent leurs 50 ans de mariage');
    expect(formulerRappels([{ ...mariage, role: 'viewer' }], 2026)).toEqual([]);
  });
  it('réglages : désactivé, sans naissances…', () => {
    expect(formulerRappels([l({ enabled: 0 })], 2026)).toEqual([]);
    expect(formulerRappels([l({ births: 0 })], 2026)).toEqual([]);
  });
  it('une seule notification qui résume', () => {
    expect(notification([])).toBeNull();
    const n = notification(formulerRappels([l({}), l({ type: 'death', annee: 1976, prenom: 'Henri' }), l({ annee: 1976, prenom: 'Paul' })], 2026))!;
    expect(n.title).toBe('3 rappels de famille aujourd’hui');
    expect(n.body).toBe('Il y a 100 ans naissait Jeanne Martin · et 2 autres rappels');
  });
});

describe('sélection dans la base', () => {
  let s: Awaited<ReturnType<typeof creerServeur>>;
  let camille: string, arbre: string;
  beforeEach(async () => {
    s = await creerServeur();
    await s.creerCompte('camille');
    camille = await s.connecter('camille');
    arbre = (await s.appel('POST', '/trees', { cookie: camille, body: { name: 'Martin' } })).data.id;
    const api = (m: string, c: string, b?: unknown) => s.appel(m, `/trees/${arbre}${c}`, { cookie: camille, body: b });
    await api('POST', '/persons', { given_names: 'Henri', surname: 'Martin', birth: { date_text: '21/10/1926' }, death: { date_text: '1998' } });
    await api('POST', '/persons', { given_names: 'Jean', surname: 'Martin', birth: { date_text: '10/1926' } }); // jour inconnu : ignoré
    await api('POST', '/persons', { given_names: 'Léo', surname: 'Bissextile', living: true, birth: { date_text: '29/02/2000' } });
  });
  it('trouve les naissances du jour (date complète seulement)', async () => {
    expect((await rappelsDuJour(s.env.DB, 'camille', { y: 2026, m: 10, d: 21 })).map((r) => r.texte)).toEqual(['Il y a 100 ans naissait Henri Martin']);
  });
  it('les personnes nées un 29 février sont fêtées le 28 les années non bissextiles', async () => {
    expect((await rappelsDuJour(s.env.DB, 'camille', { y: 2026, m: 2, d: 28 })).map((r) => r.texte)).toEqual(['Léo Bissextile a 26 ans aujourd’hui']);
  });
  it('réglages par arbre', async () => {
    const r = await s.appel('PUT', `/trees/${arbre}/notifications`, { cookie: camille, body: { births: false } });
    expect(r.data).toMatchObject({ enabled: 1, births: 0, round_only: 1 });
    expect(await rappelsDuJour(s.env.DB, 'camille', { y: 2026, m: 10, d: 21 })).toEqual([]);
  });
  it('abonnement : refuse une adresse ou des clés invalides', async () => {
    expect((await s.appel('POST', '/push/subscribe', { cookie: camille, body: { endpoint: 'http://pas-https', keys: {} } })).status).toBe(400);
  });
});

describe('envoi du matin', () => {
  it('lit correctement l’heure de Paris (« 09 h » → 9)', () => {
    const texte = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric' }).format(new Date(Date.UTC(2026, 9, 21, 7)));
    expect(Number(texte.replace(/\D/g, ''))).toBe(9);
  });
});
