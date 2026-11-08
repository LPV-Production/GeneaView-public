// ============================================================
// GENEAVIEW — serveur (Cloudflare Worker)
// Reçoit les demandes de l'appli (/api/...), vérifie qui est connecté,
// puis lit / écrit dans la base D1 et les fichiers R2.
// Chaque donnée appartient à un arbre : avant d'y toucher, le serveur
// vérifie que le compte est membre de cet arbre (voir acces.ts).
// ============================================================
import { changePassword, currentUser, login, logout, type User } from './auth';
import { routeArbres } from './arbres';
import { routeInvitation } from './invitations';
import { HttpError, json, readBody, todayParis } from './http';
import { sendPush, unb64url, type PushKeys, type Subscription } from './push';
import { notification, rappelsDuJour } from './rappels';
import { ESPACE_MAX, espaceUtilise } from './documents';

export interface Env extends PushKeys {
  DB: D1Database;
  /** Stockage des photos et documents ; absent tant que R2 n'est pas activé sur le compte Cloudflare */
  FILES?: R2Bucket;
  ASSETS: Fetcher;
}

/** Ce que reçoit chaque groupe de routes. */
export interface Ctx {
  req: Request;
  env: Env;
  db: D1Database;
  user: User;
  method: string;
  url: URL;
}

async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const db = env.DB;
  const method = req.method;
  const path = url.pathname.replace(/\/+$/, '');

  // Protection contre les requêtes envoyées depuis un autre site
  if (method !== 'GET' && method !== 'HEAD' && req.headers.get('origin') && req.headers.get('origin') !== url.origin) {
    throw new HttpError(403, 'Origine refusée');
  }

  if (path === '/api/login' && method === 'POST') {
    const body = await readBody(req);
    const { user, cookie } = await login(db, body.id, body.password);
    return json({ user }, 200, { 'set-cookie': cookie });
  }
  if (path === '/api/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': await logout(db, req) });
  }

  const seg = path.split('/').slice(2); // ex. ['trees', '<id>']

  // Lien d'invitation : consultable et utilisable sans compte (invitations.ts)
  if (seg[0] === 'invitations' && seg[1] && seg.length <= 3) {
    return routeInvitation(req, db, await currentUser(db, req), seg[1], seg[2]);
  }

  // Tout le reste demande d'être connecté
  const user = await currentUser(db, req);
  if (!user) throw new HttpError(401, 'Non connecté');
  const ctx: Ctx = { req, env, db, user, method, url };

  if (path === '/api/me' && method === 'GET') return json({ user });
  if (path === '/api/password' && method === 'POST') {
    const body = await readBody(req);
    await changePassword(db, req, user, body.current, body.next);
    return json({ ok: true });
  }
  if (seg[0] === 'trees') return routeArbres(ctx, seg.slice(1));
  // Espace occupé par les photos et documents (tous arbres confondus)
  if (path === '/api/storage' && method === 'GET') return json({ used: await espaceUtilise(db), max: ESPACE_MAX });

  // ----- Notifications (abonnement de l'appareil) -----
  if (seg[0] === 'push') {
    if (seg[1] === 'key' && method === 'GET') {
      if (!env.VAPID_PUBLIC_KEY) throw new HttpError(503, 'Notifications pas encore configurées sur le serveur');
      return json({ key: env.VAPID_PUBLIC_KEY });
    }
    if (seg[1] === 'subscribe' && method === 'POST') {
      const sub = lireAbonnement(await readBody(req));
      // Un appareil = un abonnement ; s'il change de compte, il est rattaché au nouveau
      await db.prepare(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`)
        .bind(sub.endpoint, user.id, sub.p256dh, sub.auth).run();
      return json({ ok: true }, 201);
    }
    if (seg[1] === 'unsubscribe' && method === 'POST') {
      const endpoint = String((await readBody(req)).endpoint ?? '');
      await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(endpoint, user.id).run();
      return json({ ok: true });
    }
    if (seg[1] === 'test' && method === 'POST') {
      const endpoint = String((await readBody(req)).endpoint ?? '');
      const sub = await db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(endpoint, user.id).first<Subscription>();
      if (!sub) throw new HttpError(404, 'Cet appareil n’est pas abonné');
      const n = notification(await rappelsDuJour(db, user.id, aujourdhuiParis()));
      const r = await sendPush(sub, {
        title: 'Notifications activées ✓',
        body: n ? `Aujourd’hui : ${n.body}` : 'Vous serez prévenu à 9 h les jours d’anniversaire dans vos arbres.',
        tag: 'test', url: '/',
      }, env, url.origin);
      if (r === 'gone') await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
      if (r !== 'ok') throw new HttpError(502, 'Le service de notification a refusé l’envoi');
      return json({ ok: true });
    }
  }

  throw new HttpError(404, 'Adresse inconnue');
}

function lireAbonnement(body: Record<string, unknown>): Subscription {
  const endpoint = String(body.endpoint ?? '');
  const keys = (body.keys ?? {}) as Record<string, unknown>;
  const p256dh = String(keys.p256dh ?? ''), auth = String(keys.auth ?? '');
  let ok = endpoint.startsWith('https://') && endpoint.length < 1000;
  try { ok &&= unb64url(p256dh).length === 65 && unb64url(auth).length === 16; } catch { ok = false; }
  if (!ok) throw new HttpError(400, 'Abonnement invalide');
  return { endpoint, p256dh, auth };
}

/** Date du jour à Paris, en nombres. */
function aujourdhuiParis() {
  const [y, m, d] = todayParis().split('-').map(Number);
  return { y, m, d };
}

/** Chaque matin : une notification par appareil abonné, seulement s'il y a un rappel. */
async function envoyerRappels(env: Env) {
  const jour = aujourdhuiParis();
  const { results: abonnements } = await env.DB.prepare('SELECT endpoint, user_id, p256dh, auth FROM push_subscriptions').all<Subscription & { user_id: string }>();
  const parCompte = new Map<string, ReturnType<typeof notification>>();
  for (const sub of abonnements) {
    try {
      if (!parCompte.has(sub.user_id)) parCompte.set(sub.user_id, notification(await rappelsDuJour(env.DB, sub.user_id, jour)));
      const n = parCompte.get(sub.user_id);
      if (!n) continue;
      const r = await sendPush(sub, n, env, env.VAPID_SUBJECT || '');
      if (r === 'gone') await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(sub.endpoint).run();
    } catch (e) {
      console.error('Rappel non envoyé', sub.user_id, e); // un appareil en erreur ne bloque pas les autres
    }
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Erreur du serveur' }, 500);
    }
  },

  // Déclenché par Cloudflare à 7 h et 8 h UTC : on n'envoie qu'à 9 h, heure de Paris (été comme hiver)
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    // « 09 h » → 9 (on ne garde que les chiffres)
    const heure = Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric' }).format(new Date()).replace(/\D/g, ''));
    if (heure !== 9 || !env.VAPID_PRIVATE_KEY) return;
    ctx.waitUntil(envoyerRappels(env));
  },
} satisfies ExportedHandler<Env>;

export type { User };
