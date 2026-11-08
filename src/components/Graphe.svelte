<script lang="ts">
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import { analyse, arbre, D, ui } from '../lib/arbre.svelte';
  import { disposer, H, L } from '../lib/disposition';
  import { nomCourt, vieCourte } from '../lib/genealogie';

  // ============================================================
  // Vue graphique « personne centrale » : cartes + traits, que l'on
  // déplace à la souris ou au doigt, et que l'on zoome (molette,
  // pincement à deux doigts, ou boutons).
  //  - un clic sur une personne la met au centre
  //  - un double-clic ouvre sa fiche
  // ============================================================
  let {
    centreId,
    generations,
    peutModifier,
    onrecentrer,
    onouvrir,
  }: { centreId: string; generations: number; peutModifier: boolean; onrecentrer: (id: string) => void; onouvrir: (id: string) => void } = $props();

  const vue = $derived.by(() => {
    arbre.version;
    const d = disposer(D, centreId, { ascendants: generations, descendants: 2, casesVides: peutModifier });
    // Une même personne peut apparaître deux fois (mariage entre cousins) : clés uniques
    const { sosa, alertes } = analyse();
    const vus = new Map<string, number>();
    const cartes = d.cartes.map((c) => {
      const n = (vus.get(c.id) ?? 0) + 1;
      vus.set(c.id, n);
      return { ...c, cle: n === 1 ? c.id : `${c.id}#${n}`, p: D.personnes.get(c.id)!, vie: vieCourte(D, c.id), sosa: sosa.get(c.id)?.[0], alerte: alertes.has(c.id) };
    });
    return { ...d, cartes };
  });

  // ----- Position et zoom (t = décalage x, y et échelle k) -----
  let scene: HTMLDivElement | undefined = $state();
  let t = $state({ x: 0, y: 0, k: 1 });
  let anime = $state(false);
  let animTimer: ReturnType<typeof setTimeout> | undefined;

  const K_MIN = 0.3, K_MAX = 2;
  const borne = (k: number) => Math.min(K_MAX, Math.max(K_MIN, k));

  /**
   * Si tout l'arbre visible tient à l'écran, on le centre (dans l'espace libre sous la barre
   * d'outils) ; sinon, c'est la personne centrale qui est mise au milieu.
   */
  function centrer(avecAnimation = true, ajusterZoom = false) {
    const c = vue.cartes.find((x) => x.role === 'centre');
    if (!scene || !c) return;
    const r = scene.getBoundingClientRect();
    const haut = 76, bas = r.height - 16; // espace sous la barre d'outils flottante
    // À l'ouverture : zoom réduit si l'arbre ne tient pas (sans descendre sous 55 % pour rester lisible)
    if (ajusterZoom) {
      const k = Math.min(1, (r.width - 32) / (vue.maxX - vue.minX + 40), (bas - haut) / (vue.maxY - vue.minY + 40));
      t = { ...t, k: Math.max(0.55, k) };
    }
    const hauteurArbre = (vue.maxY - vue.minY) * t.k;
    const y = hauteurArbre <= bas - haut
      ? (haut + bas) / 2 - ((vue.minY + vue.maxY) / 2) * t.k
      : (haut + bas) / 2 - (c.y + H / 2) * t.k;
    const largeurArbre = (vue.maxX - vue.minX) * t.k;
    const x = largeurArbre <= r.width - 32
      ? r.width / 2 - ((vue.minX + vue.maxX) / 2) * t.k
      : r.width / 2 - (c.x + L / 2) * t.k;
    anime = avecAnimation;
    t = { k: t.k, x, y };
    clearTimeout(animTimer);
    animTimer = setTimeout(() => (anime = false), 400);
  }
  export function zoomer(facteur: number) {
    if (!scene) return;
    const r = scene.getBoundingClientRect();
    zoomAutour(r.width / 2, r.height / 2, facteur, true);
  }
  export const recentrer = () => centrer(true);

  function zoomAutour(px: number, py: number, facteur: number, avecAnimation = false) {
    const k = borne(t.k * facteur);
    const f = k / t.k;
    anime = avecAnimation;
    t = { k, x: px - (px - t.x) * f, y: py - (py - t.y) * f };
  }

  // Recentre à chaque changement de personne centrale ou de nombre de générations
  // (et SEULEMENT dans ces cas : untrack évite de recentrer à chaque déplacement ou zoom)
  let premier = true;
  $effect(() => {
    centreId; generations;
    if (!scene) return;
    untrack(() => centrer(!premier, premier));
    premier = false;
  });

  // ----- Gestes : glisser (1 doigt / souris), pincer (2 doigts) -----
  const pointeurs = new Map<number, { x: number; y: number }>();
  let geste: { x0: number; y0: number; t0: typeof t; d0: number; mx: number; my: number } | null = null;
  let aBouge = false;

  function demarrer() {
    const pts = [...pointeurs.values()];
    const r = scene!.getBoundingClientRect();
    if (pts.length === 1) geste = { x0: pts[0].x, y0: pts[0].y, t0: { ...t }, d0: 0, mx: 0, my: 0 };
    else if (pts.length >= 2) {
      const [a, b] = pts;
      geste = { x0: 0, y0: 0, t0: { ...t }, d0: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
    }
  }
  function appui(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    aBouge = false;
    anime = false;
    demarrer();
  }
  function mouvement(e: PointerEvent) {
    if (!pointeurs.has(e.pointerId) || !geste) return;
    pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointeurs.values()];
    if (pts.length === 1) {
      const dx = pts[0].x - geste.x0, dy = pts[0].y - geste.y0;
      if (Math.hypot(dx, dy) > 5) aBouge = true;
      if (aBouge) t = { ...t, x: geste.t0.x + dx, y: geste.t0.y + dy };
    } else {
      aBouge = true;
      const [a, b] = pts;
      const k = borne(geste.t0.k * (Math.hypot(a.x - b.x, a.y - b.y) / geste.d0));
      const f = k / geste.t0.k;
      t = { k, x: geste.mx - (geste.mx - geste.t0.x) * f, y: geste.my - (geste.my - geste.t0.y) * f };
    }
  }
  function relache(e: PointerEvent) {
    if (!pointeurs.delete(e.pointerId)) return;
    if (pointeurs.size) demarrer();
    else geste = null;
  }

  // Molette : zoom autour du curseur ; défilement à deux doigts du pavé tactile : déplacement
  $effect(() => {
    const el = scene;
    if (!el) return;
    const molette = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const pave = !e.ctrlKey && e.deltaMode === 0 && (Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) < 40);
      if (pave) { anime = false; t = { ...t, x: t.x - e.deltaX, y: t.y - e.deltaY }; }
      else zoomAutour(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    el.addEventListener('wheel', molette, { passive: false });
    window.addEventListener('pointermove', mouvement);
    window.addEventListener('pointerup', relache);
    window.addEventListener('pointercancel', relache);
    return () => {
      el.removeEventListener('wheel', molette);
      window.removeEventListener('pointermove', mouvement);
      window.removeEventListener('pointerup', relache);
      window.removeEventListener('pointercancel', relache);
    };
  });

  // Après un glissement, le clic qui suit ne doit pas recentrer.
  // On attend un court instant avant de recentrer : si un 2e clic arrive (double-clic), on ouvre la fiche.
  let attente: ReturnType<typeof setTimeout> | undefined;
  function clicCarte(id: string) {
    if (aBouge || id === centreId) return;
    clearTimeout(attente);
    attente = setTimeout(() => onrecentrer(id), 230);
  }
  function doubleClic(id: string) {
    clearTimeout(attente);
    onouvrir(id);
  }

  // Clavier : + et - pour zoomer, flèches pour se déplacer
  function clavier(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    const pas = 60;
    if (e.key === '+' || e.key === '=') zoomer(1.2);
    else if (e.key === '-') zoomer(1 / 1.2);
    else if (e.key === 'ArrowLeft') t = { ...t, x: t.x + pas };
    else if (e.key === 'ArrowRight') t = { ...t, x: t.x - pas };
    else if (e.key === 'ArrowUp') t = { ...t, y: t.y + pas };
    else if (e.key === 'ArrowDown') t = { ...t, y: t.y - pas };
    else return;
    e.preventDefault();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="scene" bind:this={scene} onpointerdown={appui} onkeydown={clavier} role="application" aria-label="Arbre généalogique : glissez pour vous déplacer, molette ou pincement pour zoomer">
  <div class="plan" class:anime style="transform: translate({t.x}px, {t.y}px) scale({t.k})">
    <svg class="traits" style="left:{vue.minX - 40}px; top:{vue.minY - 40}px" width={vue.maxX - vue.minX + 80} height={vue.maxY - vue.minY + 80}
      viewBox="{vue.minX - 40} {vue.minY - 40} {vue.maxX - vue.minX + 80} {vue.maxY - vue.minY + 80}" aria-hidden="true">
      {#each vue.traits as tr}
        <path d={tr.d} class={tr.style} />
      {/each}
    </svg>

    {#each vue.vides as v (v.cle)}
      <button class="vide" style="left:{v.x}px; top:{v.y}px" transition:fade={{ duration: 150 }}
        onclick={() => !aBouge && (ui.personne = { relation: { type: 'parent', of: v.enfant }, sexe: v.sexe })}>
        <Icon name="plus" size={16} /> {v.sexe === 'M' ? 'Ajouter le père' : 'Ajouter la mère'}
      </button>
    {/each}

    {#each vue.cartes as c (c.cle)}
      <button
        class="carte" class:centre={c.role === 'centre'} data-sexe={c.p?.sex}
        style="left:{c.x}px; top:{c.y}px"
        title="Clic : mettre au centre · double-clic : ouvrir la fiche"
        onclick={() => clicCarte(c.id)}
        ondblclick={() => doubleClic(c.id)}
        transition:fade={{ duration: 180 }}
      >
        {#if c.ancetresCaches}<span class="indice haut" title="Ancêtres plus anciens"><Icon name="up" size={12} /></span>{/if}
        <Avatar p={c.p} taille={34} />
        <span class="txt"><span class="nom">{nomCourt(c.p)}</span><span class="vie">{c.vie || ' '}</span></span>
        {#if c.sosa}<span class="sosa" title="Numéro Sosa">{c.sosa}</span>{/if}
        {#if c.alerte}<span class="alerte" title="Point à vérifier sur la fiche"><Icon name="alert" size={12} /></span>{/if}
        {#if c.descendantsCaches}<span class="indice bas" title="{c.descendantsCaches} enfant(s) non affiché(s)"><Icon name="down" size={12} />{c.descendantsCaches}</span>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .scene {
    position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; user-select: none;
    background-color: var(--bg);
    background-image: radial-gradient(color-mix(in srgb, var(--border-strong) 70%, transparent) 1px, transparent 1px);
    background-size: 22px 22px;
  }
  .scene:active { cursor: grabbing; }
  .plan { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
  .plan.anime { transition: transform 380ms var(--ease-out); }
  .traits { position: absolute; overflow: visible; pointer-events: none; }
  .traits path { fill: none; stroke-width: 2; }
  .traits .filiation { stroke: var(--border-strong); }
  .traits .union { stroke: var(--femme); opacity: 0.5; }
  .traits .vide { stroke: var(--border-strong); stroke-dasharray: 4 5; }
  /* Union terminée (divorce, séparation) : tirets ; liaison : pointillés */
  .traits .rompue { stroke: var(--femme); opacity: 0.5; stroke-dasharray: 9 6; }
  .traits .liaison { stroke: var(--femme); opacity: 0.6; stroke-dasharray: 1 6; stroke-linecap: round; }

  .carte, .vide {
    position: absolute; width: 200px; height: 64px; /* = L × H de disposition.ts */
    transition: left 380ms var(--ease-out), top 380ms var(--ease-out), box-shadow var(--dur-fast), border-color var(--dur-fast);
  }
  .carte {
    display: flex; align-items: center; gap: 11px; padding: 0 12px; border-radius: 14px;
    border: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow);
    font: inherit; color: var(--text); text-align: left; cursor: pointer;
  }
  .carte:hover { border-color: var(--border-strong); box-shadow: var(--shadow-lg); }
  .carte.centre { border: 2px solid var(--accent); box-shadow: 0 0 0 5px var(--accent-soft), var(--shadow-lg); }
  .txt { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
  .nom { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vie { font-size: 12.5px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .carte { padding-right: 20px; }
  .sosa { position: absolute; top: 5px; right: 8px; font-size: 10.5px; font-weight: 700; color: var(--text-3); font-variant-numeric: tabular-nums; }
  .alerte { position: absolute; bottom: 5px; right: 6px; color: var(--warn); display: flex; }
  .indice {
    position: absolute; left: 50%; translate: -50% 0; display: inline-flex; align-items: center; gap: 2px;
    height: 18px; padding: 0 6px; border-radius: 99px; font-size: 11px; font-weight: 700;
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2);
  }
  .indice.haut { top: -10px; }
  .indice.bas { bottom: -10px; }
  .vide {
    display: flex; align-items: center; justify-content: center; gap: 6px; border-radius: 14px;
    border: 1.5px dashed var(--border-strong); background: color-mix(in srgb, var(--surface) 60%, transparent);
    font: inherit; font-size: 13px; font-weight: 600; color: var(--accent-text); cursor: pointer;
  }
  .vide:hover { border-style: solid; border-color: var(--accent); background: var(--accent-soft); }
  @media (prefers-reduced-motion: reduce) { .plan.anime, .carte, .vide { transition: none; } }
</style>
