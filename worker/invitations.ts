// ============================================================
// Invitations : partager un arbre avec quelqu'un qui n'a pas encore de compte.
//
// Côté propriétaire de l'arbre (connecté) :
//   GET    /api/trees/<arbre>/invitations          invitations en attente
//   POST   /api/trees/<arbre>/invitations          { role } → crée un code (montré une seule fois)
//   DELETE /api/trees/<arbre>/invitations/<id>     annuler une invitation
//
// Côté invité (le lien reçu par SMS…) :
//   GET    /api/invitations/<code>                 à quoi donne accès ce code (sans être connecté)
//   POST   /api/invitations/<code>/accept          { id, label, password } → crée le compte, rejoint l'arbre, connecte
//   POST   /api/invitations/<code>/join            (déjà connecté) → rejoint l'arbre avec son compte
//
// Un code sert une seule fois et expire au bout de 7 jours. Seule son empreinte est en base.
// ============================================================
import { hashPassword, ouvrirSession, sha256, type User } from './auth';
import { HttpError, json, readBody } from './http';
import type { Role } from './acces';
import type { Ctx } from './index';

const DUREE_MS = 7 * 86_400_000;
const MAX_EN_ATTENTE = 20; // par arbre
const ROLES = ['editor', 'viewer'] as const;
// Sans 0/O ni 1/I/L, pour pouvoir le recopier sans erreur : 12 caractères ≈ 60 bits de hasard
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function nouveauCode() {
  const octets = crypto.getRandomValues(new Uint8Array(12));
  const c = [...octets].map((o) => ALPHABET[o % ALPHABET.length]).join('');
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
}

/** « k7qm 3xpa-… » → « K7QM3XPA… » : on ignore tirets, espaces et majuscules. */
const normaliser = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const empreinte = (code: string) => sha256('invitation:' + normaliser(code));

async function enAttente(db: D1Database, treeId: string) {
  const { results } = await db.prepare(`SELECT id, role, created_at, expires_at FROM invitations
    WHERE tree_id = ? AND used_by IS NULL AND expires_at > ? ORDER BY created_at DESC`).bind(treeId, Date.now()).all();
  return results;
}

