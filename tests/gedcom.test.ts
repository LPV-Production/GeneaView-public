// Tests de l'import et de l'export GEDCOM 5.5.1 (src/lib/gedcom.ts).
import { describe, expect, it } from 'vitest';
import { analyserDate } from '../commun/dates';
import { DonneesArbre, type Paquet } from '../src/lib/donnees';
import { dateDepuisGedcom, dateVersGedcom, decoder, ecrireGedcom, lireGedcom, lireLignes, type LignesImport } from '../src/lib/gedcom';

const enc = (s: string) => new TextEncoder().encode(s);

// Un fichier comme en produisent Geneanet ou Heredis (abrégé)
const EXEMPLE = `0 HEAD
1 SOUR GENEANET
2 NAME Geneanet
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
1 FILE famille_martin.ged
0 @I1@ INDI
1 NAME Louise /Martin/
1 SEX F
1 BIRT
2 DATE 20 OCT 1952
2 PLAC Aurillac, Cantal, Auvergne, France
3 MAP
4 LATI N44.9264
4 LONG E2.4397
1 FAMC @F2@
0 @I2@ INDI
1 NAME Henri /Martin/
2 GIVN Henri Joseph
2 SURN Martin
1 SEX M
1 BIRT
2 DATE 3 JUN 1921
2 PLAC Aurillac, Cantal, Auvergne, France
2 SOUR @S1@
3 PAGE vue 12
3 QUAY 3
1 DEAT
2 DATE ABT 1998
1 OCCU Instituteur
1 FAMS @F2@
1 FAMC @F1@
1 NOTE Henri a enseigné à Aurillac
2 CONT pendant trente ans.
2 CONC  Très aimé de ses élèves.
0 @I3@ INDI
1 NAME Marguerite /Dubois/
1 NAME Marguerite /Martin/
2 TYPE married
1 SEX F
1 BIRT
2 DATE BET 1924 AND 1926
1 DEAT
2 DATE 2011
1 FAMS @F2@
0 @I4@ INDI
1 NAME Joseph /Martin/
1 SEX M
1 BIRT
2 DATE ABT 1890
2 PLAC Saint-Flour, Cantal
1 EVEN
2 TYPE Service militaire
2 DATE FROM 1914 TO 1918
1 _MILT
2 DATE 1916
2 NOTE Blessé à Verdun
1 DEAT
2 DATE @#DFRENCH R@ 12 GERM AN XI
1 OBJE
2 FILE portrait.jpg
1 FAMS @F1@
0 @I5@ INDI
1 NAME Paul /Martin/
1 SEX M
1 BIRT
2 DATE 1956
1 FAMC @F2@
2 PEDI adopted
0 @F1@ FAM
1 HUSB @I4@
1 CHIL @I2@
1 MARR
2 DATE 14 OCT 1919
2 PLAC Aurillac, Cantal, Auvergne, France
0 @F2@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
1 CHIL @I5@
1 MARR
2 DATE BEF 1952
1 SOUR @S1@
2 QUAY 2
0 @S1@ SOUR
1 TITL Registres d'état civil d'Aurillac
1 AUTH Mairie d'Aurillac
1 REPO @R1@
2 CALN 4 E 15/32
0 TRLR
`;

describe('lecture des lignes', () => {
  it('CONT = nouvelle ligne, CONC = suite de la ligne', () => {
    const [n] = lireLignes('0 NOTE Début\n1 CONT deuxième ligne\n1 CONC  et suite');
    expect(n.valeur).toBe('Début\ndeuxième ligne et suite');
  });
  it('ignore les lignes illisibles', () => {
    expect(lireLignes('pas une ligne\n0 HEAD\n  \n1 SOUR X')).toHaveLength(1);
  });
});

describe('encodage', () => {
  it('UTF-8, avec ou sans BOM', () => {
    expect(decoder(enc('0 HEAD é')).texte).toBe('0 HEAD é');
    expect(decoder(new Uint8Array([0xef, 0xbb, 0xbf, ...enc('é')])).texte).toBe('é');
  });
  it('Windows-1252 (fichiers « ANSI »)', () => {
    expect(decoder(new Uint8Array([0x4c, 0xe9, 0x61])).texte).toBe('Léa');
  });
  it('ANSEL : l’accent précède la lettre', () => {
    const b = new Uint8Array([...enc('0 HEAD\n1 CHAR ANSEL\n0 L'), 0xe2, 0x65, 0x61, 0x20, 0x46, 0xe8, 0x65, 0x72, 0x20, 0xf0, 0x63]);
    expect(decoder(b).texte).toContain('Léa Fër ç');
  });
});

