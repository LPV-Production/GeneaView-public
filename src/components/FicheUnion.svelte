<script lang="ts">
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import Menu from './Menu.svelte';
  import Galerie from './Galerie.svelte';
  import SourcesBloc from './SourcesBloc.svelte';
  import { afficherDate } from '../../commun/dates';
  import { FINS_UNION, LIENS_ENFANT, TYPES_EVENEMENT, type LienEnfant } from '../../commun/libelles';
  import { arbreCourant, go, lienArbre, lienPersonne } from '../lib/store.svelte';
  import { arbre, changerLienEnfant, D, retirerEnfant, supprimerUnion, ui } from '../lib/arbre.svelte';
  import { enfantsDe, finUnion, iconeEvenement, libelleUnion, nomComplet, nomCourt, nomLieu, vieCourte } from '../lib/genealogie';

  // Fiche d'une union : les deux conjoints, mariage / divorce, enfants, notes,
  // documents (livret de famille, photo de mariage…) et sources.
  let { id }: { id: string } = $props();

  const treeId = $derived(arbre.treeId!);
  const peutModifier = $derived(arbreCourant()?.role !== 'viewer');

  const v = $derived.by(() => {
    arbre.version;
    const u = D.unions.get(id);
    if (!u) return null;
    const conjoints = [u.partner1_id, u.partner2_id].map((x) => (x ? D.personnes.get(x) : undefined));
    const evenements = (D.evUnion.get(id) ?? []).slice().sort((a, b) => (a.date_sort ?? Infinity) - (b.date_sort ?? Infinity));
    return { u, conjoints, evenements, enfants: enfantsDe(D, id) };
  });

  const titre = $derived(v ? v.conjoints.map((c) => (c ? nomCourt(c) : 'Inconnu')).join(' & ') : '');
  const retour = $derived(v?.conjoints.find(Boolean));
  // « Mariage · Divorce · cachée aux lecteurs · 2 enfants »
  const resume = $derived.by(() => {
    if (!v) return '';
    const fin = finUnion(D, v.u);
    const texteFin = fin.type === 'veuvage' ? `fin par le décès de ${nomCourt(fin.decede)}` : fin.type ? FINS_UNION[fin.type] : '';
    const enfants = v.enfants.length ? `${v.enfants.length} enfant${v.enfants.length > 1 ? 's' : ''}` : '';
    return [libelleUnion(v.u), texteFin, v.u.hidden ? 'cachée aux lecteurs' : '', enfants].filter(Boolean).join(' · ');
  });

  async function supprimer() {
    if (!confirm('Supprimer cette union ?\n\nLes deux personnes et leurs enfants restent dans l’arbre, mais ne seront plus reliés par cette union. Le mariage et les autres événements de l’union seront effacés.')) return;
    const vers = retour ? lienPersonne(treeId, retour.id) : lienArbre(treeId);
    if (await supprimerUnion(id)) go(vers);
  }

  async function retirer(childId: string) {
    const c = D.personnes.get(childId);
    if (confirm(`Retirer ${nomCourt(c)} des enfants de cette union ? La personne reste dans l’arbre.`)) await retirerEnfant(id, childId);
  }
</script>

