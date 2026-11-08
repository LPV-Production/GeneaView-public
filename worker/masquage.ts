// ============================================================
// Masquage des personnes vivantes pour les LECTEURS d'un arbre partagé.
//
// Une personne cochée « vivante » apparaît aux lecteurs comme
// « Personne vivante » : sans prénom, nom, surnom, profession, notes,
// photo, événements, sources ni documents. Sa place dans l'arbre
// (parents, enfants) reste visible, pour que l'arbre garde sa forme.
// Les événements d'une union dont un conjoint est vivant (mariage…)
// sont masqués aussi.
//
// Une union marquée « cachée aux lecteurs » (ex. une liaison secrète) disparaît
// complètement pour eux : l'union, ses événements, ses sources, ses documents,
// et le lien de ses enfants avec ce couple.
//
// Ce filtre est appliqué par le SERVEUR, avant tout envoi : les données
// masquées ne quittent jamais Cloudflare.
// ============================================================
type Ligne = Record<string, unknown>;

export type DonneesBrutes = {
  persons: Ligne[]; families: Ligne[]; children: Ligne[]; events: Ligne[]; places: Ligne[]; todos: Ligne[];
  sources: Ligne[]; citations: Ligne[]; media: Ligne[]; media_links: Ligne[];
};

export const NOM_MASQUE = 'Personne vivante';

export function masquerVivants(d: DonneesBrutes): DonneesBrutes {
  return masquerPersonnesVivantes(retirerUnionsCachees(d));
}

function retirerUnionsCachees(d: DonneesBrutes): DonneesBrutes {
  const cachees = new Set(d.families.filter((f) => f.hidden).map((f) => f.id as string));
  if (!cachees.size) return d;
  const evenements = new Set(d.events.filter((e) => cachees.has(e.family_id as string)).map((e) => e.id as string));
  const garde = (x: Ligne) => !cachees.has(x.family_id as string) && !evenements.has(x.event_id as string);
  const liens = d.media_links.filter(garde);
  // Un document lié à une union cachée est caché partout
  const mediasCaches = new Set(d.media_links.filter((l) => !garde(l)).map((l) => l.media_id as string));
  return {
    ...d,
    families: d.families.filter((f) => !cachees.has(f.id as string)),
    children: d.children.filter((c) => !cachees.has(c.family_id as string)),
    events: d.events.filter((e) => !evenements.has(e.id as string)),
    citations: d.citations.filter(garde),
    media: d.media.filter((m) => !mediasCaches.has(m.id as string)),
    media_links: liens.filter((l) => !mediasCaches.has(l.media_id as string)),
  };
}

function masquerPersonnesVivantes(d: DonneesBrutes): DonneesBrutes {
  const vivants = new Set(d.persons.filter((p) => p.living).map((p) => p.id as string));
  if (!vivants.size) return d;
  const unions = new Set(d.families.filter((f) => vivants.has(f.partner1_id as string) || vivants.has(f.partner2_id as string)).map((f) => f.id as string));
  const evenements = new Set(d.events.filter((e) => vivants.has(e.person_id as string) || unions.has(e.family_id as string)).map((e) => e.id as string));
  const masque = (x: Ligne) => vivants.has(x.person_id as string) || evenements.has(x.event_id as string);

  const liens = d.media_links.filter((l) => !masque(l) && !(l.family_id && unions.has(l.family_id as string)));
  const mediasVisibles = new Set(liens.map((l) => l.media_id as string));
  // Un document rattaché à une personne vivante est caché, même s'il l'est aussi ailleurs
  const mediasCaches = new Set(d.media_links.filter((l) => !liens.includes(l)).map((l) => l.media_id as string));

  const evenementsVisibles = d.events.filter((e) => !evenements.has(e.id as string));
  // Seulement les lieux encore utilisés : un lieu propre à une personne vivante ne doit pas apparaître
  const lieuxUtilises = new Set(evenementsVisibles.map((e) => e.place_id as string));
  const citationsVisibles = d.citations.filter((c) => !masque(c) && !(c.family_id && unions.has(c.family_id as string)));
  // Une source citée UNIQUEMENT pour des personnes vivantes (« Acte de naissance de … ») est cachée
  const sourcesCitees = new Set(d.citations.map((c) => c.source_id as string));
  const sourcesVisibles = new Set(citationsVisibles.map((c) => c.source_id as string));

  return {
    persons: d.persons.map((p) => (vivants.has(p.id as string)
      ? { ...p, given_names: NOM_MASQUE, surname: '', married_name: '', nickname: '', occupations: '', notes: '', photo_media_id: null, masked: 1 }
      : p)),
    families: d.families.map((f) => (unions.has(f.id as string) ? { ...f, notes: '' } : f)),
    children: d.children,
    events: evenementsVisibles,
    places: d.places.filter((l) => lieuxUtilises.has(l.id as string)),
    todos: d.todos.filter((t) => !vivants.has(t.person_id as string)),
    sources: d.sources.filter((x) => !sourcesCitees.has(x.id as string) || sourcesVisibles.has(x.id as string)),
    citations: citationsVisibles,
    media: d.media.filter((m) => mediasVisibles.has(m.id as string) && !mediasCaches.has(m.id as string)),
    media_links: liens.filter((l) => !mediasCaches.has(l.media_id as string)),
  };
}

/**
 * Un lecteur peut-il voir ce document ? Non s'il est rattaché à une personne vivante,
 * à l'un de ses événements, à une union dont un conjoint est vivant, ou à une union cachée.
 */
export async function documentVisiblePourLecteur(db: D1Database, mediaId: string) {
  const r = await db.prepare(`
    SELECT 1 FROM media_links l
    LEFT JOIN persons p ON p.id = l.person_id
    LEFT JOIN events e ON e.id = l.event_id
    LEFT JOIN persons pe ON pe.id = e.person_id
    LEFT JOIN families fe ON fe.id = e.family_id
    LEFT JOIN families f ON f.id = l.family_id
    WHERE l.media_id = ?1 AND (
      p.living = 1 OR pe.living = 1 OR f.hidden = 1 OR fe.hidden = 1
      OR EXISTS (SELECT 1 FROM persons x WHERE x.living = 1 AND x.id IN (f.partner1_id, f.partner2_id, fe.partner1_id, fe.partner2_id))
    ) LIMIT 1`).bind(mediaId).first();
  return !r;
}
