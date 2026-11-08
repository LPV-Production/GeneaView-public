// ============================================================
// Données FICTIVES communes aux 3 maquettes : la famille Martin – Dubois
// sur 5 générations (arrière-grands-parents → petits-enfants).
// Personne racine (Sosa 1) : Louise Martin.
// ============================================================
window.GV = window.GV || {};

GV.personnes = {
  // Génération 3 : arrière-grands-parents de Louise
  antoine:    { prenoms: 'Antoine', nom: 'Martin', sexe: 'H', ans: '1862 – 1931', sosa: 8 },
  marieR:     { prenoms: 'Marie', nom: 'Rouchy', sexe: 'F', ans: '1866 – 1940', sosa: 9 },
  louisL:     { prenoms: 'Louis', nom: 'Lefèvre', sexe: 'H', ans: 'v. 1860 – 1921', sosa: 10 },
  jules:      { prenoms: 'Jules', nom: 'Dubois', sexe: 'H', ans: '1870 – 1939', sosa: 12 },
  anna:       { prenoms: 'Anna', nom: 'Pons', sexe: 'F', ans: 'av. 1875 – ?', sosa: 13 },
  // Génération 2 : grands-parents
  joseph:     { prenoms: 'Joseph Antoine', usuel: 'Joseph', nom: 'Martin', sexe: 'H', ans: 'v. 1890 – 1962', sosa: 4, photo: true, prof: 'Forgeron', lieu: 'Saint-Flour' },
  jeanne:     { prenoms: 'Jeanne', nom: 'Lefèvre', sexe: 'F', ans: '1894 – 1970', sosa: 5, photo: true, prof: 'Couturière', lieu: 'Aurillac' },
  emile:      { prenoms: 'Émile', nom: 'Dubois', sexe: 'H', ans: '1898 – 1944', sosa: 6, prof: 'Cheminot', lieu: 'Clermont-Ferrand' },
  rose:       { prenoms: 'Rose', nom: 'Garnier', sexe: 'F', ans: '1901 – 1985', sosa: 7, photo: true, prof: 'Institutrice', lieu: 'Riom' },
  marie:      { prenoms: 'Marie', nom: 'Martin', sexe: 'F', ans: '1893 – ?', alerte: 'Plus de 110 ans sans date de décès' },
  // Génération 1 : parents
  henri:      { prenoms: 'Henri', nom: 'Martin', sexe: 'H', ans: '1921 – 1998', sosa: 2, photo: true, prof: 'Instituteur', lieu: 'Aurillac' },
  marguerite: { prenoms: 'Marguerite', nom: 'Dubois', sexe: 'F', ans: '1925 – 2011', sosa: 3, photo: true, prof: 'Infirmière', lieu: 'Clermont-Ferrand' },
  // Génération 0 : personne centrale + conjoint
  louise:     { prenoms: 'Louise', nom: 'Martin', sexe: 'F', ans: 'née en 1952', sosa: 1, vivant: true, photo: true, prof: 'Pharmacienne', lieu: 'Aurillac' },
  pierre:     { prenoms: 'Pierre', nom: 'Bernard', sexe: 'H', ans: 'né en 1949', vivant: true, prof: 'Ingénieur', lieu: 'Lyon' },
  // Descendants
  claire:     { prenoms: 'Claire', nom: 'Bernard', sexe: 'F', ans: 'née en 1978', vivant: true, lieu: 'Lyon' },
  thomas:     { prenoms: 'Thomas', nom: 'Bernard', sexe: 'H', ans: 'né en 1981', vivant: true, lieu: 'Grenoble' },
  lea:        { prenoms: 'Léa', nom: 'Morel', sexe: 'F', ans: 'née en 2006', vivant: true },
  hugo:       { prenoms: 'Hugo', nom: 'Bernard', sexe: 'H', ans: 'né en 2010', vivant: true },
};

// Nom affiché : prénom usuel + nom
GV.nom = (id) => { const p = GV.personnes[id]; return `${p.usuel || p.prenoms} ${p.nom}`; };
GV.initiales = (id) => { const p = GV.personnes[id]; return (p.usuel || p.prenoms)[0] + p.nom[0]; };

/** Portrait : fausse photo (silhouette) si la personne en a une, sinon ses initiales. */
GV.portrait = (id, cls = '') => {
  const p = GV.personnes[id];
  if (!p.photo) return `<span class="portrait ${cls}" data-sexe="${p.sexe}" aria-hidden="true">${GV.initiales(id)}</span>`;
  return `<span class="portrait photo ${cls}" data-sexe="${p.sexe}" aria-hidden="true"><svg viewBox="0 0 40 40" preserveAspectRatio="xMidYMid slice"><rect width="40" height="40" fill="var(--photo-bg)"/><circle cx="20" cy="15.5" r="7" fill="var(--photo-fg)"/><path d="M5 41c0-9.5 6.5-15 15-15s15 5.5 15 15z" fill="var(--photo-fg)"/></svg></span>`;
};

