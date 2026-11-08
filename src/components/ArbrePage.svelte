<script lang="ts">
  import Icon from './Icon.svelte';
  import Fiche from './Fiche.svelte';
  import FicheUnion from './FicheUnion.svelte';
  import ListePersonnes from './ListePersonnes.svelte';
  import ArbreVue from './ArbreVue.svelte';
  import Carte from './Carte.svelte';
  import Impression from './Impression.svelte';
  import PersonneForm from './PersonneForm.svelte';
  import EvenementForm from './EvenementForm.svelte';
  import UnionForm from './UnionForm.svelte';
  import ChangerParents from './ChangerParents.svelte';
  import CitationForm from './CitationForm.svelte';
  import SourceForm from './SourceForm.svelte';
  import LienParente from './LienParente.svelte';
  import { app, openTreeForm } from '../lib/store.svelte';
  import { arbre, chargerArbre, D, ui } from '../lib/arbre.svelte';
  import { depuis, pluriel, ROLES } from '../lib/format';

  // Page d'un arbre : la vue arbre (par défaut), la liste des personnes,
  // ou la fiche d'une personne / d'une union.
  let { id, personId, unionId, centreId, liste, carte, cartePersonne, impression }: { id: string; personId?: string; unionId?: string; centreId?: string; liste?: boolean; carte?: boolean; cartePersonne?: string; impression?: { type: 'fiche' | 'ascendance' | 'descendance'; personId: string } } = $props();
  const infos = $derived(app.arbres.find((a) => a.id === id));
  const peutModifier = $derived(infos?.role !== 'viewer');

  // Personne au centre de la vue arbre : celle de l'adresse, sinon la dernière consultée,
  // sinon la personne racine, sinon la première de l'arbre
  const centre = $derived.by(() => {
    arbre.version;
    if (arbre.etat !== 'pret' || !D.personnes.size) return null;
    let memoire: string | null = null;
    try { memoire = localStorage.getItem(`gv_centre_${id}`); } catch {}
    return [centreId, memoire, infos?.root_person_id].find((x) => x && D.personnes.has(x)) ?? D.personnes.keys().next().value!;
  });

  $effect(() => {
    if (infos) chargerArbre(id);
  });

  // Un formulaire ouvert ne doit pas survivre à un changement de page
  $effect(() => {
    personId; unionId;
    return () => { ui.personne = null; ui.evenement = null; ui.union = null; ui.citation = null; ui.source = null; ui.parente = null; ui.parents = null; };
  });
</script>

{#if !infos}
  <div class="card empty-state">
    <strong>Arbre introuvable</strong>
    <p class="muted">Il a peut-être été supprimé, ou n’est plus partagé avec vous.</p>
    <a class="btn" href="#/">Retour à mes arbres</a>
  </div>
{:else if arbre.etat === 'erreur' && arbre.treeId === id}
  <div class="card empty-state">
    <strong>Impossible de charger l’arbre</strong>
    <p class="muted">{arbre.erreur}</p>
    <button class="btn btn-primary" onclick={() => { arbre.etat = 'vide'; chargerArbre(id); }}>Réessayer</button>
  </div>
{:else if arbre.etat !== 'pret' || arbre.treeId !== id}
  <div class="chargement" aria-busy="true"><span class="spinner" role="status" aria-label="Chargement de l’arbre"></span></div>
{:else if personId}
  {#key personId}<Fiche id={personId} />{/key}
{:else if unionId}
  {#key unionId}<FicheUnion id={unionId} />{/key}
{:else if impression}
  {#key impression.type + impression.personId}<Impression {infos} type={impression.type} personId={impression.personId} />{/key}
{:else if carte}
  {#key cartePersonne}<Carte {infos} personId={cartePersonne} />{/key}
{:else if centre && !liste}
  <ArbreVue infos={infos} centreId={centre} />
{:else}
  <header class="page-head">
    <div>
      <h1>{infos.name}</h1>
      {#if infos.description}<p class="muted desc">{infos.description}</p>{/if}
      <p class="chips">
        <span class="badge">{pluriel(infos.person_count, 'personne')}</span>
        <span class="badge {infos.role === 'owner' ? '' : 'badge-accent'}">
          {#if infos.role === 'viewer'}<Icon name="eye" size={13} />{/if}
          {ROLES[infos.role]}{infos.role !== 'owner' ? ` · arbre de ${infos.owner_label}` : ''}
        </span>
        <span class="badge">Modifié {depuis(infos.updated_at)}</span>
      </p>
    </div>
    <div class="page-head-actions">
      {#if infos.role === 'owner'}<button class="btn" onclick={() => openTreeForm(infos.id)}><Icon name="edit" size={16} /> Renommer</button>{/if}
      {#if peutModifier}<button class="btn btn-primary" onclick={() => (ui.personne = {})}><Icon name="plus" size={16} /> Ajouter une personne</button>{/if}
    </div>
  </header>

  {#if infos.person_count === 0}
    <div class="card empty-state">
      <span class="rond" aria-hidden="true"><Icon name="personnes" size={26} /></span>
      <strong>Cet arbre est encore vide</strong>
      <p class="muted">Commencez par vous-même ou par la personne dont vous voulez retracer les ancêtres. Vous ajouterez ensuite ses parents, son conjoint et ses enfants depuis sa fiche.</p>
      {#if peutModifier}<button class="btn btn-primary" onclick={() => (ui.personne = {})}><Icon name="plus" size={16} /> Ajouter la première personne</button>{/if}
    </div>
  {:else}
    <ListePersonnes />
  {/if}
{/if}

{#if ui.personne}
  <PersonneForm personId={ui.personne.personId} relation={ui.personne.relation} sexe={ui.personne.sexe} />
{/if}
{#if ui.evenement}
  <EvenementForm id={ui.evenement.id} person_id={ui.evenement.person_id} family_id={ui.evenement.family_id} />
{/if}
{#if ui.parents}
  <ChangerParents childId={ui.parents.childId} />
{/if}
{#if ui.union}
  <UnionForm id={ui.union.id} />
{/if}
{#if ui.citation}
  <CitationForm cible={ui.citation.cible} />
{/if}
{#if ui.parente}
  <LienParente a={ui.parente.a} />
{/if}
{#if ui.source}
  <SourceForm id={ui.source.id} citationId={ui.source.citationId} />
{/if}

<style>
  .desc { max-width: 720px; white-space: pre-line; margin-top: 4px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .rond { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 14px; background: var(--accent-soft); color: var(--accent-text); margin-bottom: 8px; }
  .chargement { display: grid; place-items: center; min-height: 40vh; }
  .spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--border); border-top-color: var(--accent); animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
