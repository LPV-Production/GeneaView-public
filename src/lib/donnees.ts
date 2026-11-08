// ============================================================
// Modèle des données d'un arbre (sans rien d'affichage) : types, fusion des
// paquets envoyés par le serveur et index pour retrouver vite la famille.
// Fichier TypeScript ordinaire : il peut être testé automatiquement.
// ============================================================
import type { Qualif } from '../../commun/dates';
import type { FinUnion, LienEnfant, Sexe, TypeEvenement, TypeUnion } from '../../commun/libelles';

export type Personne = {
  id: string; given_names: string; surname: string; married_name: string; nickname: string;
  sex: Sexe; living: number; photo_media_id: string | null; occupations: string; notes: string;
  created_at: string; updated_at: string;
  /** 1 = personne vivante masquée (vue d'un lecteur) */
  masked?: number;
};
export type Union = {
  id: string; partner1_id: string | null; partner2_id: string | null; union_type: TypeUnion; notes: string;
  /** Comment l'union a pris fin ('' : en cours, ou par le décès d'un conjoint) */
  end_type?: FinUnion;
  /** 1 = cachée aux lecteurs */
  hidden?: number;
};
export type LienUnionEnfant = { family_id: string; child_id: string; relation: LienEnfant; sort_order: number };
export type Evenement = {
  id: string; person_id: string | null; family_id: string | null; type: TypeEvenement;
  date_text: string; date_qual: Qualif; date_sort: number | null; date_sort_end: number | null;
  place_id: string | null; description: string;
};
export type Lieu = { id: string; name: string; city: string; department: string; country: string; latitude: number | null; longitude: number | null; geocoded_at?: string | null };
export type ATrouver = { id: string; person_id: string; text: string; done: number; created_at: string };

export type TypeSource = 'civil' | 'parish' | 'census' | 'website' | 'book' | 'testimony' | 'other';
export type Fiabilite = 'proof' | 'clue' | 'hypothesis';
export type Source = { id: string; title: string; type: TypeSource; url: string; reference: string; reliability: Fiabilite; notes: string };
/** Cible d'une citation ou d'un document : une personne, une union OU un événement. */
export type Cible = { person_id?: string | null; family_id?: string | null; event_id?: string | null };
export type Citation = { id: string; source_id: string; person_id: string | null; family_id: string | null; event_id: string | null; detail: string; created_at: string };
export type Media = { id: string; mime: string; size: number; title: string; date_text: string; description: string; has_thumb: number; created_at: string };
export type MediaLien = { media_id: string; person_id: string | null; family_id: string | null; event_id: string | null };

/** Clé d'index d'une cible : « p:<id> », « f:<id> » ou « e:<id> ». */
export const cleCible = (c: Cible) => (c.person_id ? `p:${c.person_id}` : c.family_id ? `f:${c.family_id}` : `e:${c.event_id}`);

export type Paquet = {
  persons?: Personne[]; families?: Union[]; children?: LienUnionEnfant[]; events?: Evenement[]; places?: Lieu[]; todos?: ATrouver[];
  sources?: Source[]; citations?: Citation[]; media?: Media[]; media_links?: MediaLien[];
  refreshed?: { persons?: string[]; families?: string[]; media?: string[] };
  deleted?: { persons?: string[]; families?: string[]; events?: string[]; todos?: string[]; sources?: string[]; citations?: string[]; media?: string[] };
};

const ajouter = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const l = m.get(k);
  if (l) l.push(v);
  else m.set(k, [v]);
};

/** Toutes les données d'un arbre + des index pour retrouver vite parents, unions, événements. */
export class DonneesArbre {
  personnes = new Map<string, Personne>();
  unions = new Map<string, Union>();
  liens: LienUnionEnfant[] = [];
  evenements = new Map<string, Evenement>();
  lieux = new Map<string, Lieu>();
  todos = new Map<string, ATrouver>();
  sources = new Map<string, Source>();
  citations = new Map<string, Citation>();
  medias = new Map<string, Media>();
  mediaLiens: MediaLien[] = [];

  // Index recalculés après chaque changement
  unionsConjoint = new Map<string, string[]>(); // personne → unions où elle est conjoint
  unionsEnfant = new Map<string, LienUnionEnfant[]>(); // personne → unions de ses parents
  enfantsUnion = new Map<string, LienUnionEnfant[]>(); // union → enfants
  evPersonne = new Map<string, Evenement[]>();
  evUnion = new Map<string, Evenement[]>();
  todosPersonne = new Map<string, ATrouver[]>();
  usageLieux = new Map<string, number>(); // lieu → nombre d'événements
  citationsCible = new Map<string, Citation[]>(); // « p:<id> » → citations
  citationsSource = new Map<string, Citation[]>(); // source → citations
  mediasCible = new Map<string, Media[]>(); // « p:<id> » → documents
  liensMedia = new Map<string, MediaLien[]>(); // document → rattachements