// ---------- La fiche détaillée (Joseph Martin, Sosa 4) ----------
GV.fiche = {
  id: 'joseph',
  naissance: { date: 'vers 1890', lieu: 'Saint-Flour, Cantal', incertain: true },
  deces: { date: '12 mars 1962', lieu: 'Aurillac, Cantal' },
  age: 'environ 72 ans',
  surnom: '« Le Grand Jo »',
  evenements: [
    { type: 'Naissance', icone: 'naissance', date: 'vers 1890', lieu: 'Saint-Flour, Cantal', texte: 'Date estimée d’après l’âge déclaré au recensement de 1926.', incertain: true, sources: 1 },
    { type: 'Recensement', icone: 'recensement', date: '1911', lieu: 'Saint-Flour, Cantal', texte: 'Forgeron chez son père, rue de la Coste.', sources: 1 },
    { type: 'Militaire', icone: 'militaire', date: 'entre 1914 et 1918', lieu: 'Verdun, Meuse', texte: 'Mobilisé au 139e régiment d’infanterie, blessé en 1916.', incertain: true, sources: 1 },
    { type: 'Mariage', icone: 'mariage', date: '14 octobre 1919', lieu: 'Aurillac, Cantal', texte: 'avec Jeanne Lefèvre', lien: 'jeanne', sources: 2 },
    { type: 'Naissance d’un enfant', icone: 'enfant', date: '3 juin 1921', lieu: 'Aurillac, Cantal', texte: 'Henri Martin', lien: 'henri' },
    { type: 'Résidence', icone: 'residence', date: '1926', lieu: 'Aurillac, Cantal', texte: '12 rue des Forgerons', sources: 1 },
    { type: 'Décès', icone: 'deces', date: '12 mars 1962', lieu: 'Aurillac, Cantal', texte: 'à 72 ans environ', sources: 1 },
    { type: 'Inhumation', icone: 'inhumation', date: '15 mars 1962', lieu: 'Saint-Flour, Cantal', texte: 'Cimetière de Saint-Flour, caveau familial.' },
  ],
  parents: ['antoine', 'marieR'],
  conjoints: [{ id: 'jeanne', union: 'Mariage', date: '14 oct. 1919, Aurillac' }],
  enfants: ['henri'],
  fratrie: ['marie'],
  sources: [
    { titre: 'Registre matricule, classe 1910, n° 1342', type: 'Registre militaire', cote: 'AD Cantal · 1 R 1234', fiabilite: 'preuve' },
    { titre: 'Acte de mariage Martin × Lefèvre', type: 'Acte d’état civil', cote: 'AD Cantal · 4 E 15/32, vue 87', fiabilite: 'preuve' },
    { titre: 'Recensement d’Aurillac, 1926', type: 'Recensement', cote: 'AD Cantal · 6 M 412', fiabilite: 'indice' },
    { titre: 'Souvenirs de Louise Martin (2019)', type: 'Témoignage', cote: 'Entretien enregistré', fiabilite: 'hypothese' },
  ],
  documents: [
    { titre: 'Portrait', date: 'vers 1920', type: 'photo' },
    { titre: 'Photo de mariage', date: '1919', type: 'photo' },
    { titre: 'Acte de mariage', date: '1919', type: 'pdf', pages: 2 },
    { titre: 'Fiche matricule', date: '1910', type: 'photo' },
    { titre: 'Carte postale de la forge', date: 'vers 1930', type: 'photo' },
  ],
  notes: 'D’après Louise, Joseph a tenu la forge familiale de la rue des Forgerons jusqu’en 1955.\nIl aurait reçu la Croix de guerre après Verdun — à vérifier.',
  aChercher: [
    { texte: 'Acte de naissance à Saint-Flour (registres 1889 – 1891)', fait: false },
    { texte: 'Croix de guerre : demander au SHD de Vincennes', fait: false },
    { texte: 'Fiche matricule', fait: true },
  ],
};

GV.fiabilite = { preuve: 'Preuve', indice: 'Indice', hypothese: 'Hypothèse' };

// ---------- Les arbres de l'accueil ----------
GV.arbres = [
  { nom: 'Famille Martin – Dubois', personnes: 247, generations: 7, modif: 'il y a 2 jours', role: 'Propriétaire', racine: 'louise', couleur: 1 },
  { nom: 'Branche Bernard', personnes: 58, generations: 5, modif: 'il y a 3 semaines', role: 'Propriétaire', racine: 'pierre', couleur: 2 },
  { nom: 'Arbre de Mamie Rose', personnes: 112, generations: 6, modif: 'il y a 2 mois', role: 'Lecteur · partagé par Claire', racine: 'rose', couleur: 3 },
];

