// ============================================================
// Contrôle d'accès aux arbres.
// TOUTE route qui touche aux données d'un arbre commence par accesArbre() :
// si le compte n'est pas membre de l'arbre, on répond « introuvable »
// (sans même révéler que l'arbre existe).
// ============================================================
import { HttpError } from './http';

export type Role = 'owner' | 'editor' | 'viewer';

const RANG: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export const ROLE_LIBELLE: Record<Role, string> = { owner: 'propriétaire', editor: 'éditeur', viewer: 'lecteur' };

/**
 * Vérifie que l'utilisateur est membre de l'arbre avec au moins le rôle demandé.
 * - lecteur  (viewer) : lire
 * - éditeur  (editor) : lire et modifier les données généalogiques
 * - propriétaire (owner) : tout, y compris renommer, partager et supprimer l'arbre
 * Renvoie le rôle réel de l'utilisateur.
 */
export async function accesArbre(db: D1Database, userId: string, treeId: string, minimum: Role): Promise<Role> {
  if (!treeId || treeId.length > 64) throw new HttpError(404, 'Arbre introuvable');
  const row = await db
    .prepare('SELECT role FROM tree_members WHERE tree_id = ? AND user_id = ?')
    .bind(treeId, userId)
    .first<{ role: Role }>();
  if (!row) throw new HttpError(404, 'Arbre introuvable');
  if (RANG[row.role] < RANG[minimum]) {
    throw new HttpError(403, `Action réservée au ${ROLE_LIBELLE[minimum]} de l’arbre`);
  }
  return row.role;
}

export const peutModifier = (role: Role) => RANG[role] >= RANG.editor;