  constructor(p?: Paquet) {
    if (p) this.fusionner(p);
  }

  private indexer() {
    this.unionsConjoint.clear(); this.unionsEnfant.clear(); this.enfantsUnion.clear();
    this.evPersonne.clear(); this.evUnion.clear(); this.todosPersonne.clear(); this.usageLieux.clear();
    for (const u of this.unions.values()) {
      if (u.partner1_id) ajouter(this.unionsConjoint, u.partner1_id, u.id);
      if (u.partner2_id) ajouter(this.unionsConjoint, u.partner2_id, u.id);
    }
    this.liens.sort((a, b) => a.sort_order - b.sort_order);
    for (const l of this.liens) {
      ajouter(this.unionsEnfant, l.child_id, l);
      ajouter(this.enfantsUnion, l.family_id, l);
    }
    for (const e of this.evenements.values()) {
      if (e.person_id) ajouter(this.evPersonne, e.person_id, e);
      if (e.family_id) ajouter(this.evUnion, e.family_id, e);
      if (e.place_id) this.usageLieux.set(e.place_id, (this.usageLieux.get(e.place_id) ?? 0) + 1);
    }
    for (const t of this.todos.values()) ajouter(this.todosPersonne, t.person_id, t);

    // Citations et rattachements dont la cible a disparu (supprimée par ailleurs) : retirés
    const existe = (c: Cible) => (c.person_id ? this.personnes.has(c.person_id) : c.family_id ? this.unions.has(c.family_id) : !!c.event_id && this.evenements.has(c.event_id));
    this.citationsCible.clear(); this.citationsSource.clear(); this.mediasCible.clear(); this.liensMedia.clear();
    for (const c of [...this.citations.values()]) {
      if (!existe(c) || !this.sources.has(c.source_id)) { this.citations.delete(c.id); continue; }
      ajouter(this.citationsCible, cleCible(c), c);
      ajouter(this.citationsSource, c.source_id, c);
    }
    this.mediaLiens = this.mediaLiens.filter((l) => existe(l) && this.medias.has(l.media_id));
    for (const l of this.mediaLiens) {
      ajouter(this.liensMedia, l.media_id, l);
      ajouter(this.mediasCible, cleCible(l), this.medias.get(l.media_id)!);
    }
  }

  /** Intègre un paquet renvoyé par le serveur (ou le chargement complet). */
  fusionner(p: Paquet) {
    const persRafraichies = new Set(p.refreshed?.persons ?? []);
    const famRafraichies = new Set(p.refreshed?.families ?? []);
    const d = p.deleted ?? {};
    for (const id of d.persons ?? []) { this.personnes.delete(id); persRafraichies.add(id); }
    for (const id of d.families ?? []) { this.unions.delete(id); famRafraichies.add(id); }
    for (const id of d.events ?? []) this.evenements.delete(id);
    for (const id of d.todos ?? []) this.todos.delete(id);
    for (const id of d.sources ?? []) this.sources.delete(id); // ses citations sont retirées à l'indexation
    for (const id of d.citations ?? []) this.citations.delete(id);
    for (const id of d.media ?? []) {
      this.medias.delete(id);
      // Le serveur retire aussi la photo principale qui utilisait ce document
      for (const p of this.personnes.values()) if (p.photo_media_id === id) this.personnes.set(p.id, { ...p, photo_media_id: null });
    }
    const mediaRafraichis = new Set(p.refreshed?.media ?? []);
    this.mediaLiens = this.mediaLiens.filter((l) => !mediaRafraichis.has(l.media_id));
    // Ce qui est « rafraîchi » est remplacé entièrement par la version du serveur
    for (const e of [...this.evenements.values()]) {
      if ((e.person_id && persRafraichies.has(e.person_id)) || (e.family_id && famRafraichies.has(e.family_id))) this.evenements.delete(e.id);
    }
    for (const t of [...this.todos.values()]) if (persRafraichies.has(t.person_id)) this.todos.delete(t.id);
    this.liens = this.liens.filter((l) => !famRafraichies.has(l.family_id) && !(d.persons ?? []).includes(l.child_id));

    for (const x of p.persons ?? []) this.personnes.set(x.id, x);
    for (const x of p.families ?? []) this.unions.set(x.id, x);
    this.liens.push(...(p.children ?? []));
    for (const x of p.events ?? []) this.evenements.set(x.id, x);
    for (const x of p.places ?? []) this.lieux.set(x.id, x);
    for (const x of p.todos ?? []) this.todos.set(x.id, x);
    for (const x of p.sources ?? []) this.sources.set(x.id, x);
    for (const x of p.citations ?? []) this.citations.set(x.id, x);
    for (const x of p.media ?? []) this.medias.set(x.id, x);
    this.mediaLiens.push(...(p.media_links ?? []));
    this.indexer();
  }
}