describe('dates', () => {
  it.each([
    ['12 MAR 1890', 'exact', '12/03/1890'],
    ['MAR 1890', 'exact', '03/1890'],
    ['1890', 'exact', '1890'],
    ['ABT 1890', 'about', '1890'],
    ['EST 1890', 'about', '1890'],
    ['BEF 3 JUN 1921', 'before', '03/06/1921'],
    ['AFT 1900', 'after', '1900'],
    ['BET 1864 AND 1868', 'between', '1864 et 1868'],
    ['FROM 1914 TO 1918', 'between', '1914 et 1918'],
    ['10 FEB 1700/01', 'exact', '10/02/1700'],
  ])('« %s » → %s %s', (ged, qual, texte) => {
    expect(dateDepuisGedcom(ged)).toEqual({ date_qual: qual, date_text: texte, comprise: true });
    expect(() => analyserDate(qual as never, texte)).not.toThrow();
  });
  it('date non comprise : gardée telle quelle', () => {
    expect(dateDepuisGedcom('@#DFRENCH R@ 12 GERM AN XI')).toMatchObject({ comprise: false, date_text: '@#DFRENCH R@ 12 GERM AN XI' });
  });
  it.each([
    [{ date_text: '12/03/1890', date_qual: 'exact' }, '12 MAR 1890'],
    [{ date_text: '1890', date_qual: 'about' }, 'ABT 1890'],
    [{ date_text: '03/1890', date_qual: 'before' }, 'BEF MAR 1890'],
    [{ date_text: '1864 et 1868', date_qual: 'between' }, 'BET 1864 AND 1868'],
    [{ date_text: 'texte libre', date_qual: 'exact' }, '(texte libre)'],
  ])('export %o → « %s »', (e, ged) => expect(dateVersGedcom(e)).toBe(ged));
});

describe('import d’un fichier', () => {
  const r = lireGedcom(enc(EXEMPLE), 2026);
  const L = r.lignes;
  const personne = (prenom: string) => L.persons.find((p) => p.given_names.startsWith(prenom))!;

  it('résumé', () => {
    expect([L.persons.length, L.families.length, L.sources.length]).toEqual([5, 2, 1]);
    expect(r.nomArbre).toBe('famille_martin');
    expect(r.logiciel).toBe('Geneanet');
    expect(r.encodage).toBe('UTF-8');
    expect(r.premiereRef).toBe(personne('Louise').id);
  });

  it('noms, nom d’usage, sexe, professions, notes', () => {
    expect(personne('Henri')).toMatchObject({ given_names: 'Henri Joseph', surname: 'Martin', sex: 'M', occupations: 'Instituteur', notes: 'Henri a enseigné à Aurillac\npendant trente ans. Très aimé de ses élèves.' });
    expect(personne('Marguerite')).toMatchObject({ surname: 'Dubois', married_name: 'Martin', sex: 'F' });
  });

  it('personnes vivantes : sans décès et nées il y a moins de 100 ans', () => {
    expect(personne('Louise').living).toBe(1);
    expect(personne('Paul').living).toBe(1);
    expect(personne('Henri').living).toBe(0);
    expect(r.vivantes).toBe(2);
  });

  it('événements, dates, lieux dédoublonnés avec coordonnées', () => {
    const jo = personne('Joseph');
    const evs = L.events.filter((e) => e.person_id === jo.id);
    expect(evs.map((e) => [e.type, e.date_qual, e.date_text])).toEqual([
      ['birth', 'about', '1890'],
      ['other', 'between', '1914 et 1918'],
      ['military', 'exact', '1916'],
      ['death', 'exact', '@#DFRENCH R@ 12 GERM AN XI'],
    ]);
    expect(evs[1].description).toBe('Service militaire');
    expect(evs[2].description).toBe('Blessé à Verdun');
    expect(L.places.map((p) => p.name).sort()).toEqual(['Aurillac, Cantal, Auvergne, France', 'Saint-Flour, Cantal']);
    expect(L.places.find((p) => p.name.startsWith('Aurillac'))).toMatchObject({ city: 'Aurillac', department: 'Cantal', country: 'France', latitude: 44.9264, longitude: 2.4397 });
  });

  it('unions, enfants, adoption, mariage', () => {
    const f2 = L.families.find((f) => f.partner2_id === personne('Marguerite').id)!;
    expect(f2).toMatchObject({ partner1_id: personne('Henri').id, union_type: 'marriage' });
    expect(L.children.filter((c) => c.family_id === f2.id).map((c) => [c.child_id, c.relation])).toEqual([[personne('Louise').id, 'biological'], [personne('Paul').id, 'adopted']]);
    expect(L.events.find((e) => e.family_id === f2.id)).toMatchObject({ type: 'marriage', date_qual: 'before', date_text: '1952' });
  });

  it('sources, citations avec page, fiabilité d’après QUAY', () => {
    expect(L.sources[0]).toMatchObject({ title: "Registres d'état civil d'Aurillac", reference: '4 E 15/32', reliability: 'proof', notes: "Auteur : Mairie d'Aurillac" });
    expect(L.citations).toHaveLength(2);
    expect(L.citations.find((c) => c.event_id)).toMatchObject({ detail: 'vue 12', source_id: L.sources[0].id });
    expect(L.citations.find((c) => c.family_id)).toBeTruthy();
  });

  it('avertissements utiles', () => {
    expect(r.avertissements).toEqual(expect.arrayContaining([expect.stringMatching(/Dates non comprises/), expect.stringMatching(/Photos et documents/)]));
  });

  it('refuse un fichier qui n’est pas un GEDCOM', () => {
    expect(() => lireGedcom(enc('Bonjour, ceci est une lettre.'))).toThrow(/GEDCOM/);
  });
});

