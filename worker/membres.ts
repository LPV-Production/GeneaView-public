// ============================================================
// Partage d'un arbre avec d'autres comptes (table tree_members).
//   GET    /api/trees/<arbre>/members            liste (tous les membres)
//   POST   /api/trees/<arbre>/members            { user_id, role }  (propriétaire)
//   PUT    /api/trees/<arbre>/members/<compte>   { role }           (propriétaire)
//   DELETE /api/trees/<arbre>/members/<compte>   retirer (propriétaire), ou quitter l'arbre (soi-même)
//
// Les comptes sont toujours créés par le script (pas d'inscription publique) :
// le propriétaire indique l'identifiant de connexion de la personne invitée.
// ============================================================
import { HttpError, json, readBody } from './http';
import type { Role } from './acces';
import type { Ctx } from './index';

const ROLES_PARTAGE = ['editor', 'viewer'] as const;

async function liste(db: D1Database, treeId: string) {
  const { results } = await db.prepare(`
    SELECT m.user_id, u.label, m.role, m.added_at FROM tree_members m JOIN users u ON u.id = m.user_id
    WHERE m.tree_id = ? ORDER BY m.role = 'owner' DESC, u.label`).bind(treeId).all();
  return results;
}

export async function routeMembres({ req, db, user, method }: Ctx, treeId: string, role: Role, compte?: string): Promise<Response> {
  const proprietaire = role === 'owner';

  if (!compte && method === 'GET') return json({ members: await liste(db, treeId) });

  if (!compte && method === 'POST') {
    if (!proprietaire) throw new HttpError(403, 'Seul le propriétaire peut partager l’arbre');
    const body = await readBody(req);
    const id = String(body.user_id ?? '').trim().toLowerCase();
    if (!ROLES_PARTAGE.includes(body.role as never)) throw new HttpError(400, 'Rôle invalide (lecteur ou éditeur)');
    if (!id || id.length > 50) throw new HttpError(400, 'Indiquez l’identifiant du compte');
    if (id === user.id) throw new HttpError(400, 'Vous êtes déjà propriétaire de cet arbre');
    const existe = await db.prepare('SELECT 1 FROM users WHERE id = ?').bind(id).first();
    if (!existe) throw new HttpError(404, `Aucun compte « ${id} ». Les comptes se créent avec « npm run compte ».`);
    await db.prepare(`INSERT INTO tree_members (tree_id, user_id, role) VALUES (?, ?, ?)
      ON CONFLICT(tree_id, user_id) DO UPDATE SET role = excluded.role WHERE tree_members.role != 'owner'`).bind(treeId, id, body.role).run();
    return json({ members: await liste(db, treeId) }, 201);
  }

  if (compte) {
    const cible = await db.prepare('SELECT role FROM tree_members WHERE tree_id = ? AND user_id = ?').bind(treeId, compte).first<{ role: Role }>();
    if (!cible) throw new HttpError(404, 'Ce compte n’a pas accès à cet arbre');
    if (cible.role === 'owner') throw new HttpError(400, 'Le propriétaire ne peut pas être retiré ni changer de rôle');

    if (method === 'PUT') {
      if (!proprietaire) throw new HttpError(403, 'Seul le propriétaire peut changer les rôles');
      const body = await readBody(req);
      if (!ROLES_PARTAGE.includes(body.role as never)) throw new HttpError(400, 'Rôle invalide (lecteur ou éditeur)');
      await db.prepare('UPDATE tree_members SET role = ? WHERE tree_id = ? AND user_id = ?').bind(body.role, treeId, compte).run();
      return json({ members: await liste(db, treeId) });
    }
    if (method === 'DELETE') {
      // Le propriétaire retire quelqu'un, ou un membre quitte lui-même l'arbre
      if (!proprietaire && compte !== user.id) throw new HttpError(403, 'Seul le propriétaire peut retirer un membre');
      await db.batch([
        db.prepare('DELETE FROM tree_members WHERE tree_id = ? AND user_id = ?').bind(treeId, compte),
        db.prepare('DELETE FROM notification_prefs WHERE tree_id = ? AND user_id = ?').bind(treeId, compte),
      ]);
      return json({ members: compte === user.id ? [] : await liste(db, treeId) });
    }
  }
  throw new HttpError(404, 'Adresse inconnue');
}
