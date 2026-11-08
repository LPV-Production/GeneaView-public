// Tests de la connexion : mot de passe, cookie, blocage, changement de mot de passe.
import { beforeEach, describe, expect, it } from 'vitest';
import { creerServeur } from './outils';

let s: Awaited<ReturnType<typeof creerServeur>>;
beforeEach(async () => {
  s = await creerServeur();
  await s.creerCompte('camille');
});

describe('connexion', () => {
  it('pose un cookie gv_session protégé, valable 60 jours', async () => {
    const r = await s.appel('POST', '/login', { body: { id: 'Camille', password: 'motdepasse-de-test' } });
    expect(r.status).toBe(200);
    expect(r.data.user).toEqual({ id: 'camille', label: 'Camille' });
    expect(r.setCookie).toMatch(/^gv_session=[\w-]{40,};/);
    expect(r.setCookie).toContain('HttpOnly');
    expect(r.setCookie).toContain('Secure');
    expect(r.setCookie).toContain('SameSite=Strict');
    expect(r.setCookie).toContain(`Max-Age=${60 * 86400}`);
  });

  it('ne stocke que l’empreinte du mot de passe', () => {
    const { password_hash } = s.sqlite.prepare('SELECT password_hash FROM users').get() as { password_hash: string };
    expect(password_hash).toMatch(/^pbkdf2\$100000\$[^$]+\$[^$]+$/);
    expect(password_hash).not.toContain('motdepasse');
  });

  it('refuse un mauvais mot de passe ou un compte inconnu, avec le même message', async () => {
    const a = await s.appel('POST', '/login', { body: { id: 'camille', password: 'mauvais-mot-de-passe' } });
    const b = await s.appel('POST', '/login', { body: { id: 'personne', password: 'mauvais-mot-de-passe' } });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.data.error).toBe(b.data.error);
  });

  it('bloque 15 minutes après 5 essais ratés, même avec le bon mot de passe', async () => {
    for (let i = 0; i < 5; i++) await s.appel('POST', '/login', { body: { id: 'camille', password: 'faux-mot-de-passe' } });
    const r = await s.appel('POST', '/login', { body: { id: 'camille', password: 'motdepasse-de-test' } });
    expect(r.status).toBe(429);
    expect(r.data.error).toMatch(/15 min/);
  });

  it('exige d’être connecté pour tout le reste', async () => {
    expect((await s.appel('GET', '/me')).status).toBe(401);
    expect((await s.appel('GET', '/trees')).status).toBe(401);
    expect((await s.appel('GET', '/trees', { cookie: 'gv_session=jeton-invente' })).status).toBe(401);
  });

  it('refuse les modifications envoyées depuis un autre site', async () => {
    const cookie = await s.connecter('camille');
    const r = await s.appel('POST', '/trees', { cookie, body: { name: 'Piège' }, origin: 'https://site-malveillant.example' });
    expect(r.status).toBe(403);
  });

  it('déconnexion : le cookie ne marche plus', async () => {
    const cookie = await s.connecter('camille');
    expect((await s.appel('GET', '/me', { cookie })).status).toBe(200);
    await s.appel('POST', '/logout', { cookie });
    expect((await s.appel('GET', '/me', { cookie })).status).toBe(401);
  });

  it('changer de mot de passe déconnecte les AUTRES appareils seulement', async () => {
    const telephone = await s.connecter('camille');
    const ordinateur = await s.connecter('camille');
    const r = await s.appel('POST', '/password', { cookie: ordinateur, body: { current: 'motdepasse-de-test', next: 'nouveau-mot-de-passe' } });
    expect(r.status).toBe(200);
    expect((await s.appel('GET', '/me', { cookie: ordinateur })).status).toBe(200);
    expect((await s.appel('GET', '/me', { cookie: telephone })).status).toBe(401);
    expect((await s.appel('POST', '/login', { body: { id: 'camille', password: 'nouveau-mot-de-passe' } })).status).toBe(200);
  });

  it('refuse un nouveau mot de passe trop court ou un mot de passe actuel faux', async () => {
    const cookie = await s.connecter('camille');
    expect((await s.appel('POST', '/password', { cookie, body: { current: 'motdepasse-de-test', next: 'court' } })).status).toBe(400);
    expect((await s.appel('POST', '/password', { cookie, body: { current: 'faux', next: 'assez-long-maintenant' } })).status).toBe(403);
  });
});
