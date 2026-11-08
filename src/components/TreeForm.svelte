<script lang="ts">
  import Modal from './Modal.svelte';
  import { app, closeModal, saveTree } from '../lib/store.svelte';

  // Création (sans id) ou modification (avec id) d'un arbre
  let { id }: { id?: string } = $props();
  const existant = app.arbres.find((a) => a.id === id);

  let name = $state(existant?.name ?? '');
  let description = $state(existant?.description ?? '');

  function submit(e: SubmitEvent) {
    e.preventDefault();
    saveTree({ name: name.trim(), description: description.trim() }, id);
  }
</script>

<Modal title={existant ? 'Modifier l’arbre' : 'Nouvel arbre'} subtitle={existant ? '' : 'Vous en serez le propriétaire.'} onclose={closeModal}>
  <form id="form-arbre" class="form-section" onsubmit={submit}>
    <label class="field">
      <span>Nom de l’arbre</span>
      <input class="input" required maxlength="100" placeholder="Ex. Famille Martin – Dubois" bind:value={name} />
    </label>
    <label class="field">
      <span>Description <span class="muted">(facultatif)</span></span>
      <textarea class="input" maxlength="2000" placeholder="Branche, région, objectif de vos recherches…" bind:value={description}></textarea>
    </label>
  </form>
  {#snippet footer()}
    <button class="btn" type="button" onclick={closeModal}>Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-arbre" disabled={app.busy || !name.trim()}>{existant ? 'Enregistrer' : 'Créer l’arbre'}</button>
  {/snippet}
</Modal>
