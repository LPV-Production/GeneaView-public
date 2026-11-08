<script lang="ts">
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import { lienPersonne } from '../lib/store.svelte';
  import { analyse, arbre, D } from '../lib/arbre.svelte';
  import { intervalle, manques } from '../lib/analyse';
  import { naissance, nomComplet, nomLieu, pourRecherche, vieCourte } from '../lib/genealogie';

  // Liste de toutes les personnes de l'arbre, avec recherche, filtres et tri.
  const PAGE = 200;
  type Filtre = 'toutes' | 'incompletes' | 'alertes' | 'ancetres';
  type Tri = 'nom' | 'naissance' | 'sosa';

  let q = $state('');
  let lieu = $state('');
  let de = $state<number | null>(null);
  let a = $state<number | null>(null);
  let filtre = $state<Filtre>('toutes');
  let tri = $state<Tri>('nom');
  let nb = $state(PAGE);
  let plusDeFiltres = $state(false);

  // Une ligne par personne, préparée une fois par version de l'arbre
  const toutes = $derived.by(() => {
    arbre.version;
    const { sosa, alertes } = analyse();
    return [...D.personnes.values()].map((p) => {
      const n = naissance(D, p.id);
      const lieux = (D.evPersonne.get(p.id) ?? []).map((e) => nomLieu(D, e.place_id)).filter(Boolean);
      return {
        p,
        vie: vieCourte(D, p.id),
        lieuNaissance: n ? nomLieu(D, n.place_id) : '',
        cle: pourRecherche(`${p.given_names} ${p.surname} ${p.married_name} ${p.nickname}`),
        cleLieux: pourRecherche(lieux.join(' | ')),
        periode: intervalle(n),
        tri: n?.date_sort ?? null,
        sosa: sosa.get(p.id)?.[0],
        alertes: alertes.get(p.id) ?? [],
        manques: manques(D, p.id),
      };
    });
  });

  const nbAlertes = $derived(toutes.filter((x) => x.alertes.length).length);
  const nbIncompletes = $derived(toutes.filter((x) => x.manques.length).length);
  const nbAncetres = $derived(toutes.filter((x) => x.sosa).length);

  const trouvees = $derived.by(() => {
    const mots = pourRecherche(q.trim()).split(/\s+/).filter(Boolean);
    const motsLieu = pourRecherche(lieu.trim()).split(/\s+/).filter(Boolean);
    const res = toutes.filter((x) => {
      if (mots.length && !mots.every((m) => x.cle.includes(m))) return false;
      if (motsLieu.length && !motsLieu.every((m) => x.cleLieux.includes(m))) return false;
      // Période : la naissance doit pouvoir tomber dans l'intervalle choisi
      if (de != null || a != null) {
        if (!x.periode) return false;
        if (de != null && x.periode.max <= de) return false;
        if (a != null && x.periode.min >= a + 1) return false;
      }
      if (filtre === 'incompletes' && !x.manques.length) return false;
      if (filtre === 'alertes' && !x.alertes.length) return false;
      if (filtre === 'ancetres' && !x.sosa) return false;
      return true;
    });
    const parNom = (x: (typeof res)[number], y: (typeof res)[number]) =>
      x.p.surname.localeCompare(y.p.surname, 'fr') || x.p.given_names.localeCompare(y.p.given_names, 'fr');
    if (tri === 'naissance') res.sort((x, y) => (x.tri ?? Infinity) - (y.tri ?? Infinity) || parNom(x, y));
    else if (tri === 'sosa') res.sort((x, y) => (x.sosa ?? Infinity) - (y.sosa ?? Infinity) || parNom(x, y));
    else res.sort(parNom);
    return res;
  });

  // Revient à la première page quand on change un critère
  $effect(() => { q; lieu; de; a; filtre; tri; nb = PAGE; });

  const filtresActifs = $derived(!!lieu.trim() || de != null || a != null);
  function effacer() { q = ''; lieu = ''; de = null; a = null; filtre = 'toutes'; }
</script>

<div class="outils">
  <div class="cherche">
    <Icon name="search" size={18} />
    <input class="input" type="search" placeholder="Rechercher un prénom, un nom…" aria-label="Rechercher une personne" bind:value={q} />
  </div>
  <button class="btn" class:actif={plusDeFiltres || filtresActifs} aria-expanded={plusDeFiltres} onclick={() => (plusDeFiltres = !plusDeFiltres)}>
    <Icon name="filtre" size={16} /> Filtres{filtresActifs ? ' •' : ''}
  </button>
  <label class="tri">
    <span class="sr-only">Trier par</span>
    <select class="input" bind:value={tri} aria-label="Trier par">
      <option value="nom">Tri : nom</option>
      <option value="naissance">Tri : naissance</option>
      <option value="sosa">Tri : Sosa</option>
    </select>
  </label>
</div>

