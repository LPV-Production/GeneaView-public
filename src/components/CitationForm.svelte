<script lang="ts">
  import Modal from './Modal.svelte';
  import Icon from './Icon.svelte';
  import { FIABILITES, TYPES_SOURCE } from '../../commun/libelles';
  import { app, toast } from '../lib/store.svelte';
  import { arbre, citer, creerSource, D, ui, type Cible, type Source } from '../lib/arbre.svelte';
  import { pourRecherche } from '../lib/genealogie';

  // Citer une source : en choisir une déjà saisie, ou en créer une nouvelle.
  let { cible }: { cible: Cible } = $props();
  const fermer = () => (ui.citation = null);

  const existantes = $derived.by(() => { arbre.version; return [...D.sources.values()]; });
  let mode = $state<'nouvelle' | 'existante'>(D.sources.size ? 'existante' : 'nouvelle');
  let q = $state('');
  let choisie = $state<string | null>(null);
  let detail = $state('');
  let s = $state<Omit<Source, 'id'>>({ title: '', type: 'civil', url: '', reference: '', reliability: 'proof', notes: '' });

  const trouvees = $derived.by(() => {
    const t = pourRecherche(q.trim());
    return existantes
      .filter((x) => !t || pourRecherche(`${x.title} ${x.reference}`).includes(t))
      .sort((a, b) => a.title.localeCompare(b.title, 'fr'))
      .slice(0, 30);
  });

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    let sourceId = choisie;
    if (mode === 'nouvelle') {
      if (!s.title.trim()) return toast('Donnez un titre à la source', true);
      sourceId = (await creerSource({ ...s, title: s.title.trim() })) ?? null;
      if (!sourceId) return;
    }
    if (!sourceId) return toast('Choisissez une source dans la liste', true);
    if (await citer(sourceId, cible, detail.trim())) fermer();
  }
</script>

<Modal title="Citer une source" onclose={fermer}>
  <form id="form-citation" class="form-section" onsubmit={enregistrer}>
    <div class="segmented large" role="group" aria-label="Source">
      <button type="button" class:active={mode === 'existante'} disabled={!existantes.length} onclick={() => (mode = 'existante')}>Source déjà saisie</button>
      <button type="button" class:active={mode === 'nouvelle'} onclick={() => (mode = 'nouvelle')}>Nouvelle source</button>
    </div>

    {#if mode === 'existante'}
      <label class="field">
        <span>Rechercher</span>
        <input class="input" placeholder="Titre ou cote" bind:value={q} />
      </label>
      <ul class="choix">
        {#each trouvees as x (x.id)}
          <li>
            <button type="button" class:actif={choisie === x.id} aria-pressed={choisie === x.id} onclick={() => (choisie = x.id)}>
              <span><b>{x.title}</b><small>{[TYPES_SOURCE[x.type], x.reference, FIABILITES[x.reliability]].filter(Boolean).join(' · ')}</small></span>
              {#if choisie === x.id}<Icon name="check" size={18} />{/if}
            </button>
          </li>
        {:else}
          <li class="muted small">Aucune source ne correspond.</li>
        {/each}
      </ul>
    {:else}
      <label class="field"><span>Titre</span><input class="input" placeholder="Ex. Acte de mariage Martin × Lefèvre" bind:value={s.title} /></label>
      <div class="form-grid">
        <label class="field"><span>Type</span>
          <select class="input" bind:value={s.type}>{#each Object.entries(TYPES_SOURCE) as [v, l]}<option value={v}>{l}</option>{/each}</select>
        </label>
        <label class="field"><span>Fiabilité</span>
          <select class="input" bind:value={s.reliability}>{#each Object.entries(FIABILITES) as [v, l]}<option value={v}>{l}</option>{/each}</select>
        </label>
        <label class="field full"><span>Cote ou référence d’archive</span><input class="input" placeholder="Ex. AD Cantal · 4 E 15/32" bind:value={s.reference} /></label>
        <label class="field full"><span>Adresse web <span class="muted">(facultatif)</span></span><input class="input" type="url" placeholder="https://…" bind:value={s.url} /></label>
      </div>
      <p class="hint muted small"><b>Preuve</b> : un acte qui l’établit. <b>Indice</b> : un élément concordant. <b>Hypothèse</b> : à confirmer.</p>
    {/if}

    <label class="field">
      <span>Détail pour cette fiche <span class="muted">(facultatif)</span></span>
      <input class="input" placeholder="Ex. vue 87, page 12, acte n° 34" bind:value={detail} />
    </label>
  </form>
  {#snippet footer()}
    <button class="btn" type="button" onclick={fermer}>Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-citation" disabled={app.busy}>Citer</button>
  {/snippet}
</Modal>

<style>
  .segmented.large { display: flex; width: 100%; }
  .segmented.large button { flex: 1; }
  .choix { list-style: none; margin: -6px 0 0; padding: 0; max-height: 260px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
  .choix button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border-radius: 10px; border: 1px solid transparent; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer; }
  .choix button:hover { background: var(--surface-2); }
  .choix button.actif { border-color: var(--accent); background: var(--accent-soft); }
  .choix span { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
  .choix b { font-weight: 600; font-size: 14px; }
  .choix small { color: var(--text-3); font-size: 12.5px; }
  @media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } }
</style>