GV.recents = ['joseph', 'rose', 'henri', 'emile'];
GV.commemorations = [
  { texte: 'Il y a 100 ans naissait Henri Martin', date: 'le 3 juin', id: 'henri' },
  { texte: 'Il y a 80 ans disparaissait Émile Dubois', date: 'le 21 août', id: 'emile' },
];
GV.alertes = [{ id: 'marie', texte: 'Plus de 110 ans sans date de décès' }];

// ---------- Mise en page de la vue arbre « personne centrale » (maquettes A et B) ----------
// col = colonne (peut être décimale), gen = génération (-2 = grands-parents, 0 = centre, 2 = petits-enfants)
GV.vueArbre = {
  noeuds: [
    { id: 'joseph', col: 0, gen: -2 }, { id: 'jeanne', col: 1, gen: -2 },
    { id: 'emile', col: 2.2, gen: -2 }, { id: 'rose', col: 3.2, gen: -2 },
    { id: 'henri', col: 0.5, gen: -1 }, { id: 'marguerite', col: 2.7, gen: -1 },
    { id: 'louise', col: 1.1, gen: 0, centre: true }, { id: 'pierre', col: 2.1, gen: 0, conjoint: true },
    { id: 'claire', col: 1.1, gen: 1 }, { id: 'thomas', col: 2.1, gen: 1 },
    { id: 'lea', col: 1.1, gen: 2 }, { id: 'hugo', col: 2.1, gen: 2 },
  ],
  familles: [
    { p: ['joseph', 'jeanne'], enfants: ['henri'] },
    { p: ['emile', 'rose'], enfants: ['marguerite'] },
    { p: ['henri', 'marguerite'], enfants: ['louise'] },
    { p: ['louise', 'pierre'], enfants: ['claire', 'thomas'] },
    { p: ['claire', null], enfants: ['lea'] },
    { p: ['thomas', null], enfants: ['hugo'] },
  ],
};

/**
 * Dessine la vue arbre : des cartes positionnées + les traits de liens en SVG.
 * opts : { w, h, gx, gy (espacements), carte(id, noeud) → HTML, arrondi (rayon des coudes) }
 */
GV.dessinerArbre = (opts) => {
  const { w, h, gx, gy, carte, arrondi = 0 } = opts;
  const pos = {};
  let maxX = 0, maxY = 0;
  for (const n of GV.vueArbre.noeuds) {
    const x = n.col * (w + gx), y = (n.gen + 2) * (h + gy);
    pos[n.id] = { x, y, n };
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  }
  const r = arrondi;
  // Trait vertical puis horizontal puis vertical, avec coins éventuellement arrondis
  const coude = (x1, y1, x2, y2, ym) => {
    if (Math.abs(x1 - x2) < 1) return `M${x1} ${y1}V${y2}`;
    const s = x2 > x1 ? 1 : -1, rr = Math.min(r, Math.abs(x2 - x1) / 2);
    return `M${x1} ${y1}V${ym - rr}Q${x1} ${ym} ${x1 + s * rr} ${ym}H${x2 - s * rr}Q${x2} ${ym} ${x2} ${ym + rr}V${y2}`;
  };
  let traits = '', unions = '';
  for (const f of GV.vueArbre.familles) {
    const a = pos[f.p[0]], b = f.p[1] && pos[f.p[1]];
    let sx, sy;
    if (b) {
      const [g, d] = a.x < b.x ? [a, b] : [b, a];
      sy = a.y + h / 2;
      unions += `<path class="trait-union" d="M${g.x + w} ${sy}H${d.x}"/>`;
      sx = (g.x + w + d.x) / 2;
    } else { sx = a.x + w / 2; sy = a.y + h; }
    for (const e of f.enfants) {
      const c = pos[e];
      traits += `<path class="trait" d="${coude(sx, sy, c.x + w / 2, c.y, c.y - gy / 2)}"/>`;
    }
  }
  const cartes = GV.vueArbre.noeuds
    .map((n) => `<div class="noeud${n.centre ? ' est-centre' : ''}${n.conjoint ? ' est-conjoint' : ''}" style="left:${pos[n.id].x}px;top:${pos[n.id].y}px;width:${w}px;height:${h}px">${carte(n.id, n)}</div>`)
    .join('');
  return `<div class="arbre-plan" style="width:${maxX}px;height:${maxY}px"><svg class="arbre-liens" width="${maxX}" height="${maxY}" aria-hidden="true">${traits}${unions}</svg>${cartes}</div>`;
};
