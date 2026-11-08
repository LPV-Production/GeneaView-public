<script lang="ts">
  import { untrack } from 'svelte';
  import { arbre, D, ui, urlFichier } from '../lib/arbre.svelte';
  import { calculerEventail, RAYON_CENTRE } from '../lib/eventail';
  import { initiales, nomComplet, nomCourt, vieCourte } from '../lib/genealogie';
  import { PanZoom } from '../lib/panzoom.svelte';

  // Vue en éventail : clic sur un ancêtre = il passe au centre ; double-clic = sa fiche.
  let {
    centreId, generations, peutModifier, onrecentrer, onouvrir,
  }: { centreId: string; generations: number; peutModifier: boolean; onrecentrer: (id: string) => void; onouvrir: (id: string) => void } = $props();

  const pz = new PanZoom();
  export const zoomer = (f: number) => pz.zoomer(f);
  export const recentrer = () => ajuster(true);

  const vue = $derived.by(() => {
    arbre.version;
    return calculerEventail(D, centreId, generations, peutModifier);
  });
  const centre = $derived.by(() => { arbre.version; return D.personnes.get(centreId); });

  /** L'éventail entier à l'écran (le centre de l'éventail est en bas, au tiers inférieur). */
  function ajuster(anime: boolean) {
    if (!pz.el) return;
    const r = pz.el.getBoundingClientRect();
    const R = vue.rayon + 20;
    const k = Math.min(1.4, (r.width - 24) / (2 * R), (r.height - 200) / (R * 1.5)); // place pour la barre du haut et le panneau du bas
    pz.anime = anime;
    pz.k = Math.max(0.2, k);
    pz.x = r.width / 2;
    pz.y = 80 + R * pz.k;
    setTimeout(() => (pz.anime = false), 400);
  }
  let premier = true;
  $effect(() => {
    centreId; generations;
    if (!pz.el) return;
    untrack(() => ajuster(!premier));
    premier = false;
  });

  let attente: ReturnType<typeof setTimeout> | undefined;
  function clic(id: string | null, enfant: string | null) {
    if (pz.aBouge) return;
    if (!id) {
      if (enfant && peutModifier) ui.personne = { relation: { type: 'parent', of: enfant } };
      return;
    }
    clearTimeout(attente);
    attente = setTimeout(() => onrecentrer(id), 230);
  }
  function doubleClic(id: string | null) {
    clearTimeout(attente);
    if (id) onouvrir(id);
  }
</script>

<div class="scene" {@attach pz.attacher} role="application" aria-label="Éventail des ancêtres : glissez pour vous déplacer, molette ou pincement pour zoomer">
  <div class="plan" class:anime={pz.anime} style="transform: {pz.transform}">
    <svg class="eventail" style="left:{-vue.rayon - 10}px; top:{-vue.rayon - 10}px" width={2 * vue.rayon + 20} height={2 * vue.rayon + 20}
      viewBox="{-vue.rayon - 10} {-vue.rayon - 10} {2 * vue.rayon + 20} {2 * vue.rayon + 20}">
      {#each vue.segments as s (s.n)}
        <g class="segment {s.cote} g{Math.min(s.gen, 8)}" class:vide={!s.id}
          role="button" tabindex="0" aria-label={s.id ? nomComplet(D.personnes.get(s.id)) : s.sexe === 'M' ? 'Ajouter le père' : 'Ajouter la mère'}
          onclick={() => clic(s.id, s.enfant)} ondblclick={() => doubleClic(s.id)}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), s.id ? onrecentrer(s.id) : clic(null, s.enfant))}>
          <path d={s.d}><title>{s.id ? `${nomComplet(D.personnes.get(s.id))} · ${vieCourte(D, s.id)}` : s.sexe === 'M' ? 'Ajouter le père' : 'Ajouter la mère'}</title></path>
          {#if s.texte}
            <text x={s.texte.x} y={s.texte.y} transform="rotate({s.texte.rot} {s.texte.x} {s.texte.y})" font-size={s.texte.taille} text-anchor="middle">
              {#each s.texte.lignes as l, i}
                <tspan x={s.texte.x} dy={i === 0 ? `${(-(s.texte.lignes.length - 1) / 2) * 1.15 + 0.35}em` : '1.15em'} class:fort={i === 0 && s.id}>{l}</tspan>
              {/each}
            </text>
          {/if}
        </g>
      {/each}
      <g class="centre">
        <circle r={RAYON_CENTRE - 3} />
        {#if centre?.photo_media_id}
          <clipPath id="photo-centre"><circle cy="-14" r="26" /></clipPath>
          <image href={urlFichier(centre.photo_media_id, 'thumb')} x="-26" y="-40" width="52" height="52" clip-path="url(#photo-centre)" preserveAspectRatio="xMidYMid slice" />
        {:else}
          <text y="-8" text-anchor="middle" class="initiales">{initiales(centre)}</text>
        {/if}
        <text y="26" text-anchor="middle" class="nom">{nomCourt(centre)}</text>
        <text y="42" text-anchor="middle" class="vie">{vieCourte(D, centreId)}</text>
      </g>
    </svg>
  </div>
</div>

<style>
  .scene { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; user-select: none; background: var(--bg); }
  .scene:active { cursor: grabbing; }
  .plan { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
  .plan.anime { transition: transform 380ms var(--ease-out); }
  .eventail { position: absolute; overflow: visible; }
  .segment { cursor: pointer; outline: none; }
  .segment path { stroke: var(--bg); stroke-width: 1.5; transition: filter var(--dur-fast); }
  .segment:hover path, .segment:focus-visible path { filter: brightness(1.12) saturate(1.15); }
  .segment:focus-visible path { stroke: var(--accent); stroke-width: 2.5; }
  /* Lignée paternelle en bleu, maternelle en rose, de plus en plus claires en s'éloignant */
  .pat path { fill: color-mix(in srgb, var(--homme) var(--k), var(--surface)); }
  .mat path { fill: color-mix(in srgb, var(--femme) var(--k), var(--surface)); }
  .g1 { --k: 46%; } .g2 { --k: 36%; } .g3 { --k: 28%; } .g4 { --k: 22%; } .g5 { --k: 17%; } .g6 { --k: 13%; } .g7 { --k: 10%; } .g8 { --k: 8%; }
  .vide path { fill: transparent; stroke: var(--border-strong); stroke-dasharray: 4 4; }
  .vide:hover path { fill: var(--accent-soft); filter: none; }
  text { fill: var(--text); font-family: var(--font); pointer-events: none; }
  .fort { font-weight: 650; }
  .vide text { fill: var(--accent-text); font-weight: 700; }
  .centre circle { fill: var(--surface); stroke: var(--accent); stroke-width: 2.5; }
  .centre .initiales { font: 600 22px var(--titre); fill: var(--accent-text); }
  .centre .nom { font: 600 13px var(--font); }
  .centre .vie { font-size: 10.5px; fill: var(--text-3); }
  @media (prefers-reduced-motion: reduce) { .plan.anime { transition: none; } }
</style>
