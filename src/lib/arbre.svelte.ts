// ============================================================
// Les données de l'arbre ouvert, gardées dans le navigateur.
// Tout l'arbre est chargé d'un coup (rapide, même avec 2 000 personnes),
// puis chaque modification renvoie un « paquet » que l'on fusionne ici.
//
// Pour que l'écran se mette à jour, les composants lisent `arbre.version` :
// elle augmente à chaque changement.
// ============================================================
import { api } from './api';
import { app, toast } from './store.svelte';
import { ApiError } from './api';
import type { Qualif } from '../../commun/dates';
import type { FinUnion, LienEnfant, Relation, TypeEvenement, TypeUnion } from '../../commun/libelles';
import { DonneesArbre, type ATrouver, type Cible, type Paquet, type Personne, type Source } from './donnees';
import type { FichierPret } from './images';
import { calculerSosa, toutesAlertes, type Alerte } from './analyse';
export type { ATrouver, Cible, Citation, Evenement, Lieu, LienUnionEnfant, Media, MediaLien, Paquet, Personne, Source, Union } from './donnees';
export { DonneesArbre } from './donnees';

export const arbre = $state({
  treeId: null as string | null,
  etat: 'vide' as 'vide' | 'chargement' | 'pret' | 'erreur',
  erreur: '',
  version: 0,
});

/** Formulaires ouverts par-dessus l'écran (un seul de chaque à la fois). */
export const ui = $state({
  personne: null as null | { personId?: string; relation?: RelationSaisie; sexe?: 'M' | 'F' },
  evenement: null as null | { id?: string; person_id?: string; family_id?: string },
  union: null as null | { id: string },
  citation: null as null | { cible: Cible },
  source: null as null | { id: string; citationId?: string },
  parente: null as null | { a: string },
  /** Fenêtre « Changer les parents » d'un enfant */
  parents: null as null | { childId: string },
});

/** Les données (objet ordinaire, non réactif) : lire `arbre.version` pour suivre les changements. */
export let D = new DonneesArbre();

function appliquer(p: Paquet) {
  D.fusionner(p);
  arbre.version++;
  // Met à jour le compteur et la date de l'arbre dans la liste de l'accueil
  const a = app.arbres.find((t) => t.id === arbre.treeId);
  if (a) {
    a.person_count = D.personnes.size;
    a.updated_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
  }
}

export async function chargerArbre(treeId: string) {
  if (arbre.treeId === treeId && arbre.etat !== 'erreur') return;
  arbre.treeId = treeId;
  arbre.etat = 'chargement';
  try {
    const p = await api<Paquet>('GET', `/trees/${treeId}/data`);
    if (arbre.treeId !== treeId) return; // un autre arbre a été ouvert entre-temps
    D = new DonneesArbre(p);
    arbre.etat = 'pret';
    arbre.version++;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return;
    arbre.erreur = e instanceof Error ? e.message : String(e);
    arbre.etat = 'erreur';
  }
}

/** Oublie l'arbre en mémoire (déconnexion, suppression). */
export function oublierArbre() {
  arbre.treeId = null;
  arbre.etat = 'vide';
  D = new DonneesArbre();
  arbre.version++;
}

/** Envoie une modification et fusionne la réponse. Renvoie la réponse, ou undefined en cas d'erreur (affichée). */
async function envoyer<T extends Paquet>(method: string, chemin: string, body?: unknown, message?: string): Promise<T | undefined> {
  if (app.busy || !arbre.treeId) return;
  app.busy = true;
  try {
    const p = await api<T>(method, `/trees/${arbre.treeId}${chemin}`, body);
    appliquer(p);
    if (message) toast(message);
    return p;
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) toast(e instanceof Error ? e.message : 'Erreur inattendue', true);
  } finally {
    app.busy = false;
  }
}

