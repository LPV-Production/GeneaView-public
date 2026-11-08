// ============================================================
// Recherche de la position d'un lieu avec Nominatim (OpenStreetMap), gratuit.
// Règles d'usage de Nominatim respectées :
//  - une requête par seconde au maximum (file d'attente ci-dessous) ;
//  - les résultats sont gardés dans la base (table places) : chaque lieu
//    n'est cherché qu'une seule fois, même s'il ne donne rien ;
//  - les requêtes partent du navigateur, qui s'identifie normalement.
// ============================================================
const URL_NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const ATTENTE = 1100; // millisecondes entre deux requêtes

let derniere = 0;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Cherche « Saint-Flour, Cantal, France » ; renvoie la position, ou null si rien n'est trouvé. */
export async function chercherPosition(nom: string): Promise<{ latitude: number; longitude: number } | null> {
  const attendre = derniere + ATTENTE - Date.now();
  if (attendre > 0) await pause(attendre);
  derniere = Date.now();
  const q = new URLSearchParams({ q: nom, format: 'jsonv2', limit: '1', 'accept-language': 'fr' });
  const r = await fetch(`${URL_NOMINATIM}?${q}`, { headers: { accept: 'application/json' } });
  if (r.status === 429) throw new Error('Nominatim demande de ralentir : réessayez dans quelques minutes');
  if (!r.ok) throw new Error(`Nominatim indisponible (${r.status})`);
  const res = (await r.json()) as { lat: string; lon: string }[];
  if (!res.length) return null;
  return { latitude: Number(res[0].lat), longitude: Number(res[0].lon) };
}
