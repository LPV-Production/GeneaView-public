// ============================================================
// Notifications côté téléphone : installation du programme d'arrière-plan,
// abonnement / désabonnement, pastille sur l'icône de l'appli.
// ============================================================
import { api } from './api';

export type PushState =
  | 'unsupported' // navigateur trop ancien
  | 'needs-install' // iPhone : il faut d'abord ajouter l'appli à l'écran d'accueil
  | 'denied' // refusé dans les réglages du téléphone
  | 'off'
  | 'on';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Installe le programme d'arrière-plan (au démarrage de l'appli). */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (e) {
    console.warn('Service worker non installé', e);
  }
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function getPushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return (await currentSubscription()) && Notification.permission === 'granted' ? 'on' : 'off';
}

function keyToBytes(b64: string) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** Demande l'autorisation puis abonne cet appareil. Doit être appelé suite à un appui sur un bouton. */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const { key } = await api<{ key: string }>('GET', '/push/key');
  await registerServiceWorker();
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) });
  await api('POST', '/push/subscribe', sub.toJSON());
  return 'on';
}

/** Désabonne cet appareil (aussi appelé à la déconnexion). */
export async function disablePush() {
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  await api('POST', '/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

export async function sendTestPush() {
  const sub = await currentSubscription();
  if (!sub) throw new Error('Cet appareil n’est pas abonné');
  await api('POST', '/push/test', { endpoint: sub.endpoint });
}

