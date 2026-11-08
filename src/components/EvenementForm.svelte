<script lang="ts">
  import Modal from './Modal.svelte';
  import Icon from './Icon.svelte';
  import DateSaisie from './DateSaisie.svelte';
  import LieuSaisie from './LieuSaisie.svelte';
  import Galerie from './Galerie.svelte';
  import SourcesBloc from './SourcesBloc.svelte';
  import { analyserDate, type Qualif } from '../../commun/dates';
  import { EVENEMENTS_PERSONNE, EVENEMENTS_UNION, TYPES_EVENEMENT, type TypeEvenement } from '../../commun/libelles';
  import { app, toast } from '../lib/store.svelte';
  import { creerEvenement, D, modifierEvenement, supprimerEvenement, ui } from '../lib/arbre.svelte';
  import { nomCourt, nomLieu } from '../lib/genealogie';

  // Ajout ou modification d'un événement d'une personne ou d'une union
  let { id, person_id, family_id }: { id?: string; person_id?: string; family_id?: string } = $props();

  const existant = id ? D.evenements.get(id) : undefined;
  const pourUnion = !!(existant?.family_id ?? family_id);
  const types = pourUnion ? EVENEMENTS_UNION : EVENEMENTS_PERSONNE;
  const fermer = () => (ui.evenement = null);

  let f = $state({
    type: (existant?.type ?? (pourUnion ? 'marriage' : 'residence')) as TypeEvenement,
    qual: (existant?.date_qual ?? 'exact') as Qualif,
    texte: existant?.date_text ?? '',
    lieu: existant ? nomLieu(D, existant.place_id) : '',
    description: existant?.description ?? '',
  });

  const sujet = $derived.by(() => {
    const pid = existant?.person_id ?? person_id;
    if (pid) return nomCourt(D.personnes.get(pid));
    const u = D.unions.get((existant?.family_id ?? family_id)!);
    return u ? [u.partner1_id, u.partner2_id].map((x) => (x ? nomCourt(D.personnes.get(x)) : '?')).join(' et ') : '';
  });

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    try { analyserDate(f.qual, f.texte); } catch (err) { return toast((err as Error).message, true); }
    const data = { type: f.type, date_qual: f.qual, date_text: f.texte, place: f.lieu, description: f.description };
    const ok = existant ? await modifierEvenement(existant.id, data) : await creerEvenement({ person_id, family_id }, data);
    if (ok) fermer();
  }

  async function supprimer() {
    if (existant && confirm(`Supprimer l’événement « ${TYPES_EVENEMENT[existant.type]} » ?`) && (await supprimerEvenement(existant.id))) fermer();
  }
</script>

<Modal title={existant ? 'Modifier l’événement' : 'Nouvel événement'} subtitle={sujet} onclose={fermer}>
  <form id="form-evenement" class="form-section" onsubmit={enregistrer}>
    <label class="field">
      <span>Type</span>
      <select class="input" bind:value={f.type}>
        {#each types as t}<option value={t}>{TYPES_EVENEMENT[t]}</option>{/each}
      </select>
    </label>
    <DateSaisie bind:qual={f.qual} bind:texte={f.texte} />
    <LieuSaisie bind:value={f.lieu} />
    <label class="field">
      <span>Description <span class="muted">(facultatif)</span></span>
      <textarea class="input" rows="2" placeholder={f.type === 'military' ? 'Régiment, campagnes, blessures…' : f.type === 'residence' ? 'Adresse…' : ''} bind:value={f.description}></textarea>
    </label>
  </form>
  {#if existant}
    <section class="annexes">
      <h3>Sources de cet événement</h3>
      <SourcesBloc cible={{ event_id: existant.id }} peutModifier={true} />
    </section>
    <section class="annexes">
      <h3>Documents de cet événement</h3>
      <Galerie cible={{ event_id: existant.id }} peutModifier={true} compact />
    </section>
  {:else}
    <p class="muted small">Les sources et documents de l’événement pourront être ajoutés une fois l’événement enregistré.</p>
  {/if}
  {#snippet footer()}
    {#if existant}
      <button class="btn btn-ghost btn-danger supprimer" type="button" onclick={supprimer} disabled={app.busy}><Icon name="trash" size={16} /> Supprimer</button>
    {/if}
    <button class="btn" type="button" onclick={fermer}>Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-evenement" disabled={app.busy}>Enregistrer</button>
  {/snippet}
</Modal>

<style>
  .supprimer { margin-right: auto; }
  .annexes { display: flex; flex-direction: column; gap: 10px; padding-top: 14px; border-top: 1px solid var(--border); }
  .annexes h3 { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
</style>
