<script lang="ts">
  import Icon from './Icon.svelte';
  import { arbre, D } from '../lib/arbre.svelte';
  import { pourRecherche } from '../lib/genealogie';

  // Champ « lieu » avec propositions des lieux déjà saisis dans l'arbre (les plus utilisés d'abord).
  // Un lieu nouveau est créé automatiquement à l'enregistrement.
  let { value = $bindable(''), label = 'Lieu' }: { value?: string; label?: string } = $props();

  const uid = Math.random().toString(36).slice(2, 8);
  let ouvert = $state(false);
  let actif = $state(0);

  const propositions = $derived.by(() => {
    arbre.version;
    const q = pourRecherche(value.trim());
    if (!q) return [];
    return [...D.lieux.values()]
      .filter((l) => pourRecherche(l.name).includes(q) && pourRecherche(l.name) !== q)
      .map((l) => ({ l, n: D.usageLieux.get(l.id) ?? 0, debut: pourRecherche(l.name).startsWith(q) }))
      .sort((a, b) => Number(b.debut) - Number(a.debut) || b.n - a.n || a.l.name.localeCompare(b.l.name))
      .slice(0, 6);
  });

  function choisir(nom: string) {
    value = nom;
    ouvert = false;
  }

  function clavier(e: KeyboardEvent) {
    if (!ouvert || !propositions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); actif = (actif + 1) % propositions.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); actif = (actif - 1 + propositions.length) % propositions.length; }
    else if (e.key === 'Enter') { e.preventDefault(); choisir(propositions[actif].l.name); }
    else if (e.key === 'Escape') { e.stopPropagation(); ouvert = false; }
  }
</script>

<label class="field lieu">
  <span>{label}</span>
  <input
    class="input"
    placeholder="Commune, département, pays"
    autocomplete="off"
    role="combobox"
    aria-expanded={ouvert && propositions.length > 0}
    aria-controls="lieux-{uid}"
    bind:value
    oninput={() => { ouvert = true; actif = 0; }}
    onfocus={() => (ouvert = true)}
    onblur={() => setTimeout(() => (ouvert = false), 150)}
    onkeydown={clavier}
  />
  {#if ouvert && propositions.length}
    <ul class="propositions" id="lieux-{uid}" role="listbox">
      {#each propositions as { l, n }, i (l.id)}
        <li role="option" aria-selected={i === actif}>
          <button type="button" tabindex="-1" onmousedown={(e) => { e.preventDefault(); choisir(l.name); }}>
            <Icon name="lieu" size={15} /><span>{l.name}</span><small>{n} événement{n > 1 ? 's' : ''}</small>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</label>

<style>
  .lieu { position: relative; }
  .propositions {
    position: absolute; top: 100%; left: 0; right: 0; z-index: 5; margin: 6px 0 0; padding: 6px; list-style: none;
    border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-lg);
  }
  .propositions button {
    display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: 0; border-radius: 8px;
    background: none; font: inherit; font-size: 14px; color: var(--text); text-align: left; cursor: pointer;
  }
  li[aria-selected='true'] button, .propositions button:hover { background: var(--accent-soft); }
  .propositions span { flex: 1; min-width: 0; }
  .propositions small { color: var(--text-3); font-size: 12px; white-space: nowrap; }
</style>
