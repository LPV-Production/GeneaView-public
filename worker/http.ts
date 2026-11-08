// Petits outils pour répondre aux requêtes et valider ce que l'appli envoie.

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) throw new HttpError(415, 'Format attendu : JSON');
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {}
  throw new HttpError(400, 'Données illisibles');
}

/** Date du jour à l'heure de Paris (AAAA-MM-JJ), quelle que soit l'heure du serveur. */
export function todayParis(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Date et heure actuelles au format de la base (UTC). */
export const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ---------- Validation des champs ----------
// Chaque table déclare ses champs modifiables et leur type : tout le reste est ignoré.
export type FieldType = 'text' | 'longtext' | 'url' | 'bool' | 'int' | readonly string[];

const MAX = { text: 200, longtext: 10000, url: 1000 };

export function clean(body: Record<string, unknown>, schema: Record<string, FieldType>, partial: boolean) {
  const out: Record<string, string | number> = {};
  for (const [key, type] of Object.entries(schema)) {
    if (!(key in body)) {
      if (partial) continue;
      throw new HttpError(400, `Champ manquant : ${key}`);
    }
    const v = body[key];
    if (Array.isArray(type)) {
      if (!type.includes(v as string)) throw new HttpError(400, `Valeur invalide : ${key}`);
      out[key] = v as string;
    } else if (type === 'bool') {
      out[key] = v === true || v === 1 ? 1 : 0;
    } else if (type === 'int') {
      const n = Number(v ?? 0);
      if (!Number.isInteger(n) || n < 0 || n > 1e9) throw new HttpError(400, `Nombre invalide : ${key}`);
      out[key] = n;
    } else {
      const s = String(v ?? '').trim();
      if (s.length > MAX[type as keyof typeof MAX]) throw new HttpError(400, `Texte trop long : ${key}`);
      if (type === 'url' && s && !/^https?:\/\//i.test(s)) throw new HttpError(400, `Lien invalide : ${key}`);
      out[key] = s;
    }
  }
  return out;
}

/** Construit "a = ?, b = ?" et la liste des valeurs pour un UPDATE. */
export function setClause(data: Record<string, string | number | null>) {
  const keys = Object.keys(data);
  return { sql: keys.map((k) => `${k} = ?`).join(', '), values: keys.map((k) => data[k]) };
}
