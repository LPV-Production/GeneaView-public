// Outils communs aux tests : un serveur prêt à l'emploi, des comptes, des requêtes.
import worker, { type Env } from '../worker/index';
import { hashPassword } from '../worker/auth';
import { creerD1, creerR2 } from './d1-local';

const ORIGINE = 'https://geneaview.test';

export async function creerServeur() {
  const { d1, sqlite } = creerD1();
  const r2 = creerR2();
  const env = { DB: d1, FILES: r2 as unknown as R2Bucket, ASSETS: { fetch: async () => new Response('page') } } as unknown as Env;

  /** Envoie une requête au serveur, comme le ferait l'appli. */
  async function appel(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string } = {}) {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (opts.cookie) headers.cookie = opts.cookie;
    if (opts.origin !== undefined) headers.origin = opts.origin;
    else if (method !== 'GET') headers.origin = ORIGINE;
    const res = await worker.fetch(
      new Request(ORIGINE + '/api' + path, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined }),
      env,
    );
    const data = (await res.json().catch(() => ({}))) as any;
    return { status: res.status, data, setCookie: res.headers.get('set-cookie') };
  }

  /** Crée un compte directement en base (comme le script npm run compte). */
  async function creerCompte(id: string, motDePasse = 'motdepasse-de-test') {
    sqlite.prepare('INSERT INTO users (id, label, password_hash) VALUES (?, ?, ?)').run(id, id[0].toUpperCase() + id.slice(1), await hashPassword(motDePasse));
  }

  /** Se connecte et renvoie le cookie de session à réutiliser. */
  async function connecter(id: string, motDePasse = 'motdepasse-de-test') {
    const r = await appel('POST', '/login', { body: { id, password: motDePasse } });
    if (r.status !== 200) throw new Error(`Connexion impossible : ${r.data.error}`);
    return r.setCookie!.split(';')[0];
  }

  return { env, sqlite, r2, appel, creerCompte, connecter };
}
