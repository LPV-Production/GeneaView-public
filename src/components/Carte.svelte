<script lang="ts">
  import 'leaflet/dist/leaflet.css';
  import { onMount } from 'svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import RechercheCentre from './RechercheCentre.svelte';
  import { go, lienCarte, lienPersonne, toast, type Arbre } from '../lib/store.svelte';
  import { analyse, arbre, D, positionLieu, type Evenement } from '../lib/arbre.svelte';
  import { intervalle, generationSosa } from '../lib/analyse';
  import { afficherDate } from '../../commun/dates';
  import { TYPES_EVENEMENT } from '../../commun/libelles';
  import { nomComplet, nomCourt, unionsDe } from '../lib/genealogie';
  import { chercherPosition } from '../lib/geocodage';
  import type * as LeafletT from 'leaflet';

  // ============================================================
  // Carte des lieux (Leaflet + OpenStreetMap, gratuits).
  // Un rond par lieu, d'autant plus gros qu'il y a d'événements.
  // Filtres : une personne ou tout l'arbre, génération (Sosa), période.
  // ============================================================
  let { infos, personId }: { infos: Arbre; personId?: string } = $props();
  const peutModifier = $derived(infos.role !== 'viewer');

  let generation = $state<number | 0>(0); // 0 = toutes
  let de = $state<number | null>(null);
  let a = $state<number | null>(null);
  let choixPersonne = $state(false);

  // ----- Événements retenus par les filtres, regroupés par lieu -----
  const selection = $derived.by(() => {
    arbre.version;
    const { sosa } = analyse();
    let evs: Evenement[] = [...D.evenements.values()].filter((e) => e.place_id);
    if (personId) {
      const unions = new Set(unionsDe(D, personId).map((u) => u.union.id));
      evs = evs.filter((e) => e.person_id === personId || (e.family_id && unions.has(e.family_id)));
    }
    if (generation) {
      evs = evs.filter((e) => {
        const qui = e.person_id ? [e.person_id] : [D.unions.get(e.family_id!)?.partner1_id, D.unions.get(e.family_id!)?.partner2_id].filter(Boolean) as string[];
        return qui.some((id) => (sosa.get(id) ?? []).some((n) => generationSosa(n) === generation));
      });
    }
    if (de != null || a != null) {
      evs = evs.filter((e) => {
        const i = intervalle(e);
        return !!i && (de == null || i.max > de) && (a == null || i.min < a + 1);
      });
    }
    const parLieu = new Map<string, Evenement[]>();
    for (const e of evs) parLieu.set(e.place_id!, [...(parLieu.get(e.place_id!) ?? []), e]);
    const lieux = [...parLieu].map(([id, l]) => ({ lieu: D.lieux.get(id)!, evs: l })).filter((x) => x.lieu);
    return {
      situes: lieux.filter((x) => x.lieu.latitude != null),
      aSituer: lieux.filter((x) => x.lieu.latitude == null && !x.lieu.geocoded_at),
      introuvables: lieux.filter((x) => x.lieu.latitude == null && x.lieu.geocoded_at),
      nbEvenements: evs.length,
    };
  });

  const generationsDispo = $derived.by(() => {
    arbre.version;
    const max = Math.max(1, ...[...analyse().sosa.values()].flat().map(generationSosa));
    return Array.from({ length: Math.min(max, 15) }, (_, i) => i + 1);
  });

  // ----- Carte Leaflet -----
  let conteneur: HTMLDivElement | undefined = $state();
  let L: typeof LeafletT | null = null;
  let carte: LeafletT.Map | null = null;
  let couche: LeafletT.LayerGroup | null = null;
  let premierAjustement = true;

  const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  function quiEtQuoi(e: Evenement) {
    const qui = e.person_id ? D.personnes.get(e.person_id) : undefined;
    const u = e.family_id ? D.unions.get(e.family_id) : undefined;
    const noms = qui ? nomComplet(qui) : [u?.partner1_id, u?.partner2_id].map((x) => (x ? nomCourt(D.personnes.get(x)) : '?')).join(' & ');
    const cible = qui?.id ?? u?.partner1_id ?? u?.partner2_id;
    return { noms, cible, texte: `${TYPES_EVENEMENT[e.type]}${e.date_text ? ` · ${afficherDate(e)}` : ''}` };
  }

  function dessiner() {
    if (!L || !carte || !couche) return;
    couche.clearLayers();
    const points: [number, number][] = [];
    for (const { lieu, evs } of selection.situes) {
      const pos: [number, number] = [lieu.latitude!, lieu.longitude!];
      points.push(pos);
      const lignes = evs
        .slice()
        .sort((x, y) => (x.date_sort ?? Infinity) - (y.date_sort ?? Infinity))
        .slice(0, 30)
        .map((e) => { const q = quiEtQuoi(e); return `<li><a href="${lienPersonne(arbre.treeId!, q.cible ?? '')}">${echapper(q.noms)}</a><br><small>${echapper(q.texte)}</small></li>`; })
        .join('');
      L.circleMarker(pos, {
        radius: Math.min(26, 7 + 2.5 * Math.sqrt(evs.length)),
        color: 'var(--accent)', weight: 2, fillColor: 'var(--accent)', fillOpacity: 0.35, className: 'rond-lieu',
      })
        .bindPopup(`<div class="bulle"><b>${echapper(lieu.name)}</b><span>${evs.length} événement${evs.length > 1 ? 's' : ''}</span><ul>${lignes}</ul>${evs.length > 30 ? '<small>… et d’autres</small>' : ''}</div>`, { maxWidth: 280 })
        .bindTooltip(`${lieu.name} (${evs.length})`)
        .addTo(couche);
    }
    if (premierAjustement && points.length) {
      carte.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 11 });
      premierAjustement = false;
    }
  }

  onMount(() => {
    let detruit = false;
    (async () => {
      L = (await import('leaflet')).default;
      if (detruit || !conteneur) return;
      carte = L.map(conteneur, { zoomControl: true, attributionControl: true }).setView([46.6, 2.4], 5); // France
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">les contributeurs d’OpenStreetMap</a>',
      }).addTo(carte);
      couche = L.layerGroup().addTo(carte);
      dessiner();
    })();
    return () => { detruit = true; carte?.remove(); carte = null; };
  });

  // Redessine quand les filtres ou les données changent
  $effect(() => { selection; dessiner(); });
  $effect(() => { personId; generation; de; a; premierAjustement = true; });

  // ----- Recherche des positions manquantes (une par seconde) -----
  let recherche = $state<{ fait: number; total: number; trouves: number } | null>(null);
  let arreter = false;
  async function situer() {
    const liste = selection.aSituer.map((x) => x.lieu);
    if (!liste.length || recherche) return;
    arreter = false;
    recherche = { fait: 0, total: liste.length, trouves: 0 };
    try {
      for (const l of liste) {
        if (arreter) break;
        const pos = await chercherPosition(l.name);
        await positionLieu(l.id, pos);
        recherche.fait++;
        if (pos) recherche.trouves++;
      }
      toast(`${recherche.trouves} lieu(x) situé(s) sur ${recherche.fait}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      recherche = null;
      premierAjustement = true;
      dessiner();
    }
  }
  async function reessayer(id: string) {
    await positionLieu(id, null, true);
  }

  const personne = $derived(personId ? D.personnes.get(personId) : undefined);
</script>

<div class="page-carte">
  <header class="entete">
    <div class="titre-ligne">
      <h1 class="titre">Carte des lieux</h1>
      <span class="muted small">{selection.situes.length} lieu{selection.situes.length > 1 ? 'x' : ''} · {selection.nbEvenements} événement{selection.nbEvenements > 1 ? 's' : ''}</span>
    </div>
    <div class="filtres">
      <div class="filtre-personne">
        {#if personne}
          <span class="puce"><Avatar p={personne} taille={24} /> {nomCourt(personne)}
            <button class="btn btn-ghost btn-sm btn-icon" aria-label="Tout l’arbre" title="Revenir à tout l’arbre" onclick={() => go(lienCarte(infos.id))}><Icon name="x" size={14} /></button></span>
        {:else if choixPersonne}
          <RechercheCentre onchoisir={(id) => { choixPersonne = false; go(lienCarte(infos.id, id)); }} autofocus />
        {:else}
          <button class="btn btn-sm" onclick={() => (choixPersonne = true)}><Icon name="personnes" size={15} /> Tout l’arbre</button>
        {/if}
      </div>
      <label class="champ-court">
        <span class="sr-only">Génération</span>
        <select class="input" bind:value={generation} aria-label="Génération (Sosa)">
          <option value={0}>Toutes générations</option>
          {#each generationsDispo as g}<option value={g}>{g === 1 ? 'Personne racine' : g === 2 ? 'Parents (gén. 2)' : g === 3 ? 'Grands-parents (gén. 3)' : `Génération ${g}`}</option>{/each}
        </select>
      </label>
      <div class="periode">
        <input class="input" type="number" inputmode="numeric" placeholder="De" aria-label="Période : de l’année" bind:value={de} />
        <input class="input" type="number" inputmode="numeric" placeholder="À" aria-label="Période : jusqu’à l’année" bind:value={a} />
      </div>
    </div>
    {#if selection.aSituer.length || recherche}
      <div class="situer">
        {#if recherche}
          <span>Recherche des positions… {recherche.fait}/{recherche.total}</span>
          <button class="btn btn-sm" onclick={() => (arreter = true)}>Arrêter</button>
        {:else}
          <span>{selection.aSituer.length} lieu{selection.aSituer.length > 1 ? 'x' : ''} pas encore situé{selection.aSituer.length > 1 ? 's' : ''} sur la carte.</span>
          {#if peutModifier}<button class="btn btn-primary btn-sm" onclick={situer}><Icon name="lieu" size={15} /> Les situer</button>{/if}
        {/if}
      </div>
    {/if}
  </header>

  <div class="carte" bind:this={conteneur}></div>

  {#if selection.introuvables.length}
    <details class="introuvables">
      <summary>{selection.introuvables.length} lieu{selection.introuvables.length > 1 ? 'x' : ''} introuvable{selection.introuvables.length > 1 ? 's' : ''} automatiquement</summary>
      <p class="muted small">Ajoutez le département et le pays au nom du lieu (fiche de l’événement), puis relancez la recherche.</p>
      <ul>
        {#each selection.introuvables as { lieu } (lieu.id)}
          <li>{lieu.name}{#if peutModifier}<button class="btn btn-ghost btn-sm" onclick={() => reessayer(lieu.id)}>Rechercher à nouveau</button>{/if}</li>
        {/each}
      </ul>
    </details>
  {/if}
  <p class="muted small credit">Positions trouvées avec Nominatim (OpenStreetMap), une recherche par seconde, puis gardées en mémoire.</p>
</div>

<style>
  .page-carte { display: flex; flex-direction: column; gap: 12px; }
  .entete { display: flex; flex-direction: column; gap: 10px; }
  .titre-ligne { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  h1 { font-size: 30px; }
  .filtres { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .filtre-personne { min-width: 220px; }
  .puce { display: inline-flex; align-items: center; gap: 8px; padding: 3px 4px 3px 4px; border-radius: 99px; background: var(--accent-soft); font-size: 14px; font-weight: 600; }
  .champ-court .input { width: auto; min-height: 36px; font-size: 14px; padding-right: 32px; }
  .periode { display: flex; gap: 6px; }
  .periode .input { width: 90px; min-height: 36px; }
  .situer { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 14px; border-radius: var(--radius); background: var(--warn-soft); font-size: 14px; }
  .carte { height: calc(100dvh - 260px); min-height: 360px; border-radius: var(--radius-lg); border: 1px solid var(--border); overflow: hidden; z-index: 0; }
  .introuvables { padding: 10px 14px; border-radius: var(--radius); background: var(--surface); border: 1px solid var(--border); font-size: 14px; }
  .introuvables summary { cursor: pointer; font-weight: 600; }
  .introuvables ul { margin: 8px 0 0; padding-left: 18px; }
  .introuvables li { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .credit { text-align: right; }
  :global(.bulle) { display: flex; flex-direction: column; gap: 2px; font-family: var(--font); }
  :global(.bulle ul) { margin: 6px 0 0; padding-left: 16px; max-height: 220px; overflow-y: auto; }
  :global(.bulle li) { margin-bottom: 4px; }
  :global(.bulle span) { color: #667; font-size: 12px; }
  :global(.leaflet-container) { font-family: var(--font); background: var(--surface-2); }
  :global(.rond-lieu) { stroke: var(--accent); fill: var(--accent); }
  @media (max-width: 900px) { .carte { height: calc(100dvh - 360px); } h1 { font-size: 25px; } }
</style>