{#if !v}
  <div class="card empty-state">
    <strong>Union introuvable</strong>
    <p class="muted">Elle a peut-être été supprimée.</p>
    <a class="btn" href={lienArbre(treeId)}>Retour à l’arbre</a>
  </div>
{:else}
  <nav class="fil">
    <a href={retour ? lienPersonne(treeId, retour.id) : lienArbre(treeId)}><Icon name="back" size={16} /> {retour ? nomCourt(retour) : arbreCourant()?.name}</a>
  </nav>

  <header class="card card-pad entete">
    <div class="couple">
      {#each v.conjoints as c, i}
        {#if i === 1}<span class="anneaux" aria-hidden="true"><Icon name="mariage" size={22} /></span>{/if}
        {#if c}
          <a class="conjoint" href={lienPersonne(treeId, c.id)}>
            <Avatar p={c} taille={56} />
            <b>{nomComplet(c)}</b>
            <small>{vieCourte(D, c.id)}</small>
          </a>
        {:else}
          <div class="conjoint inconnu"><span class="vide">?</span><b>Inconnu</b><small>Autre parent non renseigné</small></div>
        {/if}
      {/each}
    </div>
    <div class="infos">
      <div>
        <h1 class="titre">{titre}</h1>
        <p class="muted">{resume}</p>
      </div>
      {#if peutModifier}
        <div class="actions">
          <button class="btn" onclick={() => (ui.union = { id })}><Icon name="edit" size={16} /> Modifier</button>
          <Menu actions={[{ label: 'Supprimer cette union', icon: 'trash', danger: true, onclick: supprimer }]} />
        </div>
      {/if}
    </div>
  </header>

  <div class="grille">
    <section class="card card-pad">
      <div class="card-head">
        <h2 class="card-title">Événements</h2>
        {#if peutModifier}<button class="btn btn-sm" onclick={() => (ui.evenement = { family_id: id })}><Icon name="plus" size={15} /> Événement</button>{/if}
      </div>
      {#if !v.evenements.length}
        <p class="muted small">Ajoutez la date et le lieu du mariage, un éventuel divorce, une résidence commune…</p>
      {:else}
        <ul class="evs">
          {#each v.evenements as e (e.id)}
            <li>
              <span class="pastille"><Icon name={iconeEvenement(e.type)} size={17} /></span>
              <span class="quoi">
                {#if peutModifier}<button class="titre-ev" onclick={() => (ui.evenement = { id: e.id })}>{TYPES_EVENEMENT[e.type]}</button>{:else}<b>{TYPES_EVENEMENT[e.type]}</b>{/if}
                <small>{[afficherDate(e) || 'date inconnue', nomLieu(D, e.place_id)].filter(Boolean).join(' · ')}</small>
                {#if e.description}<p>{e.description}</p>{/if}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
      {#if v.u.notes}
        <h3 class="sous">Notes</h3>
        <p class="notes">{v.u.notes}</p>
      {/if}
    </section>

    <section class="card card-pad">
      <div class="card-head">
        <h2 class="card-title">Enfants</h2>
        {#if peutModifier && v.conjoints.some(Boolean)}
          <button class="btn btn-sm" onclick={() => (ui.personne = { relation: { type: 'enfant', of: (v.u.partner1_id ?? v.u.partner2_id)!, family_id: id } })}>
            <Icon name="plus" size={15} /> Enfant
          </button>
        {/if}
      </div>
      {#if !v.enfants.length}
        <p class="muted small">Aucun enfant enregistré pour cette union.</p>
      {:else}
        <ul class="enfants">
          {#each v.enfants as e (e.p.id)}
            <li>
              <a href={lienPersonne(treeId, e.p.id)}>
                <Avatar p={e.p} taille={34} />
                <span><b>{nomComplet(e.p)}</b><small>{vieCourte(D, e.p.id)}</small></span>
              </a>
              {#if peutModifier}
                <select class="input lien" aria-label="Lien de filiation de {nomCourt(e.p)}" value={e.lien.relation}
                  onchange={(ev) => changerLienEnfant(id, e.p.id, (ev.currentTarget as HTMLSelectElement).value as LienEnfant)}>
                  {#each Object.entries(LIENS_ENFANT) as [k, label]}<option value={k}>{label}</option>{/each}
                </select>
                <button class="btn btn-ghost btn-sm btn-icon" aria-label="Retirer {nomCourt(e.p)} de cette union" title="Retirer de cette union" onclick={() => retirer(e.p.id)}><Icon name="x" size={15} /></button>
              {:else if e.lien.relation !== 'biological'}
                <span class="badge">{LIENS_ENFANT[e.lien.relation]}</span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="card card-pad">
      <div class="card-head"><h2 class="card-title">Photos et documents</h2></div>
      <Galerie cible={{ family_id: id }} {peutModifier} />
    </section>

    <section class="card card-pad">
      <div class="card-head"><h2 class="card-title">Sources</h2></div>
      <SourcesBloc cible={{ family_id: id }} {peutModifier} />
    </section>
  </div>
{/if}

<style>
  .fil { margin: -8px 0 14px; }
  .fil a { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; font-weight: 550; color: var(--text-2); }
  .entete { display: flex; flex-direction: column; gap: 20px; }
  .couple { display: flex; align-items: center; justify-content: center; gap: 16px; }
  .conjoint { flex: 1; max-width: 280px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px; border-radius: var(--radius-lg); background: var(--surface-2); color: var(--text); text-align: center; text-decoration: none; }
  .conjoint:hover { text-decoration: none; background: var(--surface-hover); outline: 1px solid var(--border-strong); }
  .conjoint b { font-weight: 650; }
  .conjoint small { color: var(--text-3); font-size: 13px; }
  .inconnu { border: 1.5px dashed var(--border-strong); background: transparent; }
  .vide { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; background: var(--surface-2); color: var(--text-3); font-size: 22px; font-weight: 700; }
  .anneaux { color: var(--femme); }
  .infos { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
  h1 { font-size: 26px; }
  .actions { display: flex; gap: 8px; }
  .grille { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 16px; align-items: start; }
  .evs, .enfants { list-style: none; margin: 0; padding: 0; }
  .evs li { display: flex; gap: 12px; padding: 8px 0; }
  .pastille { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border-radius: 10px; background: var(--femme-soft); color: var(--femme); }
  .quoi { display: flex; flex-direction: column; min-width: 0; }
  .quoi b, .titre-ev { font-weight: 600; font-size: 14px; }
  .titre-ev { padding: 0; border: 0; background: none; font: inherit; font-weight: 600; font-size: 14px; color: var(--text); cursor: pointer; text-align: left; }
  .titre-ev:hover { color: var(--accent-text); text-decoration: underline; }
  .quoi small { color: var(--text-3); font-size: 13px; }
  .quoi p { font-size: 13.5px; color: var(--text-2); }
  .sous { margin: 16px 0 6px; font-size: 12px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); }
  .notes { white-space: pre-line; font-size: 14px; color: var(--text-2); }
  .enfants li { display: flex; align-items: center; gap: 6px; padding: 4px 0; }
  .enfants a { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 6px 8px; margin-left: -8px; border-radius: 10px; color: var(--text); text-decoration: none; }
  .enfants a:hover { background: var(--surface-2); text-decoration: none; }
  .enfants span { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
  .enfants b { font-weight: 600; font-size: 14px; }
  .enfants small { color: var(--text-3); font-size: 12.5px; }
  .lien { width: auto; min-height: 34px; font-size: 13px; padding: 0 28px 0 10px; }
  @media (max-width: 900px) {
    .grille { grid-template-columns: minmax(0, 1fr); }
    .infos { flex-direction: column; align-items: stretch; }
    .actions .btn:first-child { flex: 1; }
  }
  @media (max-width: 480px) {
    .couple { gap: 8px; }
    .conjoint { padding: 12px 8px; }
    .enfants li { flex-wrap: wrap; }
  }
</style>