/** Routes du propriétaire, sous /api/trees/<arbre>/invitations. */
export async function routeInvitationsArbre({ req, db, user, method }: Ctx, treeId: string, role: Role, invId?: string): Promise<Response> {
  if (role !== 'owner') throw new HttpError(403, 'Seul le propriétaire peut inviter');

  if (!invId && method === 'GET') return json({ invitations: await enAttente(db, treeId) });

  if (!invId && method === 'POST') {
    const body = await readBody(req);
    if (!ROLES.includes(body.role as never)) throw new HttpError(400, 'Rôle invalide (lecteur ou éditeur)');
    if ((await enAttente(db, treeId)).length >= MAX_EN_ATTENTE) throw new HttpError(429, 'Trop d’invitations en attente : annulez-en quelques-unes');
    const code = nouveauCode();
    const now = Date.now();
    await db.batch([
      // Ménage : les invitations expirées ne servent plus à rien
      db.prepare('DELETE FROM invitations WHERE tree_id = ? AND used_by IS NULL AND expires_at <= ?').bind(treeId, now),
      db.prepare('INSERT INTO invitations (id, code_hash, tree_id, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), await empreinte(code), treeId, body.role, user.id, now, now + DUREE_MS),
    ]);
    return json({ code, invitations: await enAttente(db, treeId) }, 201);
  }

  if (invId && method === 'DELETE') {
    await db.prepare('DELETE FROM invitations WHERE id = ? AND tree_id = ? AND used_by IS NULL').bind(invId, treeId).run();
    return json({ invitations: await enAttente(db, treeId) });
  }
  throw new HttpError(404, 'Adresse inconnue');
}

type Invitation = { id: string; tree_id: string; tree_name: string; role: 'editor' | 'viewer'; invited_by: string | null; expires_at: number };

/** L'invitation correspondant à ce code, si elle est encore utilisable. */
async function trouver(db: D1Database, code: string): Promise<Invitation> {
  if (normaliser(code).length !== 12) throw new HttpError(404, 'Invitation introuvable');
  const inv = await db.prepare(`SELECT i.id, i.tree_id, t.name AS tree_name, i.role, u.label AS invited_by, i.expires_at
    FROM invitations i JOIN trees t ON t.id = i.tree_id LEFT JOIN users u ON u.id = i.created_by
    WHERE i.code_hash = ? AND i.used_by IS NULL AND i.expires_at > ?`).bind(await empreinte(code), Date.now()).first<Invitation>();
  if (!inv) throw new HttpError(404, 'Cette invitation n’existe pas, a déjà servi ou a expiré. Demandez-en une nouvelle.');
  return inv;
}

/** Réserve l'invitation pour ce compte ; une seule personne peut l'utiliser, même en cas de double clic. */
async function reserver(db: D1Database, inv: Invitation, userId: string) {
  const r = await db.prepare('UPDATE invitations SET used_by = ?, used_at = ? WHERE id = ? AND used_by IS NULL AND expires_at > ?')
    .bind(userId, Date.now(), inv.id, Date.now()).run();
  if (!r.meta.changes) throw new HttpError(404, 'Cette invitation vient d’être utilisée. Demandez-en une nouvelle.');
}

/** Donne l'accès ; un membre déjà présent garde le rôle le plus élevé. */
const ajouterMembre = (db: D1Database, inv: Invitation, userId: string) =>
  db.prepare(`INSERT INTO tree_members (tree_id, user_id, role) VALUES (?, ?, ?)
    ON CONFLICT(tree_id, user_id) DO UPDATE SET role = excluded.role WHERE tree_members.role = 'viewer'`).bind(inv.tree_id, userId, inv.role);

/** Routes publiques /api/invitations/<code>[/accept|/join]. */
export async function routeInvitation(req: Request, db: D1Database, user: User | null, code: string, action?: string): Promise<Response> {
  const method = req.method;
  const inv = await trouver(db, code);

  if (!action && method === 'GET') {
    return json({ tree_name: inv.tree_name, role: inv.role, invited_by: inv.invited_by, expires_at: inv.expires_at });
  }

  // Création du compte par l'invité lui-même
  if (action === 'accept' && method === 'POST') {
    const body = await readBody(req);
    const id = String(body.id ?? '').trim().toLowerCase();
    const label = String(body.label ?? '').trim().replace(/\s+/g, ' ');
    const password = String(body.password ?? '');
    if (!/^[a-z0-9_-]{2,30}$/.test(id)) throw new HttpError(400, 'Identifiant : 2 à 30 caractères, lettres minuscules sans accent, chiffres, - ou _');
    if (!label || label.length > 60) throw new HttpError(400, 'Indiquez votre prénom ou votre nom (60 caractères maximum)');
    if (password.length < 10) throw new HttpError(400, 'Le mot de passe doit faire au moins 10 caractères');
    if (password.length > 200) throw new HttpError(400, 'Mot de passe trop long');
    if (await db.prepare('SELECT 1 FROM users WHERE id = ?').bind(id).first()) {
      throw new HttpError(409, `L’identifiant « ${id} » est déjà pris. Choisissez-en un autre, ou connectez-vous si c’est le vôtre.`);
    }
    const hash = await hashPassword(password);
    await reserver(db, inv, id);
    try {
      await db.batch([
        db.prepare('INSERT INTO users (id, label, password_hash) VALUES (?, ?, ?)').bind(id, label, hash),
        ajouterMembre(db, inv, id),
      ]);
    } catch (e) {
      // Compte non créé (identifiant pris entre-temps…) : l'invitation redevient utilisable
      await db.prepare('UPDATE invitations SET used_by = NULL, used_at = NULL WHERE id = ?').bind(inv.id).run();
      throw e;
    }
    const session = await ouvrirSession(db, { id, label });
    return json({ user: session.user, tree_id: inv.tree_id }, 201, { 'set-cookie': session.cookie });
  }

  // Compte déjà existant et connecté
  if (action === 'join' && method === 'POST') {
    if (!user) throw new HttpError(401, 'Non connecté');
    await reserver(db, inv, user.id);
    await ajouterMembre(db, inv, user.id).run();
    return json({ tree_id: inv.tree_id });
  }
  throw new HttpError(404, 'Adresse inconnue');
}
