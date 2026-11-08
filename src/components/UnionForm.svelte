<script lang="ts">
  import Modal from './Modal.svelte';
  import { FINS_UNION, TYPES_UNION, type FinUnion, type TypeUnion } from '../../commun/libelles';
  import { app } from '../lib/store.svelte';
  import { D, modifierUnion, ui } from '../lib/arbre.svelte';

  // Modifier une union : type (mariage, liaison…), comment elle a pris fin, visibilité et notes
  let { id }: { id: string } = $props();
  const u = D.unions.get(id);
  const fermer = () => (ui.union = null);

  let union_type = $state<TypeUnion>(u?.union_type ?? 'unknown');
  let notes = $state(u?.notes ?? '');
  let end_type = $state<FinUnion>(u?.end_type ?? '');
  let hidden = $state(!!u?.hidden);

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    if (await modifierUnion(id, { union_type, end_type, hidden, notes })) fermer();
  }
</script>

<Modal title="Modifier l’union" onclose={fermer}>
  <form id="form-union" class="form-section" onsubmit={enregistrer}>
    <label class="field">
      <span>Type d’union</span>
      <select class="input" bind:value={union_type}>
        {#each Object.entries(TYPES_UNION) as [v, label]}<option value={v}>{v === 'unknown' ? 'Inconnu' : label}</option>{/each}
      </select>
    </label>
    <label class="field">
      <span>Fin de l’union</span>
      <select class="input" bind:value={end_type}>
        {#each Object.entries(FINS_UNION) as [v, label]}<option value={v}>{label}</option>{/each}
      </select>
      <span class="hint">Si l’un des deux est décédé, laissez « En cours » : le veuvage est indiqué tout seul. La date d’un divorce s’ajoute comme événement de l’union.</span>
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={hidden} />
      <span><b>Cacher cette union aux lecteurs</b><small>Ex. une liaison secrète : les lecteurs de l’arbre ne la voient pas, ni le lien de ses enfants avec ce couple. Vous et les éditeurs la voyez toujours.</small></span>
    </label>
    <label class="field"><span>Notes</span><textarea class="input" rows="4" bind:value={notes}></textarea></label>
  </form>
  {#snippet footer()}
    <button class="btn" type="button" onclick={fermer}>Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-union" disabled={app.busy}>Enregistrer</button>
  {/snippet}
</Modal>

<style>
  .check { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; }
  .check input { width: 18px; height: 18px; margin-top: 2px; accent-color: var(--accent); flex: none; }
  .check span { display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
  .check small { color: var(--text-3); font-size: 12.5px; line-height: 1.4; }
</style>
