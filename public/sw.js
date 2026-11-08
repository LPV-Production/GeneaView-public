// ============================================================
// Programme d'arrière-plan du téléphone (service worker).
//  - Lecture HORS LIGNE : l'appli et le dernier état de chaque arbre
//    consulté sont gardés sur l'appareil. Sans réseau, on peut encore
//    parcourir l'arbre et les fiches (mais pas modifier).
//  - Notifications : rappels d'anniversaires reçus même appli fermée.
// ============================================================
const VERSION = 'geneaview-v1';
const APPLI = `${VERSION}-appli`;
const DONNEES = `${VERSION}-donnees`;

self.addEventListener('install', (event) => {
  // La page d'accueil (le reste de l'appli est mis en cache au fur et à mesure)
  event.waitUntil(caches.open(APPLI).then((c) => c.addAll(['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => !c.startsWith(VERSION)).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

/** Réseau d'abord ; en cas d'échec (hors ligne), la dernière version gardée. */
async function reseauPuisCache(requete, cache) {
  try {
    const reponse = await fetch(requete);
    if (reponse.ok) (await caches.open(cache)).put(requete, reponse.clone());
    return reponse;
  } catch (e) {
    const garde = await caches.match(requete, { cacheName: cache });
    if (garde) return garde;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cartes, Nominatim… : non gardés

  // Données gardées pour la lecture hors ligne : compte, liste des arbres, contenu d'un arbre, miniatures
  if (url.pathname === '/api/me' || url.pathname === '/api/trees' || /^\/api\/trees\/[^/]+\/(data|media\/[^/]+\/thumb)$/.test(url.pathname)) {
    event.respondWith(reseauPuisCache(req, DONNEES));
    return;
  }
  if (url.pathname.startsWith('/api/')) return; // le reste de l'API : toujours en direct

  // Pages : réseau d'abord (toujours la dernière version), sinon la page gardée
  if (req.mode === 'navigate') {
    event.respondWith(reseauPuisCache(new Request('/'), APPLI));
    return;
  }
  // Fichiers de l'appli (scripts, styles, polices, icônes) : ils changent de nom à chaque version
  if (url.pathname.startsWith('/_astro/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.match(req).then((garde) => garde || reseauPuisCache(req, APPLI)));
  }
});

// À la déconnexion, l'appli demande d'oublier les données gardées
self.addEventListener('message', (event) => {
  if (event.data === 'oublier-donnees') event.waitUntil(caches.delete(DONNEES));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'GeneaView', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag || 'rappels', // une nouvelle notification remplace la précédente
      data: { url: data.url || '/' },
    }).catch(() => {}),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      const f = fenetres.find((w) => new URL(w.url).origin === self.location.origin);
      if (f) return f.focus().then((w) => w.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
