<script lang="ts">
  import { urlFichier, type Personne } from '../lib/arbre.svelte';
  import { initiales } from '../lib/genealogie';

  // Pastille ronde : la photo principale si elle existe, sinon les initiales.
  // Anneau bleu (homme) ou rose (femme).
  let { p, taille = 40 }: { p: Personne | undefined; taille?: number } = $props();

  let photoCassee = $state(false);
  const photo = $derived(p?.photo_media_id && !photoCassee ? urlFichier(p.photo_media_id, 'thumb') : null);
  $effect(() => { p?.photo_media_id; photoCassee = false; });
</script>

<span class="avatar" data-sexe={p?.sex ?? 'U'} style="--t:{taille}px" aria-hidden="true">
  {#if photo}
    <img src={photo} alt="" loading="lazy" decoding="async" draggable="false" onerror={() => (photoCassee = true)} />
  {:else}
    {initiales(p)}
  {/if}
</span>

<style>
  .avatar {
    display: inline-grid; place-items: center; flex: none; width: var(--t); height: var(--t); border-radius: 50%; overflow: hidden;
    font-size: calc(var(--t) * 0.36); font-weight: 650; letter-spacing: 0.02em;
    background: var(--surface-2); color: var(--text-2);
    box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--border);
  }
  .avatar[data-sexe='M'] { background: var(--homme-soft); color: var(--homme); box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--homme-soft); }
  .avatar[data-sexe='F'] { background: var(--femme-soft); color: var(--femme); box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--femme-soft); }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
