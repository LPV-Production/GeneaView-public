<script lang="ts">
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import { arbre, D } from '../lib/arbre.svelte';
  import { nomComplet, pourRecherche, vieCourte } from '../lib/genealogie';

  // Recherche d'une personne déjà présente dans l'arbre (pour la relier).
  let { exclure = [], choisie = $bindable(null) }: { exclure?: string[]; choisie?: string | null } = $props();

  let q = $state('');
  const resultats = $derived.by(() => {
    arbre.version;
    const t = pourRecherche(q.trim());
    if (!t) return [];
    return [...D.personnes.values()]
      .filter((p) => !exclure.includes(p.id) && pourRecherche(`${p.given_names} ${p.surname} ${p.married_name}`).includes(t))
      .slice(0, 8);
  });
</script>

<div class="field">
  <span>Rechercher dans l’arbre</span>
  <div class="cherche">
    <Icon name="search" size={16} />
    <input class="input" placeholder="Prénom ou nom" bind:value={q} />
  </div>
</div>
{#if q.trim() && !resultats.length}
  <p class="muted small">Personne ne correspond.</p>
{/if}
<ul class="resultats">
  {#each resultats as p (p.id)}
    <li>
      <button type="button" class:actif={choisie === p.id} aria-pressed={choisie === p.id} onclick={() => (choisie = p.id)}>
        <Avatar {p} taille={32} />
        <span><strong>{nomComplet(p)}</strong><small>{vieCourte(D, p.id)}</small></span>
        {#if choisie === p.id}<Icon name="check" size={18} />{/if}
      </button>
    </li>
  {/each}
</ul>

<style>
  .cherche { position: relative; }
  .cherche :global(svg) { position: absolute; left: 12px; top: 50%; translate: 0 -50%; color: var(--text-3); }
  .cherche .input { padding-left: 36px; }
  .resultats { list-style: none; margin: -8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .resultats button {
    display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px 10px; border-radius: var(--radius);
    border: 1px solid transparent; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer;
  }
  .resultats button:hover { background: var(--surface-2); }
  .resultats button.actif { border-color: var(--accent); background: var(--accent-soft); }
  .resultats span { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
  .resultats strong { font-weight: 600; font-size: 14px; }
  .resultats small { color: var(--text-3); font-size: 12.5px; }
</style>
