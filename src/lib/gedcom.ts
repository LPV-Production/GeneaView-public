// ============================================================
// GEDCOM 5.5.1 — le format d'échange de tous les logiciels de généalogie
// (Geneanet, Heredis, MyHeritage, Ancestry, Gramps…).
//
//  - lireGedcom()    : fichier → données prêtes à importer (+ résumé, avertissements)
//  - ecrireGedcom()  : arbre GeneaView → fichier GEDCOM (sources et notes comprises)
//
// Tout se fait dans le navigateur : le serveur ne reçoit que des lignes
// déjà converties, qu'il revérifie une par une (voir worker/import.ts).
// ============================================================
import { analyserDate, lireDate, type Qualif } from '../../commun/dates';
import type { DonneesArbre, Evenement, Fiabilite, TypeSource } from './donnees';
import { TYPES_UNION, type TypeUnion } from '../../commun/libelles';

// ---------- Décodage du fichier (UTF-8, Windows-1252 ou ANSEL) ----------
// ANSEL : ancien encodage GEDCOM où l'accent PRÉCÈDE la lettre (0xE2 + e = é)
const ANSEL_ACCENTS: Record<number, string> = {
  0xe1: '̀', 0xe2: '́', 0xe3: '̂', 0xe4: '̃', 0xe8: '̈', 0xf0: '̧', 0xea: '̊', 0xe9: '̌',
};
const ANSEL_LETTRES: Record<number, string> = { 0xa5: 'Æ', 0xb5: 'æ', 0xa6: 'Œ', 0xb6: 'œ', 0xa2: 'Ø', 0xb2: 'ø', 0xcf: 'ß' };

function decoderAnsel(b: Uint8Array) {
  let s = '';
  let accent = '';
  for (const o of b) {
    if (ANSEL_ACCENTS[o]) { accent += ANSEL_ACCENTS[o]; continue; }
    const c = o < 0x80 ? String.fromCharCode(o) : (ANSEL_LETTRES[o] ?? '?');
    s += (c + accent).normalize('NFC');
    accent = '';
  }
  return s;
}

export function decoder(b: Uint8Array): { texte: string; encodage: string } {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return { texte: new TextDecoder('utf-8').decode(b.subarray(3)), encodage: 'UTF-8' };
  if (b[0] === 0xff && b[1] === 0xfe) return { texte: new TextDecoder('utf-16le').decode(b.subarray(2)), encodage: 'UTF-16' };
  if (b[0] === 0xfe && b[1] === 0xff) return { texte: new TextDecoder('utf-16be').decode(b.subarray(2)), encodage: 'UTF-16' };
  const entete = new TextDecoder('latin1').decode(b.subarray(0, 2000));
  if (/1 CHAR ANSEL/i.test(entete)) return { texte: decoderAnsel(b), encodage: 'ANSEL' };
  try {
    return { texte: new TextDecoder('utf-8', { fatal: true }).decode(b), encodage: 'UTF-8' };
  } catch {
    return { texte: new TextDecoder('windows-1252').decode(b), encodage: 'Windows-1252' };
  }
}

// ---------- Lecture des lignes « niveau [@ref@] ÉTIQUETTE [valeur] » ----------
export type Noeud = { tag: string; ref?: string; valeur: string; enfants: Noeud[] };

export function lireLignes(texte: string): Noeud[] {
  const racines: Noeud[] = [];
  const pile: Noeud[] = [];
  for (const brute of texte.split(/\r\n|\r|\n/)) {
    const m = brute.match(/^\s*(\d{1,2})\s+(?:(@[^@\s]+@)\s+)?([A-Za-z0-9_]+)(?: (.*))?$/);
    if (!m) continue;
    const niveau = Number(m[1]);
    const tag = m[3].toUpperCase();
    const valeur = m[4] ?? '';
    // CONT = retour à la ligne, CONC = suite de la même ligne
    if ((tag === 'CONT' || tag === 'CONC') && pile[niveau - 1]) {
      pile[niveau - 1].valeur += (tag === 'CONT' ? '\n' : '') + valeur;
      continue;
    }
    const n: Noeud = { tag, ref: m[2], valeur, enfants: [] };
    if (niveau === 0) racines.push(n);
    else if (pile[niveau - 1]) pile[niveau - 1].enfants.push(n);
    else continue; // ligne orpheline : ignorée
    pile[niveau] = n;
    pile.length = niveau + 1;
  }
  return racines;
}

