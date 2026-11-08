<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  // Panneau qui glisse par-dessus l'écran : à droite sur ordinateur, depuis le bas sur téléphone.
  // Utilisé pour les formulaires longs (fiche d'une personne).
  let {
    title,
    subtitle = '',
    onclose,
    children,
    footer,
  }: { title: string; subtitle?: string; onclose: () => void; children: Snippet; footer?: Snippet } = $props();

  let box: HTMLDivElement | undefined = $state();

  onMount(() => {
    (box?.querySelector('input:not([type=checkbox]):not([hidden]), select, textarea') as HTMLElement | null)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onclose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  });
</script>

<button class="backdrop" aria-label="Fermer" tabindex="-1" onclick={onclose}></button>
<div class="panneau" role="dialog" aria-modal="true" aria-labelledby="panneau-titre" bind:this={box}>
  <header>
    <div>
      <h2 id="panneau-titre">{title}</h2>
      {#if subtitle}<p class="muted small">{subtitle}</p>{/if}
    </div>
    <button class="btn btn-ghost btn-icon" onclick={onclose} aria-label="Fermer"><Icon name="x" /></button>
  </header>
  <div class="body">{@render children()}</div>
  {#if footer}<footer>{@render footer()}</footer>{/if}
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 50; border: 0; background: var(--overlay); animation: fade var(--dur) ease-out; }
  .panneau {
    position: fixed; z-index: 51; top: 0; right: 0; bottom: 0; width: min(540px, 100vw);
    display: flex; flex-direction: column; background: var(--surface); border-left: 1px solid var(--border);
    box-shadow: var(--shadow-lg); animation: glisse 260ms var(--ease-out);
  }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 14px 12px 22px; border-bottom: 1px solid var(--border); }
  h2 { font: 600 21px/1.25 var(--titre); }
  .body { flex: 1; overflow-y: auto; padding: 20px 22px 28px; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 22px; }
  .body > :global(*) { flex-shrink: 0; }
  footer { display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 14px 22px; border-top: 1px solid var(--border); padding-bottom: calc(14px + env(safe-area-inset-bottom)); }

  @media (max-width: 640px) {
    .panneau { top: auto; left: 0; width: 100%; max-height: 94dvh; border-left: 0; border-radius: 20px 20px 0 0; animation-name: monte; }
    .panneau::before { content: ''; position: absolute; top: 7px; left: 50%; translate: -50% 0; width: 40px; height: 5px; border-radius: 9px; background: var(--border-strong); }
    header { padding: 20px 8px 10px 16px; }
    .body { padding: 16px; }
    footer { padding-left: 16px; padding-right: 16px; }
    footer :global(.btn) { flex: 1; }
  }
  @keyframes fade { from { opacity: 0; } }
  @keyframes glisse { from { transform: translateX(40px); opacity: 0; } }
  @keyframes monte { from { transform: translateY(40px); opacity: 0; } }
</style>