{#if plusDeFiltres}
  <div class="card filtres">
    <label class="field"><span>Lieu (naissance, décès, résidence…)</span><input class="input" placeholder="Ex. Aurillac" bind:value={lieu} /></label>
    <div class="field">
      <span>Né(e) entre</span>
      <div class="periode">
        <input class="input" type="number" inputmode="numeric" placeholder="1800" aria-label="Année de début" bind:value={de} />
        <span class="muted">et</span>
        <input class="input" type="number" inputmode="numeric" placeholder="1900" aria-label="Année de fin" bind:value={a} />
      </div>
    </div>
    {#if filtresActifs || q || filtre !== 'toutes'}<button class="btn btn-ghost btn-sm effacer" onclick={effacer}><Icon name="x" size={14} /> Tout effacer</button>{/if}
  </div>
{/if}

<div class="segmented puces" role="radiogroup" aria-label="Afficher">
  <button role="radio" aria-checked={filtre === 'toutes'} class:active={filtre === 'toutes'} onclick={() => (filtre = 'toutes')}>Toutes <span class="n">{toutes.length}</span></button>
  <button role="radio" aria-checked={filtre === 'incompletes'} class:active={filtre === 'incompletes'} onclick={() => (filtre = 'incompletes')}>Fiches incomplètes <span class="n">{nbIncompletes}</span></button>
  <button role="radio" aria-checked={filtre === 'alertes'} class:active={filtre === 'alertes'} onclick={() => (filtre = 'alertes')}>À vérifier <span class="n">{nbAlertes}</span></button>
  {#if nbAncetres}<button role="radio" aria-checked={filtre === 'ancetres'} class:active={filtre === 'ancetres'} onclick={() => (filtre = 'ancetres')}>Ancêtres <span class="n">{nbAncetres}</span></button>{/if}
</div>

{#if !trouvees.length}
  <p class="muted vide">Aucune personne ne correspond à ces critères.</p>
{:else}
  <ul class="liste card">
    {#each trouvees.slice(0, nb) as x (x.p.id)}
      <li>
        <a href={lienPersonne(arbre.treeId!, x.p.id)}>
          <Avatar p={x.p} taille={36} />
          <span class="t">
            <b>{nomComplet(x.p)}</b>
            <small>{[x.vie, x.lieuNaissance].filter(Boolean).join(' · ') || 'Dates inconnues'}</small>
            {#if filtre === 'incompletes'}<small class="manque">Manque : {x.manques.join(', ')}</small>{/if}
            {#if filtre === 'alertes'}<small class="manque alerte">{x.alertes.map((al) => al.message).join(' · ')}</small>{/if}
          </span>
          {#if x.alertes.length}<span class="icone-alerte" title={x.alertes.map((al) => al.message).join('\n')}><Icon name="alert" size={15} /></span>{/if}
          {#if x.sosa}<span class="badge">Sosa {x.sosa}</span>{/if}
          <Icon name="chevronRight" size={16} />
        </a>
      </li>
    {/each}
  </ul>
  {#if trouvees.length > nb}
    <button class="btn plus" onclick={() => (nb += PAGE)}>Afficher {Math.min(PAGE, trouvees.length - nb)} de plus <span class="muted">({trouvees.length - nb} restantes)</span></button>
  {/if}
{/if}

<style>
  .outils { display: flex; gap: 8px; margin-bottom: 12px; }
  .cherche { position: relative; flex: 1; }
  .cherche :global(svg) { position: absolute; left: 14px; top: 50%; translate: 0 -50%; color: var(--text-3); }
  .cherche .input { min-height: 46px; padding-left: 44px; border-radius: var(--radius); }
  .outils .btn, .tri .input { min-height: 46px; }
  .outils .btn.actif { border-color: var(--accent); color: var(--accent-text); }
  .tri .input { width: auto; padding-right: 34px; }
  .filtres { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: end; gap: 14px; padding: 16px; margin-bottom: 12px; }
  .periode { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; }
  .puces { margin-bottom: 12px; overflow-x: auto; max-width: 100%; }
  .puces .n { font-variant-numeric: tabular-nums; }
  .liste { list-style: none; margin: 0; padding: 6px; }
  .liste a { display: flex; align-items: center; gap: 12px; padding: 9px 10px; border-radius: 10px; color: var(--text); text-decoration: none; }
  .liste a:hover { background: var(--surface-2); text-decoration: none; }
  .liste li + li { border-top: 1px solid var(--border); }
  .t { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
  .t b { font-weight: 600; font-size: 14.5px; }
  .t small { color: var(--text-3); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .t .manque { color: var(--warn); white-space: normal; }
  .icone-alerte { color: var(--warn); display: flex; }
  .liste :global(svg:last-child) { color: var(--text-3); }
  .vide { padding: 16px 4px; }
  .plus { margin-top: 12px; width: 100%; }
  @media (max-width: 700px) {
    .outils { flex-wrap: wrap; }
    .cherche { flex-basis: 100%; }
    .outils .btn, .tri { flex: 1; }
    .tri .input { width: 100%; }
    .filtres { grid-template-columns: 1fr; }
    .liste .badge { display: none; }
  }
</style>
