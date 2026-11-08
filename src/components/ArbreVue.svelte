<script lang="ts">
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import Graphe from './Graphe.svelte';
  import Proche from './Proche.svelte';
  import Eventail from './Eventail.svelte';
  import RechercheCentre from './RechercheCentre.svelte';
  import { go, lienCentre, lienListe, lienPersonne, type Arbre } from '../lib/store.svelte';
  import { analyse, arbre, D, ui } from '../lib/arbre.svelte';
  import { nomComplet, parents, vieCourte } from '../lib/genealogie';

  // Écran principal d'un arbre : la vue « personne centrale » (graphique),
  // ou sur téléphone la vue « famille proche ». Barre d'outils flottante en haut.
  let { infos, centreId }: { infos: Arbre; centreId: string } = $props();

  const memo = {
    lire: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
    ecrire: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
  };

  const peutModifier = $derived(infos.role !== 'viewer');
  let generations = $state(Number(memo.lire('gv_generations')) || 3);
  let gensEventail = $state(Number(memo.lire('gv_generations_eventail')) || 5);
  // Par défaut : vue « famille proche » sur téléphone, vue graphique sur ordinateur
  type Mode = 'arbre' | 'eventail' | 'proche';
  let mode = $state<Mode>((memo.lire('gv_vue') as Mode) ?? (window.innerWidth < 700 ? 'proche' : 'arbre'));
  let recherche = $state(false);
  let graphe: Graphe | Eventail | undefined = $state();

  $effect(() => memo.ecrire('gv_generations', String(generations)));
  $effect(() => memo.ecrire('gv_generations_eventail', String(gensEventail)));
  $effect(() => memo.ecrire('gv_vue', mode));
  // Mémorise la dernière personne centrale de cet arbre
  $effect(() => memo.ecrire(`gv_centre_${infos.id}`, centreId));

  const recentrer = (id: string) => { recherche = false; go(lienCentre(infos.id, id)); };
  const ouvrir = (id: string) => go(lienPersonne(infos.id, id));

  const c = $derived.by(() => {
    arbre.version;
    const p = D.personnes.get(centreId);
    return p ? { p, vie: vieCourte(D, centreId), nbParents: parents(D, centreId).liste.length, sosa: analyse().sosa.get(centreId)?.[0] } : null;
  });
  const ajouter = (type: 'parent' | 'conjoint' | 'enfant') => (ui.personne = { relation: { type, of: centreId } });
</script>

