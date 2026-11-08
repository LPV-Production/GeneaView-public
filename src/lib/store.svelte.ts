// ============================================================
// État de l'appli (ce qui est affiché) + actions.
// Chaque action envoie la demande au serveur, puis met l'écran à jour
// avec la réponse : ce qui est affiché = ce qui est réellement enregistré.
// La « page » affichée est dans l'adresse (#/arbre/…) : le bouton
// Retour du téléphone fonctionne et on peut garder un favori.
// ============================================================
import { api, ApiError, setUnauthorizedHandler } from './api';
import { oublierArbre } from './arbre.svelte';
import { disablePush } from './push';

export type User = { id: string; label: string };
export type Role = 'owner' | 'editor' | 'viewer';
export type Arbre = {
  id: string;
  name: string;
  description: string;
  root_person_id: string | null;
  created_at: string;
  updated_at: string;
  role: Role;
  owner_label: string;
  person_count: number;
};
export type Route =
  | { ecran: 'accueil' }
  | { ecran: 'arbre'; treeId: string; personId?: string; unionId?: string; centreId?: string; liste?: boolean; carte?: boolean; cartePersonne?: string; impression?: { type: 'fiche' | 'ascendance' | 'descendance'; personId: string } }
  | { ecran: 'reglages' }
  | { ecran: 'invitation'; code: string };
export type Theme = 'auto' | 'light' | 'dark';

const memo = {
  lire: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  ecrire: (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

export const app = $state({
  phase: 'loading' as 'loading' | 'login' | 'ready' | 'error',
  loadError: '',
  user: null as User | null,
  route: { ecran: 'accueil' } as Route,
  arbres: [] as Arbre[],
  /** Dernier arbre ouvert : le menu « Arbre » y ramène */
  arbreOuvert: memo.lire('gv_arbre') as string | null,
  theme: (memo.lire('gv_theme') as Theme | null) ?? 'auto',
  modal: null as { kind: 'arbre'; id?: string } | null,
  busy: false,
  toast: null as { msg: string; error?: boolean } | null,
});

/* ---------- Messages ---------- */
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, error = false) {
  app.toast = { msg, error };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (app.toast = null), error ? 5000 : 3200);
}

/** Exécute une action serveur : bloque les doubles clics et affiche l'erreur s'il y en a une. */
async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
  if (app.busy) return;
  app.busy = true;
  try {
    return await fn();
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) toast(e instanceof Error ? e.message : 'Erreur inattendue', true);
  } finally {
    app.busy = false;
  }
}

/* ---------- Navigation (adresse après le #) ---------- */
function lireRoute(): Route {
  const [page, id, sous, sousId, quoi] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (page === 'arbre' && id) {
    if (sous === 'personne' && sousId) return { ecran: 'arbre', treeId: id, personId: sousId };
    if (sous === 'union' && sousId) return { ecran: 'arbre', treeId: id, unionId: sousId };
    if (sous === 'centre' && sousId) return { ecran: 'arbre', treeId: id, centreId: sousId };
    if (sous === 'personnes') return { ecran: 'arbre', treeId: id, liste: true };
    if (sous === 'imprimer' && sousId && (quoi === 'fiche' || quoi === 'ascendance' || quoi === 'descendance')) {
      return { ecran: 'arbre', treeId: id, impression: { type: quoi, personId: sousId } };
    }
    if (sous === 'carte') return { ecran: 'arbre', treeId: id, carte: true, cartePersonne: sousId || undefined };
    return { ecran: 'arbre', treeId: id };
  }
  if (page === 'reglages') return { ecran: 'reglages' };
  if (page === 'invitation' && id) return { ecran: 'invitation', code: id };
  return { ecran: 'accueil' };
}

function suivreRoute() {
  app.route = lireRoute();
  if (app.route.ecran === 'arbre') {
    app.arbreOuvert = app.route.treeId;
    memo.ecrire('gv_arbre', app.route.treeId);
  }
  window.scrollTo({ top: 0 });
}

export const go = (hash: string) => (location.hash = hash);
export const lienArbre = (id: string) => `#/arbre/${encodeURIComponent(id)}`;
export const lienPersonne = (treeId: string, personId: string) => `${lienArbre(treeId)}/personne/${encodeURIComponent(personId)}`;
export const lienUnion = (treeId: string, unionId: string) => `${lienArbre(treeId)}/union/${encodeURIComponent(unionId)}`;
export const lienCentre = (treeId: string, personId: string) => `${lienArbre(treeId)}/centre/${encodeURIComponent(personId)}`;
export const lienListe = (treeId: string) => `${lienArbre(treeId)}/personnes`;
export const lienImpression = (treeId: string, personId: string, type: 'fiche' | 'ascendance' | 'descendance') => `${lienArbre(treeId)}/imprimer/${encodeURIComponent(personId)}/${type}`;
export const lienCarte = (treeId: string, personId?: string) => `${lienArbre(treeId)}/carte${personId ? `/${encodeURIComponent(personId)}` : ''}`;

