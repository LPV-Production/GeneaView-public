<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  // Fenêtre par-dessus l'écran : centrée sur ordinateur, montante depuis le bas sur téléphone.
  let {
    title,
    subtitle = '',
    onclose,
    children,
    footer,
    wide = false,
  }: { title: string; subtitle?: string; onclose: () => void; children: Snippet; footer?: Snippet; wide?: boolean } = $props();

  let box: HTMLDivElement | undefined = $state();

  onMount(() => {
    // Met le curseur dans le premier champ, sinon sur le bouton Fermer
    (box?.querySelector('input, select, textarea') as HTMLElement | null)?.focus();
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
<div class="modal" class:wide role="dialog" aria-modal="true" aria-labelledby="modal-title" bind:this={box}>
  <header>
    <div>
      <h2 id="modal-title">{title}</h2>
      {#if subtitle}<p class="muted small">{subtitle}</p>{/if}
    </div>
    <button class="btn btn-ghost btn-icon" onclick={onclose} aria-label="Fermer"><Icon name="x" /></button>
  </header>
  <div class="body">{@render children()}</div>
  {#if footer}<footer>{@render footer()}</footer>{/if}
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 50; border: 0; background: var(--overlay); animation: fade var(--dur) ease-out; }
  .modal {
    position: fixed; z-index: 51; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 48px);
    display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border);
    border-radius: 20px; box-shadow: var(--shadow-lg); overflow: hidden; animation: pop 220ms var(--ease-out);
  }
  .modal.wide { width: min(720px, calc(100vw - 32px)); }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 14px 6px 22px; }
  h2 { font: 600 20px/1.25 var(--titre); }
  .body { flex: 1; overflow-y: auto; padding: 12px 22px 20px; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 18px; }
  .body > :global(*) { flex-shrink: 0; }
  footer { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 22px; border-top: 1px solid var(--border); padding-bottom: calc(14px + env(safe-area-inset-bottom)); }

  @media (max-width: 640px) {
    .modal, .modal.wide {
      left: 0; right: 0; top: auto; bottom: 0; transform: none; width: 100%; max-height: 94dvh;
      border-radius: 20px 20px 0 0; animation-name: slide-up;
    }
    header { padding-left: 16px; }
    .body { padding: 10px 16px 16px; }
    footer { padding-left: 16px; padding-right: 16px; }
    footer :global(.btn) { flex: 1; }
  }

  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: translate(-50%, -48%) scale(0.98); } }
  @keyframes slide-up { from { opacity: 0; transform: translateY(40px); } }
</style>
