<script lang="ts">
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import { analyse, arbre, D, ui, type Personne } from '../lib/arbre.svelte';
  import type { Union } from '../lib/donnees';

  /** « Unie à », « Liaison avec », « Divorcée de », « Fiancé à »… */
  function lienAvec(p: Personne, u: Union) {
    if (u.union_type === 'liaison') return 'Liaison avec';
    const fin = finUnion(D, u).type;
    if (fin === 'divorce') return `${accord(p, 'Divorcé', 'Divorcée')} de`;
    if (fin === 'separation') return `${accord(p, 'Séparé', 'Séparée')} de`;
    if (u.union_type === 'engagement') return `${accord(p, 'Fiancé', 'Fiancée')} à`;
    return `${accord(p, 'Uni', 'Unie')} à`;
  }
  import { accord, datePhrase, finUnion, naissance, nomCourt, nomLieu, parents, unionsDe, vieCourte } from '../lib/genealogie';

  // ============================================================
  // Vue « famille proche », pensée pour le téléphone : pas de zoom,
  // de gros boutons. Grands-parents, parents, la personne au centre
  // (avec son ou ses conjoints), enfants et petits-enfants.
  // Toucher une personne la met au centre.
  // ============================================================
  let { centreId, peutModifier, onrecentrer, onouvrir }: { centreId: string; peutModifier: boolean; onrecentrer: (id: string) => void; onouvrir: (id: string) => void } = $props();

  const v = $derived.by(() => {
    arbre.version;
    const p = D.personnes.get(centreId);
    if (!p) return null;
    const par = parents(D, centreId).liste;
    const grands = par.flatMap((x) => parents(D, x.id).liste);
    const unions = unionsDe(D, centreId);
    const enfants = unions.flatMap((u) => u.enfants.map((e) => e.p));
    const petits = enfants.flatMap((e) => unionsDe(D, e.id).flatMap((u) => u.enfants.map((x) => x.p)));
    const n = naissance(D, centreId);
    return { p, par, grands, unions, enfants, petits, n, sosa: analyse().sosa.get(centreId)?.[0] };
  });

  const ajouter = (type: 'parent' | 'conjoint' | 'enfant') => (ui.personne = { relation: { type, of: centreId } });
</script>

{#snippet puce(p: Personne)}
  <button class="puce" onclick={() => onrecentrer(p.id)}>
    <Avatar {p} taille={34} />
    <span class="t"><b>{nomCourt(p)}</b><small>{vieCourte(D, p.id) || ' '}</small></span>
  </button>
{/snippet}
{#snippet mini(p: Personne)}
  <button class="mini" onclick={() => onrecentrer(p.id)}>
    <Avatar {p} taille={26} /><b>{p.given_names.split(' ')[0] || nomCourt(p)}</b>
  </button>
{/snippet}

{#if v}
  <div class="proche">
    {#if v.grands.length}
      <section class="niveau"><h3>Grands-parents</h3><div class="ligne">{#each v.grands as p (p.id)}{@render mini(p)}{/each}</div></section>
      <div class="liaison"></div>
    {/if}

    <section class="niveau">
      <h3>Parents</h3>
      <div class="ligne">
        {#each v.par as p (p.id)}{@render puce(p)}{/each}
        {#if v.par.length < 2 && peutModifier}
          <button class="puce vide" onclick={() => ajouter('parent')}><Icon name="plus" size={16} /> {v.par.length ? 'Autre parent' : 'Ajouter un parent'}</button>
        {/if}
        {#if !v.par.length && !peutModifier}<p class="muted small">Inconnus</p>{/if}
      </div>
    </section>
    <div class="liaison"></div>

    <section class="centre">
      <Avatar p={v.p} taille={72} />
      {#if v.sosa}<span class="badge badge-accent">Sosa {v.sosa}</span>{/if}
      <h2 class="titre">{nomCourt(v.p)}</h2>
      <p class="muted small">
        {[v.n?.date_text ? `${accord(v.p, 'Né', 'Née')} ${datePhrase(v.n)}` : '', v.n ? nomLieu(D, v.n.place_id) : '', v.p.occupations].filter(Boolean).join(' · ') || vieCourte(D, v.p.id)}
      </p>
      {#each v.unions.filter((u) => u.conjoint) as u (u.union.id)}
        <button class="conjoint" onclick={() => onrecentrer(u.conjoint!.id)}>
          <Avatar p={u.conjoint} taille={28} /> {lienAvec(v.p, u.union)} <b>{nomCourt(u.conjoint)}</b>
        </button>
      {/each}
      <div class="actions">
        <button class="btn btn-primary" onclick={() => onouvrir(centreId)}>Voir la fiche</button>
        {#if peutModifier}<button class="btn" onclick={() => ajouter('conjoint')}><Icon name="plus" size={16} /> Conjoint</button>{/if}
      </div>
    </section>

    <div class="liaison"></div>
    <section class="niveau">
      <h3>Enfants</h3>
      <div class="ligne">
        {#each v.enfants as p (p.id)}{@render puce(p)}{/each}
        {#if peutModifier}<button class="puce vide" onclick={() => ajouter('enfant')}><Icon name="plus" size={16} /> Enfant</button>{/if}
        {#if !v.enfants.length && !peutModifier}<p class="muted small">Aucun</p>{/if}
      </div>
    </section>

    {#if v.petits.length}
      <div class="liaison"></div>
      <section class="niveau"><h3>Petits-enfants</h3><div class="ligne">{#each v.petits as p (p.id)}{@render mini(p)}{/each}</div></section>
    {/if}
    <p class="astuce muted small">Touchez une personne pour la mettre au centre.</p>
  </div>
{/if}

<style>
  .proche { display: flex; flex-direction: column; align-items: center; padding: 72px 16px 24px; max-width: 560px; margin: 0 auto; }
  .niveau { width: 100%; text-align: center; }
  h3 { margin-bottom: 8px; font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); }
  .ligne { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
  .puce {
    flex: 1 1 150px; max-width: 220px; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 8px 10px; min-height: 52px;
    border-radius: 14px; border: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow-sm);
    font: inherit; color: var(--text); text-align: left; cursor: pointer;
  }
  .puce .t { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
  .puce b { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .puce small { font-size: 12px; color: var(--text-3); }
  .puce.vide { justify-content: center; border-style: dashed; box-shadow: none; background: transparent; color: var(--accent-text); font-weight: 600; font-size: 13.5px; }
  .mini { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 3px; border-radius: 99px; border: 1px solid var(--border); background: var(--surface); font: inherit; color: var(--text); cursor: pointer; }
  .mini b { font-size: 12.5px; font-weight: 600; }
  .liaison { width: 2px; height: 18px; margin: 8px 0; background: var(--border-strong); }
  .centre {
    width: 100%; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 16px; text-align: center;
    border-radius: 20px; border: 2px solid var(--accent); background: var(--surface); box-shadow: 0 0 0 5px var(--accent-soft), var(--shadow-lg);
  }
  .centre h2 { font-size: 23px; margin-top: 4px; }
  .conjoint { display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px 4px 4px; border-radius: 99px; border: 0; background: var(--femme-soft); font: inherit; font-size: 13px; color: var(--text); cursor: pointer; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; margin-top: 8px; }
  .astuce { margin-top: 18px; text-align: center; }
</style>
