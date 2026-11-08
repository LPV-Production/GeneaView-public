<script lang="ts">
  import Modal from './Modal.svelte';
  import ChoixPersonne from './ChoixPersonne.svelte';
  import { app, toast } from '../lib/store.svelte';
  import { changerParents, D, ui } from '../lib/arbre.svelte';
  import { accord, nomCourt, parents, unionsDe } from '../lib/genealogie';

  // Changer les parents d'un enfant déjà saisi : ex. « ce n'est pas le fils de Marie,
  // mais de Jeanne, avec le même père ». On garde un des parents et on choisit l'autre.
  let { childId }: { childId: string } = $props();
  const fermer = () => (ui.parents = null);

  const enfant = D.personnes.get(childId);
  const actuels = parents(D, childId);
  const depuis = actuels.union?.id;

  // Les choix possibles : pour chaque parent actuel, ses autres unions, « seul(e) », ou une autre personne
  type Choix = { cle: string; texte: string; vers?: { family_id: string } | { parent_id: string; other_id: string | null }; autre?: string };
  const choix: Choix[] = actuels.liste.flatMap((p) => {
    const unions = unionsDe(D, p.id).filter((u) => u.union.id !== depuis);
    return [
      ...unions.map((u) => ({
        cle: u.union.id,
        texte: u.conjoint ? `${nomCourt(p)} et ${nomCourt(u.conjoint)}` : `${nomCourt(p)} seul${p.sex === 'F' ? 'e' : ''} (autre parent inconnu)`,
        vers: { family_id: u.union.id },
      })),
      ...(actuels.liste.length === 2 && !unions.some((u) => !u.conjoint)
        ? [{ cle: `seul-${p.id}`, texte: `${nomCourt(p)} seul${p.sex === 'F' ? 'e' : ''} (autre parent inconnu)`, vers: { parent_id: p.id, other_id: null } }]
        : []),
      { cle: `autre-${p.id}`, texte: `${nomCourt(p)} et une autre personne de l’arbre…`, autre: p.id },
    ];
  });

  let choisi = $state(choix[0]?.cle ?? '');
  let autreParent = $state<string | null>(null);
  const courant = $derived(choix.find((c) => c.cle === choisi));

  async function valider(e: SubmitEvent) {
    e.preventDefault();
    if (!depuis || !courant) return;
    const vers = courant.autre ? (autreParent ? { parent_id: courant.autre, other_id: autreParent } : null) : courant.vers!;
    if (!vers) return toast('Cherchez l’autre parent dans l’arbre', true);
    if (await changerParents(depuis, childId, vers)) fermer();
  }
</script>

<Modal title="Changer les parents de {nomCourt(enfant)}" onclose={fermer}>
  <form id="form-parents" class="form-section" onsubmit={valider}>
    <p class="muted small">
      Aujourd’hui : {accord(enfant, 'enfant', 'enfant')} de {actuels.liste.map(nomCourt).join(' et ') || 'parents inconnus'}.
      Choisissez ses vrais parents. Le lien (biologique, adoptif…) est conservé.
    </p>
    {#if !choix.length}
      <p class="muted small">Ajoutez d’abord un parent depuis la fiche.</p>
    {:else}
      <div class="choix" role="radiogroup" aria-label="Nouveaux parents">
        {#each choix as c (c.cle)}
          <label class="option" class:actif={choisi === c.cle}>
            <input type="radio" name="parents" value={c.cle} bind:group={choisi} />
            <span>{c.texte}</span>
          </label>
        {/each}
      </div>
      {#if courant?.autre}
        <ChoixPersonne exclure={[childId, courant.autre]} bind:choisie={autreParent} />
      {/if}
    {/if}
  </form>
  {#snippet footer()}
    <button class="btn" type="button" onclick={fermer}>Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-parents" disabled={app.busy || !choix.length}>Enregistrer</button>
  {/snippet}
</Modal>

<style>
  .choix { display: flex; flex-direction: column; gap: 6px; }
  .option { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; font-size: 14px; }
  .option.actif { border-color: var(--accent); background: var(--accent-soft); }
  .option input { width: 18px; height: 18px; accent-color: var(--accent); flex: none; margin: 0; }
</style>
