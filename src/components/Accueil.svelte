<script lang="ts">
  import Icon from './Icon.svelte';
  import ImportGedcom from './ImportGedcom.svelte';
  import { app, lienArbre, openTreeForm } from '../lib/store.svelte';
  import { depuis, pluriel, ROLES } from '../lib/format';

  const heure = new Date().getHours();
  const salut = heure >= 18 || heure < 5 ? 'Bonsoir' : 'Bonjour';
  let importer = $state(false);
</script>

<header class="page-head">
  <div>
    <h1>Mes arbres</h1>
    <p class="muted">{salut} {app.user?.label}{app.arbres.length ? ` — ${pluriel(app.arbres.length, 'arbre')}.` : '.'}</p>
  </div>
  <div class="page-head-actions">
    <button class="btn" onclick={() => (importer = true)}><Icon name="importer" size={16} /> Importer GEDCOM</button>
    <button class="btn btn-primary" onclick={() => openTreeForm()}><Icon name="plus" size={16} /> Nouvel arbre</button>
  </div>
</header>

{#if app.arbres.length === 0}
  <div class="card empty-state">
    <span class="rond" aria-hidden="true"><Icon name="arbre" size={26} /></span>
    <strong>Aucun arbre pour l’instant</strong>
    <p class="muted">Créez votre premier arbre : vous pourrez ensuite y ajouter des personnes, leurs dates, leurs photos et leurs documents.</p>
    <div class="boutons">
      <button class="btn btn-primary" onclick={() => openTreeForm()}><Icon name="plus" size={16} /> Créer un arbre</button>
      <button class="btn" onclick={() => (importer = true)}><Icon name="importer" size={16} /> Importer un fichier GEDCOM</button>
    </div>
  </div>
{:else}
  <div class="arbres">
    {#each app.arbres as a (a.id)}
      <a class="card carte-arbre" href={lienArbre(a.id)}>
        <span class="monogramme" aria-hidden="true">{a.name.trim()[0]?.toUpperCase()}</span>
        <h2 class="titre">{a.name}</h2>
        {#if a.description}<p class="desc muted small">{a.description}</p>{/if}
        <span class="chips">
          <span class="badge">{pluriel(a.person_count, 'personne')}</span>
          {#if a.role !== 'owner'}<span class="badge badge-accent">Partagé par {a.owner_label}</span>{/if}
        </span>
        <span class="pied"><span>{ROLES[a.role]}</span><span>Modifié {depuis(a.updated_at)}</span></span>
      </a>
    {/each}
    <button type="button" class="card carte-arbre nouveau" onclick={() => openTreeForm()}>
      <span class="rond" aria-hidden="true"><Icon name="plus" size={22} /></span>
      <span><strong>Nouvel arbre</strong><br /><span class="muted small">ou importez un fichier GEDCOM (bouton en haut)</span></span>
    </button>
  </div>
{/if}

{#if importer}<ImportGedcom onclose={() => (importer = false)} />{/if}

<style>
  .boutons { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 12px; }
  .boutons .btn { margin: 0; }
  .arbres { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
  .carte-arbre {
    display: flex; flex-direction: column; gap: 10px; padding: 18px; color: var(--text); text-decoration: none; text-align: left;
    transition: box-shadow var(--dur), border-color var(--dur), translate var(--dur);
  }
  .carte-arbre:hover { border-color: var(--border-strong); box-shadow: var(--shadow-lg); translate: 0 -2px; text-decoration: none; }
  .monogramme {
    display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px;
    background: var(--accent-soft); color: var(--accent-text); font: 600 22px var(--titre);
  }
  h2 { font-size: 20px; line-height: 1.2; }
  .desc { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .pied { margin-top: auto; display: flex; justify-content: space-between; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-3); }
  .nouveau {
    align-items: center; justify-content: center; text-align: center; min-height: 190px; cursor: pointer;
    border: 1.5px dashed var(--border-strong); background: transparent; box-shadow: none; color: var(--text-2); font: inherit;
  }
  .rond { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; background: var(--accent-soft); color: var(--accent-text); margin-bottom: 4px; }
  @media (max-width: 640px) {
    .arbres { grid-template-columns: 1fr; gap: 12px; }
    .nouveau { min-height: 0; flex-direction: row; padding: 14px; text-align: left; justify-content: flex-start; }
    .nouveau .rond { margin: 0; }
  }
</style>
