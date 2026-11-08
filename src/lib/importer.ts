// Envoi au serveur des données lues dans un fichier GEDCOM, par lots et dans le bon ordre
// (un événement a besoin que sa personne et son lieu existent déjà, etc.).
import type { LignesImport } from './gedcom';

export const ORDRE_IMPORT = ['places', 'sources', 'persons', 'families', 'children', 'events', 'citations'] as const;
const LOT = 400; // sous la limite du serveur (500)

export type EnvoiLot = (table: (typeof ORDRE_IMPORT)[number], rows: unknown[]) => Promise<{ inserted: number; refused: number }>;

/** Envoie tout ; `progression` reçoit (lignes envoyées, total). Renvoie le nombre de lignes refusées. */
export async function envoyerImport(L: LignesImport, envoyer: EnvoiLot, progression: (fait: number, total: number) => void = () => {}) {
  const total = ORDRE_IMPORT.reduce((s, t) => s + L[t].length, 0);
  let fait = 0;
  let refusees = 0;
  progression(0, total);
  for (const table of ORDRE_IMPORT) {
    const lignes = L[table];
    for (let i = 0; i < lignes.length; i += LOT) {
      const r = await envoyer(table, lignes.slice(i, i + LOT));
      refusees += r.refused;
      fait += Math.min(LOT, lignes.length - i);
      progression(fait, total);
    }
  }
  return { total, refusees };
}
