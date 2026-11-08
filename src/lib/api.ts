// Échanges avec le serveur (/api/...). Le cookie de connexion est envoyé automatiquement.

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
/** Appelé quand la session a expiré : l'appli revient à l'écran de connexion. */
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Pas de connexion internet');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/login') onUnauthorized();
    throw new ApiError(res.status, (data as { error?: string }).error ?? `Erreur ${res.status}`);
  }
  return data as T;
}