<div class="vue" class:proche={mode === 'proche'}>
  {#if mode === 'arbre'}
    <Graphe bind:this={graphe} {centreId} {generations} {peutModifier} onrecentrer={recentrer} onouvrir={ouvrir} />
  {:else if mode === 'eventail'}
    <Eventail bind:this={graphe} {centreId} generations={gensEventail} {peutModifier} onrecentrer={recentrer} onouvrir={ouvrir} />
  {:else}
    <div class="defile"><Proche {centreId} {peutModifier} onrecentrer={recentrer} onouvrir={ouvrir} /></div>
  {/if}

  <div class="barre">
    <strong class="titre nom-arbre">{infos.name}</strong>
    <div class="outils">
      <div class="cherche-large"><RechercheCentre onchoisir={recentrer} /></div>
      <button class="btn btn-ghost btn-icon cherche-court" aria-label="Centrer sur une personne" aria-expanded={recherche} onclick={() => (recherche = !recherche)}><Icon name="search" /></button>
      {#if mode === 'arbre'}
        <div class="segmented gens" role="radiogroup" aria-label="Générations d’ancêtres">
          {#each [2, 3, 4] as g}
            <button role="radio" aria-checked={generations === g} class:active={generations === g} title="{g} générations d’ancêtres" onclick={() => (generations = g)}>{g}</button>
          {/each}
        </div>
      {:else if mode === 'eventail'}
        <label class="gens-eventail">
          <span class="sr-only">Générations de l’éventail</span>
          <select class="input" bind:value={gensEventail} aria-label="Générations de l’éventail">
            {#each [4, 5, 6, 7, 8] as g}<option value={g}>{g} générations</option>{/each}
          </select>
        </label>
      {/if}
      <div class="segmented" role="radiogroup" aria-label="Type de vue">
        <button role="radio" aria-checked={mode === 'arbre'} class:active={mode === 'arbre'} title="Vue arbre" onclick={() => (mode = 'arbre')}><Icon name="arbre" size={15} /><span>Arbre</span></button>
        <button role="radio" aria-checked={mode === 'eventail'} class:active={mode === 'eventail'} title="Éventail des ancêtres" onclick={() => (mode = 'eventail')}><Icon name="eventail" size={15} /><span>Éventail</span></button>
        <button role="radio" aria-checked={mode === 'proche'} class:active={mode === 'proche'} title="Famille proche" onclick={() => (mode = 'proche')}><Icon name="proche" size={15} /><span>Proche</span></button>
        <a class="seg-lien" href={lienListe(infos.id)} title="Liste des personnes"><Icon name="liste" size={15} /><span>Liste</span></a>
      </div>
    </div>
    {#if recherche}<div class="cherche-mobile"><RechercheCentre onchoisir={recentrer} autofocus /></div>{/if}
  </div>

  {#if mode !== 'proche'}
    <div class="zooms" role="group" aria-label="Zoom">
      <button aria-label="Zoomer" title="Zoomer (+)" onclick={() => graphe?.zoomer(1.25)}><Icon name="plus" size={18} /></button>
      <button aria-label="Dézoomer" title="Dézoomer (−)" onclick={() => graphe?.zoomer(0.8)}><Icon name="zoomMoins" size={18} /></button>
      <button aria-label="Recentrer" title="Recentrer sur la personne centrale" onclick={() => graphe?.recentrer()}><Icon name="centrer" size={18} /></button>
    </div>

    {#if c}
      <aside class="selection" aria-label="Personne au centre">
        <div class="qui">
          <Avatar p={c.p} taille={40} />
          <span><b>{nomComplet(c.p)}</b><small>{[c.sosa ? `Sosa ${c.sosa}` : '', c.vie || 'Dates inconnues'].filter(Boolean).join(' · ')}</small></span>
          <button class="btn btn-primary btn-sm" onclick={() => ouvrir(centreId)}>Fiche</button>
        </div>
        {#if peutModifier}
          <div class="ajouts">
            {#if c.nbParents < 2}<button class="btn btn-sm" onclick={() => ajouter('parent')}><Icon name="plus" size={14} /> Parent</button>{/if}
            <button class="btn btn-sm" onclick={() => ajouter('conjoint')}><Icon name="plus" size={14} /> Conjoint</button>
            <button class="btn btn-sm" onclick={() => ajouter('enfant')}><Icon name="plus" size={14} /> Enfant</button>
          </div>
        {/if}
      </aside>
    {/if}
  {/if}
</div>

<style>
  /* La vue occupe tout l'espace à droite de la barre latérale (ordinateur) ou entre les barres (téléphone) */
  .vue { position: fixed; inset: 0 0 0 var(--sidebar-w); z-index: 1; background: var(--bg); }
  .defile { position: absolute; inset: 0; overflow-y: auto; }

  .barre {
    position: absolute; top: 14px; left: 14px; right: 14px; z-index: 5; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 6px 6px 6px 16px; border-radius: 14px; border: 1px solid var(--border);
    background: color-mix(in srgb, var(--surface) 90%, transparent); backdrop-filter: blur(10px); box-shadow: var(--shadow-lg);
  }
  .nom-arbre { flex: 1; font-size: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .outils { flex: none; display: flex; align-items: center; gap: 8px; }
  .segmented button, .seg-lien { display: inline-flex; align-items: center; gap: 6px; }
  .seg-lien {
    min-height: 34px; padding: 0 12px; border-radius: 7px; color: var(--text-2); font-size: 13px; font-weight: 600; text-decoration: none;
  }
  .seg-lien:hover { color: var(--text); text-decoration: none; }
  .gens button { min-width: 36px; padding: 0 10px; }
  .gens-eventail .input { min-height: 34px; width: auto; font-size: 13px; padding: 0 30px 0 10px; }
  .cherche-court, .cherche-mobile { display: none; }

  .zooms {
    position: absolute; right: 16px; bottom: 16px; z-index: 5; display: flex; flex-direction: column; overflow: hidden;
    border-radius: 12px; border: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow-lg);
  }
  .zooms button { display: grid; place-items: center; width: 42px; height: 42px; border: 0; background: none; color: var(--text-2); cursor: pointer; }
  .zooms button + button { border-top: 1px solid var(--border); }
  .zooms button:hover { background: var(--surface-2); color: var(--text); }

  .selection {
    position: absolute; left: 16px; bottom: 16px; z-index: 5; width: 340px; padding: 12px; display: flex; flex-direction: column; gap: 10px;
    border-radius: 16px; border: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow-lg);
  }
  .qui { display: flex; align-items: center; gap: 12px; }
  .qui span { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
  .qui b { font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .qui small { color: var(--text-3); font-size: 12.5px; }
  .ajouts { display: flex; gap: 6px; }
  .ajouts .btn { flex: 1; border-style: dashed; color: var(--accent-text); }

  @media (max-width: 1100px) {
    .cherche-large { display: none; }
    .cherche-court { display: inline-flex; }
    .cherche-mobile { display: block; width: 100%; padding: 0 0 4px; }
    .segmented span { display: none; }
  }
  @media (max-width: 900px) {
    .vue { inset: calc(56px + env(safe-area-inset-top)) 0 calc(var(--bottom-nav-h) + env(safe-area-inset-bottom)) 0; }
    .barre { top: 8px; left: 8px; right: 8px; padding-left: 12px; gap: 6px; }
    .nom-arbre { font-size: 15px; }
    .gens { display: none; }
    .selection { left: 8px; right: 8px; bottom: 8px; width: auto; }
    .zooms { right: 8px; bottom: auto; top: 70px; }
  }
</style>
