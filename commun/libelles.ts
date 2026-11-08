// Libellés en français et règles simples, partagés par le serveur et l'interface.

export type TypeEvenement =
  | 'birth' | 'baptism' | 'death' | 'burial' | 'marriage' | 'divorce'
  | 'residence' | 'occupation' | 'military' | 'census' | 'other';

export const TYPES_EVENEMENT: Record<TypeEvenement, string> = {
  birth: 'Naissance',
  baptism: 'Baptême',
  death: 'Décès',
  burial: 'Inhumation',
  marriage: 'Mariage',
  divorce: 'Divorce',
  residence: 'Résidence',
  occupation: 'Profession',
  military: 'Service militaire',
  census: 'Recensement',
  other: 'Autre',
};

/** Événements possibles pour une personne, et pour une union. */
export const EVENEMENTS_PERSONNE: TypeEvenement[] = ['birth', 'baptism', 'death', 'burial', 'residence', 'occupation', 'military', 'census', 'other'];
export const EVENEMENTS_UNION: TypeEvenement[] = ['marriage', 'divorce', 'residence', 'other'];

export type TypeUnion = 'marriage' | 'pacs' | 'cohabitation' | 'engagement' | 'liaison' | 'unknown';
export const TYPES_UNION: Record<TypeUnion, string> = {
  marriage: 'Mariage', pacs: 'PACS', cohabitation: 'Vie commune', engagement: 'Fiançailles', liaison: 'Liaison', unknown: 'Union',
};
/** Types rangés dans la colonne « kind » (les autres dans « union_type »). */
export const TYPES_UNION_KIND = ['engagement', 'liaison'] as const;
/**
 * Le type d'union vu par l'appli est rangé dans deux colonnes : « union_type » (mariage, PACS,
 * vie commune, inconnu : liste d'origine, figée dans la base) et « kind » (fiançailles, liaison).
 */
export function colonnesType(type: unknown) {
  const t = typeof type === 'string' && type in TYPES_UNION ? type : 'unknown';
  return (TYPES_UNION_KIND as readonly string[]).includes(t) ? { union_type: 'unknown', kind: t } : { union_type: t, kind: '' };
}

/** Comment une union a pris fin (vide : en cours, ou fin par le décès d'un conjoint = veuvage). */
export type FinUnion = '' | 'divorce' | 'separation' | 'annulment';
export const FINS_UNION: Record<FinUnion, string> = { '': 'En cours', divorce: 'Divorce', separation: 'Séparation', annulment: 'Annulation' };

export type Sexe = 'M' | 'F' | 'U';
export type LienEnfant = 'biological' | 'adopted' | 'unknown';
export const LIENS_ENFANT: Record<LienEnfant, string> = { biological: 'Biologique', adopted: 'Adoptif', unknown: 'Inconnu' };

export type Relation = 'parent' | 'conjoint' | 'enfant';

export const TYPES_SOURCE = {
  civil: 'Acte d’état civil',
  parish: 'Registre paroissial',
  census: 'Recensement',
  website: 'Site web',
  book: 'Livre',
  testimony: 'Témoignage',
  other: 'Autre',
} as const;

/** Fiabilité d'une source : preuve (acte), indice (élément concordant), hypothèse (à confirmer). */
export const FIABILITES = { proof: 'Preuve', clue: 'Indice', hypothesis: 'Hypothèse' } as const;
