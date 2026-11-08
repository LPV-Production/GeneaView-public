// ============================================================
// « Cadre » de présentation des maquettes : barre du haut (écrans,
// ordinateur / téléphone, clair / sombre) et deux faux appareils
// où le même écran est affiché côte à côte.
// Sur un vrai téléphone, seul l'écran téléphone s'affiche, en plein écran.
// ============================================================
window.GV = window.GV || {};

GV.monter = ({ lettre, nom, ecrans, apres, palettes }) => {
  const ordre = Object.keys(ecrans);
  const memo = {
    lire: (k, d) => { try { return localStorage.getItem('gv-maquette-' + k) || d; } catch { return d; } },
    ecrire: (k, v) => { try { localStorage.setItem('gv-maquette-' + k, v); } catch {} },
  };
  const etat = {
    ecran: ordre.includes(location.hash.slice(1)) ? location.hash.slice(1) : ordre[0],
    mode: memo.lire('mode', 'deux'),
    theme: memo.lire('theme', 'auto'),
    palette: palettes ? memo.lire('palette-' + lettre, palettes[0][0]) : null,
  };
  // Palettes de couleurs proposées (facultatif) : [identifiant, nom, couleur de la pastille]
  const choixPalettes = palettes
    ? `<div class="gv-seg gv-palettes" role="group" aria-label="Palette">${palettes
        .map(([v, t, c]) => `<button type="button" data-palette="${v}" title="${t}"><i style="background:${c}"></i><span>${t}</span></button>`)
        .join('')}</div>`
    : '';

  const seg = (groupe, choix) =>
    `<div class="gv-seg" role="group" aria-label="${groupe.label}">${choix
      .map(([v, ic, t]) => `<button type="button" data-${groupe.cle}="${v}" title="${t}" aria-label="${t}">${GV.ic(ic, 16)}<span>${t}</span></button>`)
      .join('')}</div>`;

  document.body.insertAdjacentHTML('afterbegin', `
    <header class="gv-barre">
      <a class="gv-retour" href="index.html">${GV.ic('gauche', 16)}<span>Les 3 maquettes</span></a>
      <strong class="gv-titre"><span class="gv-lettre">${lettre}</span> ${nom}</strong>
      <nav class="gv-onglets" aria-label="Écrans">${ordre.map((k, i) => `<button type="button" data-onglet="${k}"><span class="gv-num">${i + 1}</span>${ecrans[k].titre}</button>`).join('')}</nav>
      <div class="gv-reglages">
        ${choixPalettes}
        ${seg({ cle: 'mode', label: 'Appareil' }, [['deux', 'deux', 'Les deux'], ['ordi', 'ordi', 'Ordinateur'], ['tel', 'telephone', 'Téléphone']])}
        ${seg({ cle: 'theme', label: 'Thème' }, [['auto', 'centrer', 'Auto'], ['clair', 'soleil', 'Clair'], ['sombre', 'lune', 'Sombre']])}
      </div>
    </header>
    <main class="gv-scene">
      <figure class="gv-ordi" aria-label="Aperçu ordinateur">
        <div class="gv-ordi-barre"><i></i><i></i><i></i><span class="gv-url">geneaview.workers.dev</span></div>
        <div class="gv-ecran" data-device="ordi"></div>
      </figure>
      <figure class="gv-tel" aria-label="Aperçu téléphone">
        <div class="gv-ecran" data-device="tel"></div>
      </figure>
    </main>`);

  const scene = document.querySelector('.gv-scene');
  const ordi = document.querySelector('.gv-ordi');
  const tel = document.querySelector('.gv-tel');
  const ecransDom = [...document.querySelectorAll('.gv-ecran')];
  const mqMobile = matchMedia('(max-width: 760px)');
  const mqSombre = matchMedia('(prefers-color-scheme: dark)');

  function appliquerTheme() {
    const sombre = etat.theme === 'sombre' || (etat.theme === 'auto' && mqSombre.matches);
    document.documentElement.dataset.theme = sombre ? 'dark' : 'light';
    if (etat.palette) document.documentElement.dataset.palette = etat.palette;
  }

  // Réduit l'aperçu ordinateur pour qu'il tienne dans la fenêtre
  function ajuster() {
    const mobile = mqMobile.matches;
    document.body.classList.toggle('gv-mobile', mobile);
    const mode = mobile ? 'tel' : etat.mode;
    scene.dataset.mode = mode;
    ordi.hidden = mode === 'tel';
    tel.hidden = mode === 'ordi';
    if (mobile) { ordi.style.zoom = tel.style.zoom = ''; return; }
    const dispo = scene.clientWidth - 56;
    const hauteurDispo = innerHeight - scene.getBoundingClientRect().top - 32;
    const zt = Math.min(1, Math.max(0.6, hauteurDispo / 846));
    const largeurTel = mode === 'deux' ? 416 * zt + 40 : 0;
    let z = Math.min(1, (dispo - largeurTel) / 1202, hauteurDispo / 802);
    if (mode === 'deux' && z < 0.55) z = Math.min(1, dispo / 1202); // trop étroit : l'un sous l'autre
    ordi.style.zoom = Math.max(0.4, z);
    tel.style.zoom = zt;
  }

  function rendre() {
    for (const el of ecransDom) {
      el.innerHTML = ecrans[etat.ecran].rendre(el.dataset.device);
      el.dataset.ecran = etat.ecran;
      // Vue arbre : on centre la personne principale à l'ouverture
      const sc = el.querySelector('.arbre-scene'), c = el.querySelector('.est-centre');
      if (sc && c) {
        const rs = sc.getBoundingClientRect(), rc = c.getBoundingClientRect();
        const f = rs.width / sc.offsetWidth || 1; // facteur de réduction de l'aperçu
        sc.scrollLeft += (rc.left + rc.width / 2 - (rs.left + rs.width / 2)) / f;
        sc.scrollTop += (rc.top + rc.height / 2 - (rs.top + rs.height / 2)) / f;
      }
      apres?.(el, etat.ecran, el.dataset.device);
    }
    document.querySelectorAll('[data-onglet]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.onglet === etat.ecran));
    document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === etat.mode));
    document.querySelectorAll('[data-theme]').forEach((b) => b.tagName === 'BUTTON' && b.setAttribute('aria-pressed', b.dataset.theme === etat.theme));
    document.querySelectorAll('button[data-palette]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.palette === etat.palette));
    document.title = `${ecrans[etat.ecran].titre} · Maquette ${lettre} — ${nom} · GeneaView`;
  }

  function aller(ecran) {
    etat.ecran = ecran;
    history.replaceState(null, '', '#' + ecran);
    rendre();
    ecransDom.forEach((e) => e.querySelectorAll('.defile').forEach((d) => (d.scrollTop = 0)));
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, a, [data-aller]');
    if (!t) return;
    if (t.dataset.onglet) return aller(t.dataset.onglet);
    if (t.dataset.aller) { e.preventDefault(); return aller(t.dataset.aller); }
    if (t.dataset.mode && t.tagName === 'BUTTON') { etat.mode = t.dataset.mode; memo.ecrire('mode', etat.mode); ajuster(); return rendre(); }
    if (t.dataset.palette && t.tagName === 'BUTTON') { etat.palette = t.dataset.palette; memo.ecrire('palette-' + lettre, etat.palette); appliquerTheme(); return rendre(); }
    if (t.dataset.theme && t.tagName === 'BUTTON') { etat.theme = t.dataset.theme; memo.ecrire('theme', etat.theme); appliquerTheme(); return rendre(); }
    // « Plus de détails » : ouvre / ferme le bloc parent
    if (t.hasAttribute('data-plus')) {
      const bloc = t.closest('[data-bloc]');
      const ouvert = bloc.classList.toggle('ouvert');
      t.setAttribute('aria-expanded', ouvert);
      return;
    }
    // Boutons de zoom de la vue arbre
    if (t.dataset.zoom) {
      const plan = t.closest('.gv-ecran').querySelector('.arbre-plan, .eventail-plan');
      const z = parseFloat(plan.style.zoom || getComputedStyle(plan).zoom) || 1;
      plan.style.zoom = t.dataset.zoom === '0' ? '' : Math.min(2, Math.max(0.35, z * (t.dataset.zoom === '+' ? 1.2 : 1 / 1.2)));
      return;
    }
    // Onglets internes (ex. sections de la fiche sur téléphone)
    if (t.dataset.section) {
      const cible = t.closest('.gv-ecran').querySelector(`[data-ancre="${t.dataset.section}"]`);
      cible?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      t.parentElement.querySelectorAll('[data-section]').forEach((b) => b.setAttribute('aria-current', b === t));
    }
    // Cases à cocher « à chercher »
    if (t.classList.contains('coche-a-chercher')) t.closest('li').classList.toggle('fait');
  });

  // Déplacement de l'arbre à la souris (glisser)
  let glisse = null;
  document.addEventListener('pointerdown', (e) => {
    const sc = e.target.closest('.arbre-scene');
    if (!sc || e.pointerType !== 'mouse' || e.target.closest('button, a, .noeud, .secteur')) return;
    glisse = { sc, x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop };
    sc.classList.add('glisse');
  });
  addEventListener('pointermove', (e) => {
    if (!glisse) return;
    glisse.sc.scrollLeft = glisse.l - (e.clientX - glisse.x);
    glisse.sc.scrollTop = glisse.t - (e.clientY - glisse.y);
  });
  addEventListener('pointerup', () => { glisse?.sc.classList.remove('glisse'); glisse = null; });

  mqSombre.addEventListener('change', () => { appliquerTheme(); rendre(); });
  mqMobile.addEventListener('change', () => { ajuster(); rendre(); });
  addEventListener('resize', ajuster);
  appliquerTheme();
  ajuster();
  rendre();
};
