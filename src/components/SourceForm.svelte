<script lang="ts">
  import Modal from './Modal.svelte';
  import Icon from './Icon.svelte';
  import { FIABILITES, TYPES_SOURCE } from '../../commun/libelles';
  import { app, toast } from '../lib/store.svelte';
  import { D, modifierCitation, modifierSource, supprimerSource, ui } from '../lib/arbre.svelte';

  // Modifier une source (partagée par toutes les fiches qui la citent) et le détail de la citation ouverte.
  let { id, citationId }: { id: string; citationId?: string } = $props();
  const src = D.sources.get(id)!;
  const citation = citationId ? D.citations.get(citationId) : undefined;
  const nbCitations = (D.citationsSource.get(id) ?? []).length;
  const fermer = () => (ui.source = null);

  let s = $state({ title: src.title, type: src.type, url: src.url, reference: src.reference, reliability: src.reliability, notes: src.notes });
  let detail = $state(citation?.detail ?? '');

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    if (!s.title.trim()) return toast('Donnez un titre à la source', true);
    const ok = await modifierSource(id, { ...s, title: s.title.trim() });
    if (ok && citation && detail.trim() !== citation.detail) await modifierCitation(citation.id, detail.trim());
    if (ok) fermer();
  }
  async function supprimer() {
    const avert = nbCitations > 1 ? `\n\nElle est citée ${nbCitations} fois : toutes ces citations disparaîtront.` : '';
    if (confirm(`Supprimer définitivement la source « ${src.title} » ?${avert}`) && (await supprimerSource(id))) fermer();
  }
</script>

<Modal title="Modifier la source" subtitle={nbCitations > 1 ? `Citée ${nbCitations} fois : la modification vaut pour toutes les fiches.` : ''} onclose={fermer}>
  <form id="form-source" class="form-section" onsubmit={enregistrer}>
    <label class="field"><span>Titre</span><input class="input" bind:value={s.title} /></label>
    <div class="form-grid">
      <label class="field"><span>Type</span><select class="input" bind:value={s.type}>{#each Object.entries(TYPES_SOURCE) as [v, l]}<option value={v}>{l}</option>{/each}</select></label>
      <label class="field"><span>Fiabilité</span><select class="input" bind:value={s.reliability}>{#each Object.entries(FIABILITES) as [v, l]}<option value={v}>{l}</option>{/each}</select></label>
      <label class="field full"><span>Cote ou référence d’archive</span><input class="input" bind:value={s.reference} /></label>
      <label class="field full"><span>Adresse web</span><input class="input" type="url" placeholder="https://…" bind:value={s.url} /></label>
      <label class="field full"><span>Notes</span><textarea class="input" rows="3" bind:value={s.notes}></textarea></label>
      {#if citation}
        <label class="field full"><span>Détail pour cette fiche</span><input class="input" placeholder="Ex. vue 87" bind:value={detail} /></label>
      {/if}
    </div>
  </form>
  {#snippet footer()}
    <button class="btn btn-ghost btn-danger supprimer" type="button" onclick={supprimer} disabled={app.busy}><Icon name="trash" size={16} /> Supprimer</button>
    <button class="btn" type="button" onclick={fermer}>Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-source" disabled={app.busy}>Enregistrer</button>
  {/snippet}
</Modal>

<style>
  .supprimer { margin-right: auto; }
  @media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } }
</style>
