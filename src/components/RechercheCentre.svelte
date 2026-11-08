<script lang="ts">
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import { arbre, D } from '../lib/arbre.svelte';
  import { nomComplet, pourRecherche, vieCourte } from '../lib/genealogie';

  // Champ « Centrer sur… » : retrouve une personne par son nom et la met au centre de l'arbre.
  let { onchoisir, autofocus = false }: { onchoisir: (id: string) => void; autofocus?: boolean } = $props();

  let q = $state('');
  let ouvert = $state(false);
  let actif = $state(0);
  let champ: HTMLInputElement | undefined = $state();

  $effect(() => { if (autofocus) champ?.focus(); });

  const resultats = $derived.by(() => {
    arbre.version;
    const mots = pourRecherche(q.trim()).split(/\s+/).filter(Boolean);
    if (!mots.length) return [];
    return [...D.personnes.values()]
      .filter((p) => { const t = pourRecherche(`${p.given_names} ${p.surname} ${p.married_name} ${p.nickname}`); return mots.every((m) => t.includes(m)); })
      .slice(0, 8);
  });

  function choisir(id: string) {
    q = '';
    ouvert = false;
    onchoisir(id);
  }
  function clavier(e: KeyboardEvent) {
    if (!resultats.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); actif = (actif + 1) % resultats.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); actif = (actif - 1 + resultats.length) % resultats.length; }
    else if (e.key === 'Enter') { e.preventDefault(); choisir(resultats[actif].id); }
    else if (e.key === 'Escape') { q = ''; }
  }
</script>

<div class="recherche">
  <Icon name="search" size={16} />
  <input
    class="input" type="search" placeholder="Centrer sur…" aria-label="Centrer l’arbre sur une personne" autocomplete="off"
    role="combobox" aria-expanded={ouvert && resultats.length > 0} aria-controls="resultats-centre"
    bind:this={champ} bind:value={q}
    oninput={() => { ouvert = true; actif = 0; }} onfocus={() => (ouvert = true)} onblur={() => setTimeout(() => (ouvert = false), 150)} onkeydown={clavier}
  />
  {#if ouvert && resultats.length}
    <ul id="resultats-centre" role="listbox">
      {#each resultats as p, i (p.id)}
        <li role="option" aria-selected={i === actif}>
          <button type="button" tabindex="-1" onmousedown={(e) => { e.preventDefault(); choisir(p.id); }}>
            <Avatar {p} taille={28} /><span><b>{nomComplet(p)}</b><small>{vieCourte(D, p.id)}</small></span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .recherche { position: relative; }
  .recherche > :global(svg) { position: absolute; left: 11px; top: 50%; translate: 0 -50%; color: var(--text-3); pointer-events: none; }
  .input { min-height: 36px; width: 230px; padding-left: 34px; border-radius: 9px; background: var(--surface-2); border-color: transparent; }
  ul { position: absolute; top: calc(100% + 6px); left: 0; width: 300px; z-index: 10; margin: 0; padding: 6px; list-style: none; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow-lg); }
  ul button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 8px; border: 0; border-radius: 8px; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer; }
  li[aria-selected='true'] button, ul button:hover { background: var(--accent-soft); }
  ul span { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
  ul b { font-size: 13.5px; font-weight: 600; }
  ul small { font-size: 12px; color: var(--text-3); }
  @media (max-width: 640px) { .input { width: 100%; } ul { width: 100%; } }
</style>
