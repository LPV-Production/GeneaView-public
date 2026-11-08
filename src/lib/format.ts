// Petits outils d'affichage (dates, pluriels).

/** « 1 personne », « 2 personnes », « aucune personne ». */
export function pluriel(n: number, mot: string, motPluriel = mot + 's', zero = 'aucune ' + mot) {
  if (n === 0) return zero;
  return `${n.toLocaleString('fr-FR')} ${n > 1 ? motPluriel : mot}`;
}

/** Date de la base (UTC, « AAAA-MM-JJ HH:MM:SS ») → « il y a 2 jours », « aujourd’hui »… */
export function depuis(dateSql: string, maintenant = new Date()) {
  const d = new Date(dateSql.replace(' ', 'T') + 'Z');
  const jours = Math.floor((maintenant.getTime() - d.getTime()) / 86_400_000);
  if (Number.isNaN(jours)) return '';
  if (jours <= 0) return 'aujourd’hui';
  if (jours === 1) return 'hier';
  if (jours < 7) return `il y a ${jours} jours`;
  if (jours < 30) return `il y a ${Math.floor(jours / 7)} semaine${jours >= 14 ? 's' : ''}`;
  if (jours < 365) return `il y a ${Math.floor(jours / 30)} mois`;
  const ans = Math.floor(jours / 365);
  return `il y a ${ans} an${ans > 1 ? 's' : ''}`;
}

export const ROLES: Record<string, string> = { owner: 'Propriétaire', editor: 'Éditeur', viewer: 'Lecteur' };