/** Données importées → arbre en mémoire, comme après l'import sur le serveur. */
function enArbre(L: LignesImport) {
  const p: Paquet = {
    persons: L.persons.map((x) => ({ ...x, photo_media_id: null, created_at: '', updated_at: '' })),
    families: L.families, children: L.children,
    events: L.events.map((e) => {
      let tri: number | null = null, fin: number | null = null;
      try { const d = analyserDate(e.date_qual, e.date_text); tri = d.date_sort; fin = d.date_sort_end; } catch {}
      return { ...e, date_sort: tri, date_sort_end: fin };
    }),
    places: L.places, todos: [], sources: L.sources,
    citations: L.citations.map((c) => ({ ...c, created_at: '' })),
  };
  return new DonneesArbre(p);
}

describe('export puis réimport (aller-retour)', () => {
  const D = enArbre(lireGedcom(enc(EXEMPLE), 2026).lignes);
  const texte = ecrireGedcom(D, { nomArbre: 'Famille Martin', auteur: 'Camille', aujourdhui: new Date(2026, 9, 20) });
  const R = lireGedcom(enc(texte), 2026);

  it('fichier GEDCOM 5.5.1 valide en UTF-8', () => {
    expect(texte.startsWith('0 HEAD\r\n1 SOUR GENEAVIEW')).toBe(true);
    expect(texte).toContain('2 VERS 5.5.1');
    expect(texte).toContain('1 CHAR UTF-8');
    expect(texte).toContain('1 DATE 20 OCT 2026');
    expect(texte.trimEnd().endsWith('0 TRLR')).toBe(true);
    expect(texte.split('\r\n').every((ligne) => ligne === '' || /^\d+ /.test(ligne))).toBe(true);
  });

  it('rien ne se perd : personnes, unions, événements, lieux, sources, citations, notes', () => {
    const [a, b] = [D, enArbre(R.lignes)];
    expect(b.personnes.size).toBe(a.personnes.size);
    expect(b.unions.size).toBe(a.unions.size);
    expect(b.evenements.size).toBe(a.evenements.size);
    expect(b.lieux.size).toBe(a.lieux.size);
    expect(b.sources.size).toBe(a.sources.size);
    expect(b.citations.size).toBe(a.citations.size);
    const resume = (X: DonneesArbre) =>
      [...X.personnes.values()].map((p) => [p.given_names, p.surname, p.married_name, p.sex, p.notes, p.occupations].join('|')).sort();
    expect(resume(b)).toEqual(resume(a));
    const dates = (X: DonneesArbre) => [...X.evenements.values()].map((e) => `${e.type} ${e.date_qual} ${e.date_text}`).sort();
    expect(dates(b)).toEqual(dates(a));
    expect([...b.liens].map((l) => l.relation).sort()).toEqual([...a.liens].map((l) => l.relation).sort());
    expect([...b.sources.values()][0]).toMatchObject({ reference: '4 E 15/32', reliability: 'proof' });
  });

  it('textes longs coupés en CONC sans perdre d’espaces', () => {
    const long = 'Une note très longue. '.repeat(30).trim();
    const D2 = enArbre({ ...lireGedcom(enc(EXEMPLE), 2026).lignes });
    const p = [...D2.personnes.values()][0];
    D2.personnes.set(p.id, { ...p, notes: `${long}\nDeuxième paragraphe.` });
    const t = ecrireGedcom(D2, { nomArbre: 'x', auteur: 'y' });
    expect(t).toContain('CONC');
    expect(t.split('\r\n').every((ligne) => ligne.length <= 255)).toBe(true);
    const relu = lireGedcom(enc(t), 2026).lignes.persons.find((x) => x.given_names === p.given_names)!;
    expect(relu.notes).toBe(`${long}\nDeuxième paragraphe.`);
  });
});

describe('phrases de date libres', () => {
  it('« (texte) » perd ses parenthèses à l’import, et les retrouve à l’export', () => {
    expect(dateDepuisGedcom('(peu après la guerre)')).toMatchObject({ date_text: 'peu après la guerre', comprise: false });
    expect(dateVersGedcom({ date_text: 'peu après la guerre', date_qual: 'exact' })).toBe('(peu après la guerre)');
    expect(dateVersGedcom({ date_text: '@#DFRENCH R@ 12 GERM AN XI', date_qual: 'exact' })).toBe('@#DFRENCH R@ 12 GERM AN XI');
  });
});