/* ---------- Personnes ---------- */
export type DateLieuSaisis = { date_qual: Qualif; date_text: string; place: string };
export type PersonneSaisie = Partial<Omit<Personne, 'id' | 'living' | 'photo_media_id' | 'created_at' | 'updated_at'>> & {
  living?: boolean; birth?: DateLieuSaisis; death?: DateLieuSaisis;
};
/** family_id : union choisie, ou 'nouvelle' (autre parent inconnu) ; other_id : l'autre parent, déjà dans l'arbre */
export type RelationSaisie = { type: Relation; of: string; family_id?: string; other_id?: string; union_type?: TypeUnion };

export async function creerPersonne(data: PersonneSaisie, relation?: RelationSaisie) {
  const r = await envoyer<Paquet & { id: string }>('POST', '/persons', { ...data, relation }, 'Personne ajoutée');
  return r?.id;
}
export const modifierPersonne = async (id: string, data: PersonneSaisie) => !!(await envoyer('PUT', `/persons/${id}`, data, 'Fiche enregistrée'));
export const supprimerPersonne = async (id: string) => !!(await envoyer('DELETE', `/persons/${id}`, undefined, 'Personne supprimée'));
export const lierExistant = async (relation: RelationSaisie, personId: string) =>
  !!(await envoyer('POST', '/links', { ...relation, person_id: personId }, 'Lien ajouté'));

export async function definirRacine(personId: string | null) {
  if (!arbre.treeId) return;
  try {
    const r = await api<{ root_person_id: string | null }>('PUT', `/trees/${arbre.treeId}/root`, { person_id: personId });
    const a = app.arbres.find((t) => t.id === arbre.treeId);
    if (a) a.root_person_id = r.root_person_id;
    toast(personId ? 'Personne racine définie' : 'Personne racine retirée');
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Erreur', true);
  }
}

/* ---------- Unions ---------- */
export const modifierUnion = async (id: string, data: { union_type?: TypeUnion; end_type?: FinUnion; hidden?: boolean; notes?: string }) =>
  !!(await envoyer('PUT', `/families/${id}`, data, 'Union enregistrée'));
/** Changer les parents d'un enfant : vers une union existante, ou vers le couple « parent + autre parent (ou personne) ». */
export const changerParents = async (familyId: string, childId: string, vers: { family_id: string } | { parent_id: string; other_id: string | null }) =>
  !!(await envoyer('PUT', `/families/${familyId}/children/${childId}/move`, vers, 'Parents modifiés'));
export const supprimerUnion = async (id: string) => !!(await envoyer('DELETE', `/families/${id}`, undefined, 'Union supprimée'));
export const changerLienEnfant = async (familyId: string, childId: string, relation: LienEnfant) =>
  !!(await envoyer('PUT', `/families/${familyId}/children/${childId}`, { relation }));
export const retirerEnfant = async (familyId: string, childId: string) =>
  !!(await envoyer('DELETE', `/families/${familyId}/children/${childId}`, undefined, 'Lien retiré'));

/* ---------- Événements ---------- */
export type EvenementSaisi = { type: TypeEvenement; date_qual: Qualif; date_text: string; place: string; description: string };
export const creerEvenement = async (cible: { person_id?: string; family_id?: string }, data: EvenementSaisi) =>
  !!(await envoyer('POST', '/events', { ...cible, ...data }, 'Événement ajouté'));
export const modifierEvenement = async (id: string, data: EvenementSaisi) => !!(await envoyer('PUT', `/events/${id}`, data, 'Événement enregistré'));
export const supprimerEvenement = async (id: string) => !!(await envoyer('DELETE', `/events/${id}`, undefined, 'Événement supprimé'));

/* ---------- Analyses : Sosa et alertes (recalculées seulement quand l'arbre change) ---------- */
let analyseCache: { version: number; treeId: string | null; racine: string | null; sosa: Map<string, number[]>; alertes: Map<string, Alerte[]> } | null = null;
export function analyse() {
  const version = arbre.version;
  const racine = app.arbres.find((a) => a.id === arbre.treeId)?.root_person_id ?? null;
  if (!analyseCache || analyseCache.version !== version || analyseCache.racine !== racine || analyseCache.treeId !== arbre.treeId) {
    analyseCache = { version, treeId: arbre.treeId, racine, sosa: calculerSosa(D, racine), alertes: toutesAlertes(D) };
  }
  return analyseCache;
}