/** L'arbre affiché à l'écran (ou le dernier ouvert). */
export function arbreCourant(): Arbre | undefined {
  const id = app.route.ecran === 'arbre' ? app.route.treeId : app.arbreOuvert;
  return app.arbres.find((a) => a.id === id);
}

/* ---------- Thème clair / sombre ---------- */
const mqSombre = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function appliquerTheme() {
  const sombre = app.theme === 'dark' || (app.theme === 'auto' && !!mqSombre?.matches);
  document.documentElement.dataset.theme = sombre ? 'dark' : 'light';
}
export function choisirTheme(t: Theme) {
  app.theme = t;
  memo.ecrire('gv_theme', t === 'auto' ? null : t);
  appliquerTheme();
}

/* ---------- Démarrage, connexion ---------- */
function resetData() {
  app.arbres = [];
  app.modal = null;
  oublierArbre();
}

setUnauthorizedHandler(() => {
  resetData();
  app.user = null;
  app.phase = 'login';
});

export async function loadAll() {
  try {
    const [{ user }, { trees }] = await Promise.all([
      api<{ user: User }>('GET', '/me'),
      api<{ trees: Arbre[] }>('GET', '/trees'),
    ]);
    app.user = user;
    app.arbres = trees;
    // L'arbre mémorisé a pu être supprimé ou ne plus être partagé
    if (app.arbreOuvert && !trees.some((t) => t.id === app.arbreOuvert)) {
      app.arbreOuvert = null;
      memo.ecrire('gv_arbre', null);
    }
    app.phase = 'ready';
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return; // écran de connexion déjà affiché
    app.loadError = e instanceof Error ? e.message : String(e);
    app.phase = 'error';
  }
}

/** Au lancement de l'appli. */
export function demarrer() {
  appliquerTheme();
  mqSombre?.addEventListener('change', appliquerTheme);
  suivreRoute();
  window.addEventListener('hashchange', suivreRoute);
  loadAll();
}

export async function signIn(id: string, password: string): Promise<string | null> {
  try {
    await api('POST', '/login', { id, password });
    app.phase = 'loading';
    await loadAll();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Connexion impossible';
  }
}

export async function signOut() {
  // Cet appareil ne doit plus recevoir les rappels de ce compte, ni garder ses données hors ligne
  await disablePush().catch(() => {});
  navigator.serviceWorker?.controller?.postMessage('oublier-donnees');
  try { await api('POST', '/logout'); } catch {}
  resetData();
  app.user = null;
  go('#/');
  app.phase = 'login';
}

export async function changePassword(current: string, next: string) {
  const ok = await run(() => api('POST', '/password', { current, next }));
  if (ok) toast('Mot de passe modifié. Les autres appareils ont été déconnectés.');
  return !!ok;
}

/* ---------- Arbres ---------- */
export const openTreeForm = (id?: string) => (app.modal = { kind: 'arbre', id });
export const closeModal = () => (app.modal = null);

function putArbre(a: Arbre) {
  const i = app.arbres.findIndex((x) => x.id === a.id);
  if (i >= 0) app.arbres[i] = a;
  else app.arbres = [a, ...app.arbres];
}

export async function saveTree(data: { name: string; description: string }, id?: string) {
  await run(async () => {
    const a = await api<Arbre>(id ? 'PUT' : 'POST', id ? `/trees/${id}` : '/trees', data);
    putArbre(a);
    closeModal();
    toast(id ? 'Arbre modifié' : `Arbre « ${a.name} » créé`);
    if (!id) go(lienArbre(a.id));
  });
}

export async function deleteTree(id: string) {
  const ok = await run(() => api('DELETE', `/trees/${id}`));
  if (!ok) return false;
  app.arbres = app.arbres.filter((a) => a.id !== id);
  oublierArbre();
  if (app.arbreOuvert === id) {
    app.arbreOuvert = null;
    memo.ecrire('gv_arbre', null);
  }
  toast('Arbre supprimé');
  go('#/');
  return true;
}
