<script lang="ts">
  import Icon from './Icon.svelte';

  // Petit menu « ⋯ » : une liste d'actions secondaires.
  // La liste est posée au-dessus de toute la page (pas dans la carte qui contient le bouton) :
  // sinon, sur téléphone, une carte aux bords arrondis la coupait et certaines actions devenaient invisibles.
  type Action = { label: string; icon?: string; danger?: boolean; onclick: () => void };
  let { actions, label = 'Plus d’actions' }: { actions: Action[]; label?: string } = $props();

  let ouvert = $state(false);
  let racine: HTMLDivElement | undefined = $state();
  let liste: HTMLDivElement | undefined = $state();
  let place = $state({ top: 0, left: 0, maxHeight: 0 });

  /** Ouvre la liste sous le bouton, ou au-dessus s'il n'y a pas la place, sans dépasser de l'écran. */
  function placer() {
    const b = racine!.getBoundingClientRect();
    const largeur = Math.min(260, innerWidth - 16);
    // Hauteur réelle de la liste (les libellés longs passent sur deux lignes)
    const hauteur = Math.min(liste?.scrollHeight || actions.length * 44 + 14, innerHeight - 16);
    const enHaut = b.bottom + 6 + hauteur > innerHeight - 8 && b.top - 6 - hauteur >= 8;
    place = {
      top: enHaut ? b.top - 6 - hauteur : Math.min(b.bottom + 6, innerHeight - 8 - hauteur),
      left: Math.max(8, Math.min(b.right - largeur, innerWidth - 8 - largeur)),
      maxHeight: hauteur,
    };
  }

  /** Déplace la liste à la fin de la page (en dehors de toute carte qui pourrait la couper). */
  function auDessus(node: HTMLElement) {
    document.body.appendChild(node);
    return () => node.remove();
  }

  $effect(() => {
    if (!ouvert) return;
    placer();
    const dehors = (e: Event) => { if (!racine?.contains(e.target as Node) && !liste?.contains(e.target as Node)) ouvert = false; };
    const fermer = (e: Event) => { if (!liste?.contains(e.target as Node)) ouvert = false; };
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && (ouvert = false);
    document.addEventListener('pointerdown', dehors);
    document.addEventListener('keydown', echap);
    // La page défile ou change de taille : la liste ne suivrait pas le bouton, on la referme
    addEventListener('resize', fermer);
    addEventListener('scroll', fermer, true);
    return () => {
      document.removeEventListener('pointerdown', dehors); document.removeEventListener('keydown', echap);
      removeEventListener('resize', fermer); removeEventListener('scroll', fermer, true);
    };
  });
</script>

<div class="menu" bind:this={racine}>
  <button class="btn btn-icon" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={ouvert} onclick={() => (ouvert = !ouvert)}>
    <Icon name="more" size={18} />
  </button>
  {#if ouvert}
    <div class="liste" role="menu" bind:this={liste} {@attach auDessus}
      style:top="{place.top}px" style:left="{place.left}px" style:max-height="{place.maxHeight}px">
      {#each actions as a}
        <button role="menuitem" class:danger={a.danger} onclick={() => { ouvert = false; a.onclick(); }}>
          {#if a.icon}<Icon name={a.icon} size={16} />{/if}{a.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .menu { position: relative; }
  .liste {
    position: fixed; z-index: 200; width: min(260px, calc(100vw - 16px)); padding: 6px; overflow-y: auto;
    border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow-lg);
  }
  .liste button {
    display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 0 12px; border: 0; border-radius: 8px;
    background: none; font: inherit; font-size: 14px; color: var(--text); text-align: left; cursor: pointer;
  }
  .liste button:hover { background: var(--surface-2); }
  .liste button.danger { color: var(--neg); }
</style>
