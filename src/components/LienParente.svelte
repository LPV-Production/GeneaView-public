<script lang="ts">
  import Modal from './Modal.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import RechercheCentre from './RechercheCentre.svelte';
  import { lienPersonne } from '../lib/store.svelte';
  import { arbre, D, ui } from '../lib/arbre.svelte';
  import { nomComplet, nomCourt, vieCourte } from '../lib/genealogie';
  import { lienDeParente } from '../lib/parente';

  // Calcul du lien de parenté entre deux personnes, avec le chemin dans l'arbre.
  let { a: depart }: { a: string } = $props();
  let a = $state(depart);
  let b = $state<string | null>(null);
  const fermer = () => (ui.parente = null);

  const r = $derived.by(() => {
    arbre.version;
    return b ? lienDeParente(D, a, b) : null;
  });
  const echanger = () => { if (b) [a, b] = [b, a]; };
  const SENS: Record<string, string> = { monte: 'up', descend: 'down', alliance: 'mariage' };
</script>

<Modal title="Lien de parenté" onclose={fermer} wide>
  <div class="choix">
    <div class="personne">
      <small>Entre</small>
      <span class="qui"><Avatar p={D.personnes.get(a)} taille={32} /><b>{nomComplet(D.personnes.get(a))}</b></span>
    </div>
    <button class="btn btn-ghost btn-icon" aria-label="Échanger les deux personnes" title="Échanger" disabled={!b} onclick={echanger}><Icon name="refresh" size={16} /></button>
    <div class="personne">
      <small>et</small>
      {#if b}
        <span class="qui"><Avatar p={D.personnes.get(b)} taille={32} /><b>{nomComplet(D.personnes.get(b))}</b>
          <button class="btn btn-ghost btn-sm btn-icon" aria-label="Choisir une autre personne" onclick={() => (b = null)}><Icon name="x" size={14} /></button></span>
      {:else}
        <RechercheCentre onchoisir={(id) => (b = id)} autofocus />
      {/if}
    </div>
  </div>

  {#if b && !r}
    <p class="aucun">Aucun lien de parenté trouvé entre ces deux personnes dans cet arbre.</p>
  {:else if r}
    <div class="resultat">
      <p class="phrase titre">{r.phrase}</p>
      <p class="muted small">
        {#if r.degre != null && r.degre > 0}Parent{r.degre > 1 ? 's' : ''} au {r.degre}{r.degre === 1 ? 'er' : 'e'} degré (droit civil).{/if}
        {#if r.ancetres.length}Ancêtre{r.ancetres.length > 1 ? 's' : ''} commun{r.ancetres.length > 1 ? 's' : ''} : {r.ancetres.map((x) => nomCourt(D.personnes.get(x))).join(' et ')}.{/if}
      </p>
      <ol class="chemin" aria-label="Chemin dans l’arbre">
        {#each r.chemin as e, i (i)}
          {#if i > 0}<li class="fleche" aria-hidden="true"><Icon name={SENS[e.sens]} size={14} /></li>{/if}
          <li>
            <a href={lienPersonne(arbre.treeId!, e.id)} onclick={fermer}>
              <Avatar p={D.personnes.get(e.id)} taille={28} />
              <span><b>{nomCourt(D.personnes.get(e.id))}</b><small>{vieCourte(D, e.id)}</small></span>
            </a>
          </li>
        {/each}
      </ol>
      <p class="muted small legende"><Icon name="up" size={12} /> parent · <Icon name="down" size={12} /> enfant · <Icon name="mariage" size={12} /> conjoint</p>
    </div>
  {/if}
</Modal>

<style>
  .choix { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: end; gap: 10px; }
  .personne { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .personne small { font-size: 12px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; }
  .qui { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 4px 6px 4px 4px; border-radius: 12px; background: var(--surface-2); }
  .qui b { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .resultat { display: flex; flex-direction: column; gap: 8px; padding: 18px; border-radius: var(--radius-lg); background: var(--accent-soft); }
  .phrase { font-size: 21px; line-height: 1.3; color: var(--text); }
  .aucun { padding: 16px; border-radius: var(--radius); background: var(--surface-2); color: var(--text-2); }
  .chemin { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .chemin a { display: flex; align-items: center; gap: 8px; padding: 4px 10px 4px 4px; border-radius: 99px; background: var(--surface); border: 1px solid var(--border); color: var(--text); text-decoration: none; }
  .chemin a:hover { border-color: var(--accent); text-decoration: none; }
  .chemin span { display: flex; flex-direction: column; line-height: 1.15; }
  .chemin b { font-size: 13px; font-weight: 600; }
  .chemin small { font-size: 11px; color: var(--text-3); }
  .fleche { color: var(--accent-text); display: flex; }
  .legende { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  @media (max-width: 560px) { .choix { grid-template-columns: 1fr; } .choix > .btn { justify-self: center; } }
</style>