/* ---------- Sources et citations ---------- */
export type SourceSaisie = Omit<Source, 'id'>;
export async function creerSource(data: SourceSaisie) {
  const r = await envoyer<Paquet>('POST', '/sources', data);
  return r?.sources?.[0]?.id;
}
export const modifierSource = async (id: string, data: Partial<SourceSaisie>) => !!(await envoyer('PUT', `/sources/${id}`, data, 'Source enregistrée'));
export const supprimerSource = async (id: string) => !!(await envoyer('DELETE', `/sources/${id}`, undefined, 'Source supprimée'));
export const citer = async (sourceId: string, cible: Cible, detail: string) =>
  !!(await envoyer('POST', '/citations', { source_id: sourceId, ...cible, detail }, 'Source citée'));
export const modifierCitation = async (id: string, detail: string) => !!(await envoyer('PUT', `/citations/${id}`, { detail }));
export const supprimerCitation = async (id: string) => !!(await envoyer('DELETE', `/citations/${id}`, undefined, 'Citation retirée'));

/* ---------- Photos et documents ---------- */
/** Adresse d'un fichier (ou de sa miniature), servie par le serveur après contrôle d'accès. */
export const urlFichier = (mediaId: string, quoi: 'file' | 'thumb' = 'file') => `/api/trees/${arbre.treeId}/media/${mediaId}/${quoi}`;

/**
 * Envoie un fichier préparé (voir images.ts), avec suivi de la progression (0 à 1).
 * XMLHttpRequest plutôt que fetch : lui seul donne l'avancement de l'envoi.
 */
export function envoyerFichier(f: FichierPret, cible: Cible, progression: (p: number) => void): Promise<string> {
  return new Promise((ok, echec) => {
    const form = new FormData();
    form.set('file', f.fichier, f.nom);
    if (f.miniature) form.set('thumb', f.miniature, 'miniature');
    form.set('title', f.titre);
    form.set('links', JSON.stringify([cible]));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/trees/${arbre.treeId}/media`);
    xhr.upload.onprogress = (e) => e.lengthComputable && progression(e.loaded / e.total);
    xhr.onload = () => {
      let data: (Paquet & { error?: string }) | null = null;
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data) {
        appliquer(data);
        ok(data.media?.[0]?.id ?? '');
      } else echec(new Error(data?.error ?? `Erreur ${xhr.status}`));
    };
    xhr.onerror = () => echec(new Error('Pas de connexion internet'));
    xhr.send(form);
  });
}
export const modifierMedia = async (id: string, data: { title?: string; date_text?: string; description?: string }) =>
  !!(await envoyer('PUT', `/media/${id}`, data, 'Document enregistré'));
export const supprimerMedia = async (id: string) => !!(await envoyer('DELETE', `/media/${id}`, undefined, 'Document supprimé'));
export const lierMedia = async (id: string, cible: Cible) => !!(await envoyer('POST', `/media/${id}/links`, cible, 'Document rattaché'));
export const delierMedia = async (id: string, cible: Cible) => !!(await envoyer('DELETE', `/media/${id}/links`, cible, 'Document détaché'));
export const definirPhoto = async (personId: string, mediaId: string | null) =>
  !!(await envoyer('PUT', `/persons/${personId}`, { photo_media_id: mediaId }, mediaId ? 'Photo principale définie' : 'Photo principale retirée'));

/* ---------- Carte : position d'un lieu ---------- */
export const positionLieu = async (id: string, pos: { latitude: number; longitude: number } | null, reset = false) =>
  !!(await envoyer('PUT', `/places/${id}`, { latitude: pos?.latitude ?? null, longitude: pos?.longitude ?? null, reset }));

/* ---------- « À chercher » ---------- */
export const ajouterATrouver = async (personId: string, text: string) => !!(await envoyer('POST', '/todos', { person_id: personId, text }));
export const basculerATrouver = (t: ATrouver) => envoyer('PUT', `/todos/${t.id}`, { done: !t.done });
export const supprimerATrouver = (id: string) => envoyer('DELETE', `/todos/${id}`);
