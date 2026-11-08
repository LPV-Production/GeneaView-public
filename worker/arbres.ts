// ============================================================
// Routes des arbres : liste, création, modification, suppression.
//   GET    /api/trees          → mes arbres (ceux dont je suis membre)
//   POST   /api/trees          → nouvel arbre (j'en deviens propriétaire)
//   GET    /api/trees/:id      → un arbre (lecteur minimum)
//   PUT    /api/trees/:id      → renommer / décrire (propriétaire)
//   DELETE /api/trees/:id      → supprimer l'arbre ET ses fichiers (propriétaire)
// ============================================================
import { accesArbre } from './acces';
import { routeDonnees } from './donnees';
import { routeMembres } from './membres';
import { routeInvitationsArbre } from './invitations';
import { routePrefs } from './rappels';
import { clean, HttpError, json, nowSql, readBody, setClause, type FieldType } from './http';
import type { Ctx } from './index';

const TREE_FIELDS: Record<string, FieldType> = { name: 'text', description: 'longtext' };

const SELECT_ARBRE = `
  SELECT t.id, t.name, t.description, t.root_person_id, t.created_at, t.updated_at,
         m.role, u.label AS owner_label,
         (SELECT COUNT(*) FROM persons p WHERE p.tree_id = t.id) AS person_count
  FROM tree_members m
  JOIN trees t ON t.id = m.tree_id
  JOIN users u ON u.id = t.owner_id`;

function nomValide(data: Record<string, string | number>) {
  if ('name' in data) {
    const name = String(data.name);
    if (!name) throw new HttpError(400, 'Le nom de l’arbre est obligatoire');
    if (name.length > 100) throw new HttpError(400, 'Nom trop long (100 caractères maximum)');
  }
}

/** Efface tous les fichiers R2 d'un arbre (photos, documents, miniatures). */
export async function supprimerFichiers(bucket: R2Bucket, treeId: string) {
  // On repart du début après chaque lot effacé : la liste raccourcit, aucun fichier n'est sauté
  for (;;) {
    const page = await bucket.list({ prefix: `trees/${treeId}/` });
    if (!page.objects.length) return;
    await bucket.delete(page.objects.map((o) => o.key));
  }
}

export async function routeArbres(ctx: Ctx, seg: string[]): Promise<Response> {
  const { req, env, db, user, method } = ctx;
  const id = seg[0];

  if (!id && method === 'GET') {
    const { results } = await db.prepare(`${SELECT_ARBRE} WHERE m.user_id = ? ORDER BY t.updated_at DESC`).bind(user.id).all();
    return json({ trees: results });
  }

  if (!id && method === 'POST') {
    const data = clean(await readBody(req), TREE_FIELDS, true);
    if (!('name' in data)) throw new HttpError(400, 'Le nom de l’arbre est obligatoire');
    nomValide(data);
    const treeId = crypto.randomUUID();
    await db.batch([
      db.prepare('INSERT INTO trees (id, name, description, owner_id) VALUES (?, ?, ?, ?)').bind(treeId, data.name, data.description ?? '', user.id),
      db.prepare("INSERT INTO tree_members (tree_id, user_id, role) VALUES (?, ?, 'owner')").bind(treeId, user.id),
    ]);
    const tree = await db.prepare(`${SELECT_ARBRE} WHERE m.user_id = ? AND t.id = ?`).bind(user.id, treeId).first();
    return json(tree, 201);
  }

  if (id && seg.length === 1) {
    if (method === 'GET') {
      await accesArbre(db, user.id, id, 'viewer');
      return json(await db.prepare(`${SELECT_ARBRE} WHERE m.user_id = ? AND t.id = ?`).bind(user.id, id).first());
    }
    if (method === 'PUT') {
      await accesArbre(db, user.id, id, 'owner');
      const data = clean(await readBody(req), TREE_FIELDS, true);
      nomValide(data);
      if (!Object.keys(data).length) throw new HttpError(400, 'Rien à modifier');
      const set = setClause({ ...data, updated_at: nowSql() });
      await db.prepare(`UPDATE trees SET ${set.sql} WHERE id = ?`).bind(...set.values, id).run();
      return json(await db.prepare(`${SELECT_ARBRE} WHERE m.user_id = ? AND t.id = ?`).bind(user.id, id).first());
    }
    if (method === 'DELETE') {
      await accesArbre(db, user.id, id, 'owner');
      // Les fichiers d'abord : s'il y a un souci, l'arbre existe encore et on peut réessayer
      if (env.FILES) await supprimerFichiers(env.FILES, id);
      await db.prepare('DELETE FROM trees WHERE id = ?').bind(id).run(); // tout le reste suit (ON DELETE CASCADE)
      return json({ ok: true });
    }
  }

  // Réglages des rappels de cet arbre, propres à chaque compte (rappels.ts)
  if (id && seg[1] === 'notifications' && seg.length === 2) {
    await accesArbre(db, user.id, id, 'viewer');
    return routePrefs(ctx, id);
  }

  // Partage : tout membre voit la liste et peut quitter l'arbre ; le reste est réservé au propriétaire (membres.ts)
  if (id && seg[1] === 'members' && seg.length <= 3) {
    const role = await accesArbre(db, user.id, id, 'viewer');
    return routeMembres(ctx, id, role, seg[2]);
  }

  // Liens d'invitation (propriétaire seulement, invitations.ts)
  if (id && seg[1] === 'invitations' && seg.length <= 3) {
    const role = await accesArbre(db, user.id, id, 'viewer');
    return routeInvitationsArbre(ctx, id, role, seg[2]);
  }

  // Données de l'arbre (/api/trees/<id>/…) : lecture pour tous les membres, écriture pour les éditeurs.
  // Le rôle est transmis : pour un lecteur, les personnes vivantes sont masquées.
  if (id && seg.length > 1) {
    const role = await accesArbre(db, user.id, id, method === 'GET' ? 'viewer' : 'editor');
    return routeDonnees(ctx, id, seg.slice(1), role);
  }

  throw new HttpError(404, 'Adresse inconnue');
}
