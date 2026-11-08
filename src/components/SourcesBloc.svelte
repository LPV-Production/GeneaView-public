<script lang="ts">
  import Icon from './Icon.svelte';
  import { FIABILITES, TYPES_SOURCE } from '../../commun/libelles';
  import { arbre, D, supprimerCitation, ui, type Cible } from '../lib/arbre.svelte';
  import { cleCible } from '../lib/donnees';

  // Les sources citées pour une personne, une union ou un événement.
  // Chaque citation renvoie vers une source (partagée par plusieurs fiches) + un détail (page, vue…).
  let { cible, peutModifier }: { cible: Cible; peutModifier: boolean } = $props();

  const citations = $derived.by(() => {
    arbre.version;
    return (D.citationsCible.get(cleCible(cible)) ?? [])
      .map((c) => ({ c, s: D.sources.get(c.source_id)! }))
      .filter((x) => x.s);
  });

  const COULEUR = { proof: 'badge-pos', clue: 'badge-warn', hypothesis: 'badge-neg' } as const;

  async function retirer(id: string, titre: string) {
    if (confirm(`Ne plus citer « ${titre} » ici ? La source reste disponible pour les autres fiches.`)) await supprimerCitation(id);
  }
</script>

{#if citations.length}
  <ul class="sources">
    {#each citations as { c, s } (c.id)}
      <li>
        <span class="t">
          {#if s.url}<a href={s.url} target="_blank" rel="noopener noreferrer"><b>{s.title}</b> <Icon name="link" size={12} /></a>{:else}<b>{s.title}</b>{/if}
          <small>{[TYPES_SOURCE[s.type], s.reference, c.detail].filter(Boolean).join(' · ')}</small>
        </span>
        <span class="badge {COULEUR[s.reliability]}"><span class="dot"></span>{FIABILITES[s.reliability]}</span>
        {#if peutModifier}
          <span class="actions">
            <button class="btn btn-ghost btn-sm btn-icon" aria-label="Modifier la source « {s.title} »" title="Modifier la source" onclick={() => (ui.source = { id: s.id, citationId: c.id })}><Icon name="edit" size={14} /></button>
            <button class="btn btn-ghost btn-sm btn-icon" aria-label="Ne plus citer « {s.title} »" title="Ne plus citer ici" onclick={() => retirer(c.id, s.title)}><Icon name="x" size={14} /></button>
          </span>
        {/if}
      </li>
    {/each}
  </ul>
{:else}
  <p class="muted small">Aucune source. Citez un acte, un registre, un recensement, un témoignage…</p>
{/if}
{#if peutModifier}
  <button class="btn btn-sm citer" onclick={() => (ui.citation = { cible })}><Icon name="plus" size={15} /> Citer une source</button>
{/if}

<style>
  .sources { list-style: none; margin: 0 0 10px; padding: 0; }
  .sources li { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border); }
  .sources li:first-child { border-top: 0; padding-top: 0; }
  .t { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.35; font-size: 14px; }
  .t a { color: var(--text); }
  .t a:hover { color: var(--accent-text); }
  .t b { font-weight: 600; }
  .t small { color: var(--text-3); font-size: 12.5px; }
  .actions { display: flex; margin: -4px -6px 0 0; }
  .citer { margin-top: 4px; }
</style>