const sous = (n: Noeud, tag: string) => n.enfants.find((e) => e.tag === tag);
const tous = (n: Noeud, tag: string) => n.enfants.filter((e) => e.tag === tag);
const val = (n: Noeud | undefined, tag: string) => (n ? (sous(n, tag)?.valeur ?? '').trim() : '');

// ---------- Dates GEDCOM ↔ dates GeneaView ----------
const MOIS_GED = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** « 12 MAR 1890 » → « 12/03/1890 » ; « MAR 1890 » → « 03/1890 » ; « 1890 » → « 1890 » */
function dateSimpleGed(s: string): string | null {
  const m = s.trim().toUpperCase().match(/^(?:(\d{1,2}) )?(?:([A-Z]{3}) )?(\d{1,4})(?:\/\d{2})?$/);
  if (!m) return null;
  const mois = m[2] ? MOIS_GED.indexOf(m[2]) + 1 : 0;
  if (m[2] && !mois) return null;
  if (m[1] && !mois) return null;
  const j = m[1] ? String(m[1]).padStart(2, '0') : '';
  return [j, mois ? String(mois).padStart(2, '0') : '', m[3]].filter(Boolean).join('/');
}

/** Date GEDCOM → { précision, texte } au format GeneaView, ou le texte brut si elle n'est pas comprise. */
export function dateDepuisGedcom(brut: string): { date_qual: Qualif; date_text: string; comprise: boolean } {
  const s = brut.trim().replace(/\s+/g, ' ');
  if (!s) return { date_qual: 'exact', date_text: '', comprise: true };
  const u = s.toUpperCase().replace(/^@#DGREGORIAN@ /, '');
  let r: RegExpMatchArray | null;
  const essai = (q: Qualif, t: string | null) => (t ? { date_qual: q, date_text: t, comprise: true } : null);
  if ((r = u.match(/^(?:BET|FROM) (.+?) (?:AND|TO) (.+)$/))) {
    const a = dateSimpleGed(r[1]), b = dateSimpleGed(r[2]);
    if (a && b) return { date_qual: 'between', date_text: `${a} et ${b}`, comprise: true };
  } else {
    const x =
      ((r = u.match(/^(?:ABT|CAL|EST|ABOUT|CA\.?|ENV\.?|VERS) (.+)$/)) && essai('about', dateSimpleGed(r[1]))) ||
      ((r = u.match(/^(?:BEF|AVANT) (.+)$/)) && essai('before', dateSimpleGed(r[1]))) ||
      ((r = u.match(/^(?:AFT|APRES|APRÈS) (.+)$/)) && essai('after', dateSimpleGed(r[1]))) ||
      ((r = u.match(/^(?:FROM|TO) (.+)$/)) && essai('exact', dateSimpleGed(r[1]))) ||
      essai('exact', dateSimpleGed(u.replace(/^INT /, '').replace(/ \(.*\)$/, '')));
    if (x) return x;
  }
  // Calendrier républicain, phrase libre… : gardé tel quel, sans tri possible
  // (une phrase libre GEDCOM s'écrit entre parenthèses : on les retire)
  return { date_qual: 'exact', date_text: s.replace(/^\((.*)\)$/, '$1').slice(0, 60), comprise: false };
}

/** Date GeneaView → GEDCOM : « vers 1890 » → « ABT 1890 », « 1864 et 1868 » → « BET 1864 AND 1868 ». */
export function dateVersGedcom(e: { date_text: string; date_qual: string }): string {
  const simple = (t: string) => {
    const d = lireDate(t);
    if (!d) return null;
    return [d.d || '', d.m ? MOIS_GED[d.m - 1] : '', d.y].filter(Boolean).join(' ');
  };
  if (!e.date_text) return '';
  if (e.date_qual === 'between') {
    const [a, b] = e.date_text.split(/\s+et\s+/i).map(simple);
    return a && b ? `BET ${a} AND ${b}` : `(${e.date_text})`;
  }
  const s = simple(e.date_text);
  // Date d'un autre calendrier (« @#DFRENCH R@ … ») : déjà au format GEDCOM, réécrite telle quelle
  if (!s) return e.date_text.startsWith('@#') ? e.date_text : `(${e.date_text})`;
  return ({ about: 'ABT ', before: 'BEF ', after: 'AFT ' }[e.date_qual] ?? '') + s;
}

// ---------- Lecture d'un fichier GEDCOM ----------
type TypeEv = Evenement['type'];
export type LignesImport = {
  places: { id: string; name: string; city: string; department: string; country: string; latitude: number | null; longitude: number | null }[];
  sources: { id: string; title: string; type: TypeSource; url: string; reference: string; reliability: Fiabilite; notes: string }[];
  persons: { id: string; given_names: string; surname: string; married_name: string; nickname: string; sex: 'M' | 'F' | 'U'; living: number; occupations: string; notes: string }[];
  families: { id: string; partner1_id: string | null; partner2_id: string | null; union_type: TypeUnion; end_type?: 'divorce' | 'separation' | ''; notes: string }[];
  children: { family_id: string; child_id: string; relation: 'biological' | 'adopted' | 'unknown'; sort_order: number }[];
  events: { id: string; person_id: string | null; family_id: string | null; type: TypeEv; date_text: string; date_qual: Qualif; place_id: string | null; description: string }[];
  citations: { id: string; source_id: string; person_id: string | null; family_id: string | null; event_id: string | null; detail: string }[];
};
export type ResultatImport = {
  lignes: LignesImport;
  nomArbre: string;
  premiereRef: string | null; // première personne du fichier (souvent la personne racine)
  encodage: string;
  logiciel: string;
  vivantes: number;
  avertissements: string[];
};

const EV_PERSONNE: Record<string, TypeEv> = {
  BIRT: 'birth', CHR: 'baptism', BAPM: 'baptism', DEAT: 'death', BURI: 'burial', CREM: 'burial',
  RESI: 'residence', OCCU: 'occupation', CENS: 'census', _MILT: 'military', _MIL: 'military', MILI: 'military', _MILI: 'military', EVEN: 'other',
};
const EV_UNION: Record<string, TypeEv> = { MARR: 'marriage', DIV: 'divorce', RESI: 'residence', EVEN: 'other', ENGA: 'other', MARB: 'other', MARC: 'other' };
const LIBELLES_AUTRES: Record<string, string> = { ENGA: 'Fiançailles', MARB: 'Publication des bans', MARC: 'Contrat de mariage' };
const TYPES_SOURCE: TypeSource[] = ['civil', 'parish', 'census', 'website', 'book', 'testimony', 'other'];

const coord = (s: string) => {
  const m = s.trim().match(/^([NSEW])?\s*(-?\d+(?:[.,]\d+)?)$/i);
  if (!m) return null;
  const v = Number(m[2].replace(',', '.'));
  return /[SW]/i.test(m[1] ?? '') ? -v : v;
};

export function lireGedcom(octets: Uint8Array, maintenant = new Date().getFullYear()): ResultatImport {
  const { texte, encodage } = decoder(octets);
  const racines = lireLignes(texte);
  const avert = new Map<string, number>();
  const noter = (msg: string) => avert.set(msg, (avert.get(msg) ?? 0) + 1);
  const L: LignesImport = { places: [], sources: [], persons: [], families: [], children: [], events: [], citations: [] };
  const uuid = () => crypto.randomUUID();

  const tete = racines.find((r) => r.tag === 'HEAD');
  if (!tete) throw new Error('Ce fichier ne ressemble pas à un GEDCOM (en-tête « HEAD » absent)');
  const logiciel = val(sous(tete, 'SOUR'), 'NAME') || sous(tete, 'SOUR')?.valeur || 'inconnu';

  // Notes partagées « 0 @N1@ NOTE … »
  const notesPartagees = new Map(racines.filter((r) => r.tag === 'NOTE' && r.ref).map((r) => [r.ref!, r.valeur]));
  const texteNotes = (n: Noeud) =>
    tous(n, 'NOTE').map((x) => (x.valeur.startsWith('@') ? (notesPartagees.get(x.valeur.trim()) ?? '') : x.valeur)).filter(Boolean).join('\n\n').trim();

  // Lieux (dédoublonnés sans tenir compte des majuscules)
  const lieux = new Map<string, string>();
  const lieu = (plac: Noeud | undefined) => {
    const nom = (plac?.valeur ?? '').trim().replace(/\s*,\s*/g, ', ').replace(/(, )+$/, '').replace(/^(, )+/, '').slice(0, 200);
    if (!nom) return null;
    const cle = nom.toLowerCase();
    let id = lieux.get(cle);
    if (!id) {
      id = uuid();
      lieux.set(cle, id);
      const parts = nom.split(', ');
      const carte = plac && sous(plac, 'MAP');
      L.places.push({
        id, name: nom, city: parts[0] ?? '', department: parts[1] ?? '', country: parts.length > 2 ? parts[parts.length - 1] : '',
        latitude: carte ? coord(val(carte, 'LATI')) : null, longitude: carte ? coord(val(carte, 'LONG')) : null,
      });
    }
    return id;
  };

  // Sources « 0 @S1@ SOUR »
  const sources = new Map<string, string>();
  const qualite = new Map<string, number>(); // meilleure fiabilité (QUAY) rencontrée pour chaque source
  for (const s of racines.filter((r) => r.tag === 'SOUR' && r.ref)) {
    const id = uuid();
    sources.set(s.ref!, id);
    const type = val(s, '_TYPE');
    const notes = [val(s, 'AUTH') && `Auteur : ${val(s, 'AUTH')}`, val(s, 'PUBL') && `Publication : ${val(s, 'PUBL')}`, texteNotes(s), val(s, 'TEXT')]
      .filter(Boolean).join('\n').slice(0, 10000);
    L.sources.push({
      id, title: (val(s, 'TITL') || val(s, 'ABBR') || 'Source sans titre').slice(0, 200),
      type: TYPES_SOURCE.includes(type as TypeSource) ? (type as TypeSource) : 'other',
      url: /^https?:\/\//i.test(val(s, '_URL') || val(s, 'WWW')) ? (val(s, '_URL') || val(s, 'WWW')).slice(0, 1000) : '',
      reference: (val(sous(s, 'REPO') ?? s, 'CALN') || val(s, 'REFN')).slice(0, 200),
      reliability: 'clue', notes,
    });
  }
  /** Citations « SOUR @S1@ / PAGE / QUAY » (ou source écrite en ligne) sous un élément. */
  const citer = (n: Noeud, cible: { person_id?: string; family_id?: string; event_id?: string }) => {
    for (const c of tous(n, 'SOUR')) {
      let sid = sources.get(c.valeur.trim());
      if (!sid) {
        if (!c.valeur.trim() || c.valeur.startsWith('@')) { if (c.valeur.startsWith('@')) noter('Citation vers une source absente du fichier (ignorée)'); continue; }
        sid = uuid(); // source écrite directement dans la citation
        L.sources.push({ id: sid, title: c.valeur.trim().slice(0, 200), type: 'other', url: '', reference: '', reliability: 'clue', notes: val(c, 'TEXT') });
      }
      const q = Number(val(c, 'QUAY'));
      if (!Number.isNaN(q) && val(c, 'QUAY')) qualite.set(sid, Math.max(qualite.get(sid) ?? -1, q));
      L.citations.push({ id: uuid(), source_id: sid, person_id: cible.person_id ?? null, family_id: cible.family_id ?? null, event_id: cible.event_id ?? null, detail: val(c, 'PAGE').slice(0, 200) });
    }
  };

  const evenement = (n: Noeud, type: TypeEv, cible: { person_id?: string; family_id?: string }, libelle = '') => {
    const d = dateDepuisGedcom(val(n, 'DATE'));
    if (!d.comprise) noter('Dates non comprises, gardées telles quelles (ex. calendrier républicain)');
    const desc = [libelle, val(n, 'TYPE') && type === 'other' ? val(n, 'TYPE') : '', n.valeur && n.valeur !== 'Y' ? n.valeur : '', texteNotes(n), val(n, 'CAUS') && `Cause : ${val(n, 'CAUS')}`]
      .filter(Boolean).join(' — ').slice(0, 2000);
    const id = uuid();
    L.events.push({ id, person_id: cible.person_id ?? null, family_id: cible.family_id ?? null, type, ...d, place_id: lieu(sous(n, 'PLAC')), description: desc });
    citer(n, { event_id: id });
    return { id, d };
  };

  // Individus
  const individus = new Map<string, string>();
  const naissances = new Map<string, number | null>();
  const indis = racines.filter((r) => r.tag === 'INDI' && r.ref);
  for (const i of indis) individus.set(i.ref!, uuid());
  for (const i of indis) {
    const id = individus.get(i.ref!)!;
    const noms = tous(i, 'NAME');
    const principal = noms.find((n) => !/married/i.test(val(n, 'TYPE'))) ?? noms[0];
    const decoupe = (n?: Noeud) => {
      const m = (n?.valeur ?? '').match(/^([^/]*)(?:\/([^/]*)\/)?(.*)$/) ?? [];
      return { prenoms: (val(n, 'GIVN') || `${m[1] ?? ''} ${m[3] ?? ''}`).trim().replace(/\s+/g, ' '), nom: (val(n, 'SURN') || m[2] || '').trim() };
    };
    const { prenoms, nom } = decoupe(principal);
    const marital = noms.find((n) => /married/i.test(val(n, 'TYPE')));
    const sexe = sous(i, 'SEX')?.valeur.trim().toUpperCase();
    const professions: string[] = [];
    let deces = false;
    let anneeNaissance: number | null = null;
    for (const e of i.enfants) {
      const type = EV_PERSONNE[e.tag];
      if (!type) continue;
      if (type === 'occupation' && e.valeur.trim()) professions.push(e.valeur.trim());
      const { d } = evenement(e, type, { person_id: id });
      if (type === 'death' || type === 'burial') deces = true;
      if ((type === 'birth' || (type === 'baptism' && anneeNaissance == null)) && d.date_text) {
        try { anneeNaissance = Math.floor(analyserDate(d.date_qual, d.date_text).date_sort! / 10000); } catch {}
      }
    }
    naissances.set(id, anneeNaissance);
    if (tous(i, 'OBJE').length) noter('Photos et documents des fiches non importés (le GEDCOM ne contient pas les fichiers)');
    // Personne vivante : pas de décès connu et née il y a moins de 100 ans
    const vivante = !deces && anneeNaissance != null && anneeNaissance > maintenant - 100;
    L.persons.push({
      id,
      given_names: prenoms.slice(0, 200), surname: nom.slice(0, 200),
      married_name: marital ? decoupe(marital).nom.slice(0, 200) : '',
      nickname: val(principal ?? i, 'NICK').slice(0, 200),
      sex: sexe === 'M' || sexe === 'F' ? sexe : 'U',
      living: vivante ? 1 : 0,
      occupations: [...new Set(professions)].join(', ').slice(0, 200),
      notes: texteNotes(i).slice(0, 10000),
    });
    citer(i, { person_id: id });
  }

  // Unions
  for (const f of racines.filter((r) => r.tag === 'FAM' && r.ref)) {
    const id = uuid();
    const p1 = individus.get(val(f, 'HUSB')) ?? null;
    const p2 = individus.get(val(f, 'WIFE')) ?? null;
    let type: LignesImport['families'][number]['union_type'] = 'unknown';
    const ust = val(f, '_UNION').toLowerCase() || val(f, '_UST').toLowerCase();
    if (ust in TYPES_UNION) type = ust as typeof type;
    else if (sous(f, 'MARR')) type = 'marriage';
    // Fin de l'union : DIV (divorce, avec ou sans date) ou _SEPR (séparation, extension courante)
    const fin = sous(f, 'DIV') ? 'divorce' : sous(f, '_SEPR') ? 'separation' : '';
    L.families.push({ id, partner1_id: p1, partner2_id: p2, union_type: type, end_type: fin, notes: texteNotes(f).slice(0, 10000) });
    for (const e of f.enfants) {
      const t = EV_UNION[e.tag];
      if (t) evenement(e, t, { family_id: id }, LIBELLES_AUTRES[e.tag] ?? '');
    }
    citer(f, { family_id: id });
    tous(f, 'CHIL').forEach((c, ordre) => {
      const enfant = individus.get(c.valeur.trim());
      if (!enfant) return noter('Enfant introuvable dans le fichier (ignoré)');
      if (L.children.some((x) => x.family_id === id && x.child_id === enfant)) return;
      // Adoption indiquée côté enfant : « 1 FAMC @F1@ / 2 PEDI adopted »
      const indi = indis.find((x) => individus.get(x.ref!) === enfant);
      const famc = indi && tous(indi, 'FAMC').find((x) => x.valeur.trim() === f.ref);
      const pedi = (famc ? val(famc, 'PEDI') : '').toLowerCase();
      L.children.push({ family_id: id, child_id: enfant, relation: pedi === 'adopted' ? 'adopted' : pedi === 'birth' || !pedi ? 'biological' : 'unknown', sort_order: ordre });
    });
  }

  // Fiabilité de chaque source d'après les QUAY de ses citations : 3 = preuve, 2 = indice, 0-1 = hypothèse
  for (const s of L.sources) {
    const q = qualite.get(s.id);
    if (q != null) s.reliability = q >= 3 ? 'proof' : q === 2 ? 'clue' : 'hypothesis';
  }

  const nomFichier = val(tete, 'FILE').replace(/\.ged$/i, '');
  return {
    lignes: L,
    nomArbre: nomFichier || 'Arbre importé',
    premiereRef: indis[0] ? individus.get(indis[0].ref!)! : null,
    encodage, logiciel,
    vivantes: L.persons.filter((p) => p.living).length,
    avertissements: [...avert].map(([m, n]) => (n > 1 ? `${m} : ${n}` : m)),
  };
}

// ---------- Écriture d'un fichier GEDCOM ----------
const QUAY: Record<Fiabilite, number> = { proof: 3, clue: 2, hypothesis: 1 };

export function ecrireGedcom(D: DonneesArbre, opts: { nomArbre: string; auteur: string; aujourdhui?: Date }): string {
  const lignes: string[] = [];
  /** Ajoute une ligne ; les textes longs ou sur plusieurs lignes sont coupés en CONT / CONC. */
  const l = (niveau: number, tag: string, valeur = '', ref = '') => {
    const morceaux = valeur.replace(/\r/g, '').split('\n');
    morceaux.forEach((texte, i) => {
      const t = i === 0 ? tag : 'CONT';
      const n = i === 0 ? niveau : niveau + 1;
      let reste = texte;
      let premiere = true;
      do {
        const part = reste.slice(0, 200);
        reste = reste.slice(200);
        // (pas de trimEnd : un espace en fin de morceau doit être conservé pour la ligne CONC suivante)
        lignes.push([premiere ? n : niveau + 1, premiere && ref ? ref : '', premiere ? t : 'CONC', part].filter((x) => x !== '').join(' '));
        premiere = false;
      } while (reste);
    });
  };
  const d = opts.aujourdhui ?? new Date();
  l(0, 'HEAD');
  l(1, 'SOUR', 'GENEAVIEW'); l(2, 'NAME', 'GeneaView'); l(2, 'VERS', '1.0');
  l(1, 'DATE', `${d.getDate()} ${MOIS_GED[d.getMonth()]} ${d.getFullYear()}`);
  l(1, 'FILE', `${opts.nomArbre}.ged`);
  l(1, 'GEDC'); l(2, 'VERS', '5.5.1'); l(2, 'FORM', 'LINEAGE-LINKED');
  l(1, 'CHAR', 'UTF-8');
  l(1, 'LANG', 'French');
  l(1, 'SUBM', '@U1@');
  l(0, 'SUBM', '', '@U1@'); l(1, 'NAME', opts.auteur || 'GeneaView');

  // Références courtes : @I1@, @F1@, @S1@
  const refI = new Map([...D.personnes.keys()].map((id, i) => [id, `@I${i + 1}@`]));
  const refF = new Map([...D.unions.keys()].map((id, i) => [id, `@F${i + 1}@`]));
  const refS = new Map([...D.sources.keys()].map((id, i) => [id, `@S${i + 1}@`]));
  const citations = (cle: string, niveau: number) => {
    for (const c of D.citationsCible.get(cle) ?? []) {
      const s = D.sources.get(c.source_id);
      if (!s) continue;
      l(niveau, 'SOUR', refS.get(s.id)!);
      if (c.detail) l(niveau + 1, 'PAGE', c.detail);
      l(niveau + 1, 'QUAY', String(QUAY[s.reliability]));
    }
  };
  const TAGS: Record<string, string> = {
    birth: 'BIRT', baptism: 'CHR', death: 'DEAT', burial: 'BURI', residence: 'RESI', occupation: 'OCCU',
    census: 'CENS', military: '_MILT', other: 'EVEN', marriage: 'MARR', divorce: 'DIV',
  };
  const evenement = (e: Evenement) => {
    l(1, TAGS[e.type] ?? 'EVEN', e.type === 'occupation' ? e.description.split(' — ')[0] : '');
    if (e.type === 'other') l(2, 'TYPE', e.description.split(' — ')[0] || 'Événement');
    const date = dateVersGedcom(e);
    if (date) l(2, 'DATE', date);
    const lieu = e.place_id ? D.lieux.get(e.place_id) : undefined;
    if (lieu) {
      l(2, 'PLAC', lieu.name);
      if (lieu.latitude != null && lieu.longitude != null) {
        l(3, 'MAP');
        l(4, 'LATI', `${lieu.latitude < 0 ? 'S' : 'N'}${Math.abs(lieu.latitude)}`);
        l(4, 'LONG', `${lieu.longitude < 0 ? 'W' : 'E'}${Math.abs(lieu.longitude)}`);
      }
    }
    if (e.description && e.type !== 'other' && e.type !== 'occupation') l(2, 'NOTE', e.description);
    citations(`e:${e.id}`, 2);
  };

  for (const p of D.personnes.values()) {
    l(0, 'INDI', '', refI.get(p.id));
    l(1, 'NAME', `${p.given_names} /${p.surname}/`.trim());
    if (p.given_names) l(2, 'GIVN', p.given_names);
    if (p.surname) l(2, 'SURN', p.surname);
    if (p.nickname) l(2, 'NICK', p.nickname);
    if (p.married_name) { l(1, 'NAME', `${p.given_names} /${p.married_name}/`.trim()); l(2, 'TYPE', 'married'); }
    l(1, 'SEX', p.sex);
    const evs = [...(D.evPersonne.get(p.id) ?? [])].sort((a, b) => (a.date_sort ?? Infinity) - (b.date_sort ?? Infinity));
    // Professions saisies sur la fiche sans événement « Profession »
    if (p.occupations && !evs.some((e) => e.type === 'occupation')) for (const o of p.occupations.split(/\s*,\s*/).filter(Boolean)) l(1, 'OCCU', o);
    evs.forEach(evenement);
    for (const lien of D.unionsEnfant.get(p.id) ?? []) {
      l(1, 'FAMC', refF.get(lien.family_id)!);
      if (lien.relation === 'adopted') l(2, 'PEDI', 'adopted');
    }
    for (const u of D.unionsConjoint.get(p.id) ?? []) l(1, 'FAMS', refF.get(u)!);
    if (p.notes) l(1, 'NOTE', p.notes);
    citations(`p:${p.id}`, 1);
  }

  for (const u of D.unions.values()) {
    l(0, 'FAM', '', refF.get(u.id));
    // HUSB / WIFE d'après le sexe ; à défaut, dans l'ordre
    const [a, b] = [u.partner1_id, u.partner2_id].map((x) => (x ? D.personnes.get(x) : undefined));
    const mari = [a, b].find((x) => x?.sex === 'M') ?? (a?.sex !== 'F' ? a : undefined) ?? (b?.sex !== 'F' && b !== undefined ? b : undefined);
    const femme = [a, b].find((x) => x && x !== mari);
    if (mari) l(1, 'HUSB', refI.get(mari.id)!);
    if (femme) l(1, 'WIFE', refI.get(femme.id)!);
    if (u.union_type !== 'marriage') l(1, '_UNION', u.union_type);
    const evs = [...(D.evUnion.get(u.id) ?? [])].sort((x, y) => (x.date_sort ?? Infinity) - (y.date_sort ?? Infinity));
    for (const e of evs) evenement(e);
    // Divorce ou séparation indiqués sans événement daté
    if (u.end_type === 'divorce' && !evs.some((e) => e.type === 'divorce')) l(1, 'DIV', 'Y');
    if (u.end_type === 'separation') l(1, '_SEPR', 'Y');
    for (const c of D.enfantsUnion.get(u.id) ?? []) if (refI.has(c.child_id)) l(1, 'CHIL', refI.get(c.child_id)!);
    if (u.notes) l(1, 'NOTE', u.notes);
    citations(`f:${u.id}`, 1);
  }

  for (const s of D.sources.values()) {
    l(0, 'SOUR', '', refS.get(s.id));
    l(1, 'TITL', s.title);
    l(1, '_TYPE', s.type);
    if (s.reference) { l(1, 'REPO'); l(2, 'CALN', s.reference); }
    if (s.url) l(1, '_URL', s.url);
    if (s.notes) l(1, 'NOTE', s.notes);
  }
  l(0, 'TRLR');
  return lignes.join('\r\n') + '\r\n';
}
