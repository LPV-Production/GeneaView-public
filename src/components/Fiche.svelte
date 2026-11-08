<script lang="ts">
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import Menu from './Menu.svelte';
  import Galerie from './Galerie.svelte';
  import SourcesBloc from './SourcesBloc.svelte';
  import { afficherDate, estApproximative } from '../../commun/dates';
  import { app, arbreCourant, go, lienArbre, lienCarte, lienCentre, lienImpression, lienPersonne, lienUnion } from '../lib/store.svelte';
  import { generationSosa } from '../lib/analyse';
  import { ajouterATrouver, analyse, arbre, basculerATrouver, D, definirRacine, supprimerATrouver, supprimerPersonne, ui, type Personne } from '../lib/arbre.svelte';
  import { accord, ageTexte, belleFamille, chronologie, deces, fratrie, libelleUnion, naissance, nomComplet, nomCourt, nomLieu, parents, rangUnion, roleParent, texteFin, unionsDe, vieCourte } from '../lib/genealogie';

  // Fiche d'une personne : identité, dates clés, chronologie, famille, notes, « à chercher »
  let { id }: { id: string } = $props();

  const treeId = $derived(arbre.treeId!);
  const tree = $derived(arbreCourant());
  const peutModifier = $derived(tree?.role !== 'viewer');

  // Tout est recalculé quand les données changent (arbre.version)
  const v = $derived.by(() => {
    arbre.version;
    const p = D.personnes.get(id);
    if (!p) return null;
    return {
      p,
      n: naissance(D, id),
      d: deces(D, id),
      age: ageTexte(D, id),
      chrono: chronologie(D, id),
      parents: parents(D, id),
      fratrie: fratrie(D, id),
      unions: unionsDe(D, id),
      allies: belleFamille(D, id),
      todos: (D.todosPersonne.get(id) ?? []).slice().sort((a, b) => a.done - b.done),
      nbDocs: (D.mediasCible.get(`p:${id}`) ?? []).length,
      nbSources: (D.citationsCible.get(`p:${id}`) ?? []).length,
      sosa: analyse().sosa.get(id) ?? [],
      alertes: analyse().alertes.get(id) ?? [],
    };
  });

  const estRacine = $derived(tree?.root_person_id === id);
  const sousTitre = $derived(v ? [v.p.nickname && `dit « ${v.p.nickname} »`, v.p.married_name && `nom d’usage ${v.p.married_name}`, v.p.occupations].filter(Boolean).join(' · ') : '');

  const ajouter = (type: 'parent' | 'conjoint' | 'enfant', family_id?: string) => (ui.personne = { relation: { type, of: id, family_id } });

  let nouveauTodo = $state('');
  async function ajouterTodo(e: SubmitEvent) {
    e.preventDefault();
    if (nouveauTodo.trim() && (await ajouterATrouver(id, nouveauTodo.trim()))) nouveauTodo = '';
  }

  async function supprimer() {
    if (!v) return;
    const nom = nomComplet(v.p);
    if (!confirm(`Supprimer définitivement ${nom} ?\n\nSes événements et sa liste « à chercher » seront effacés. Les autres personnes restent dans l’arbre, mais ne seront plus reliées à elle.`)) return;
    if (await supprimerPersonne(id)) go(lienArbre(treeId));
  }
</script>

{#snippet ligne(p: Personne, extra = '', badge = '')}
  <a class="ligne-p" href={lienPersonne(treeId, p.id)}>
    <Avatar {p} taille={34} />
    <span class="t"><b>{nomComplet(p)}</b><small>{[vieCourte(D, p.id), extra].filter(Boolean).join(' · ')}</small></span>
    {#if badge}<span class="badge">{badge}</span>{/if}
    <Icon name="chevronRight" size={16} />
  </a>
{/snippet}

{#if v?.p.masked}
  <nav class="fil"><a href={lienArbre(treeId)}><Icon name="back" size={16} /> {tree?.name}</a></nav>
  <div class="card empty-state">
    <span class="cadenas" aria-hidden="true"><Icon name="lock" size={26} /></span>
    <strong>Personne vivante</strong>
    <p class="muted">Pour protéger sa vie privée, les informations des personnes vivantes ne sont pas montrées aux lecteurs de cet arbre.</p>
    <a class="btn" href={lienCentre(treeId, id)}><Icon name="arbre" size={16} /> Voir sa place dans l’arbre</a>
  </div>
{:else if !v}
  <div class="card empty-state">
    <strong>Personne introuvable</strong>
    <p class="muted">Elle a peut-être été supprimée.</p>
    <a class="btn" href={lienArbre(treeId)}>Retour à l’arbre</a>
  </div>
{:else}
  <nav class="fil"><a href={lienArbre(treeId)}><Icon name="back" size={16} /> {tree?.name}</a></nav>

  <article class="fiche">
    <header class="card hero">
      <div class="bandeau" data-sexe={v.p.sex}></div>
      <div class="corps">
        <Avatar p={v.p} taille={96} />
        <div class="t">
          <h1 class="titre">{nomComplet(v.p)}</h1>
          {#if sousTitre}<p class="muted">{sousTitre}</p>{/if}
          <p class="badges">
            {#if estRacine}<span class="badge badge-accent"><Icon name="star" size={13} /> Personne racine</span>{/if}
            {#if v.p.living}<span class="badge">{accord(v.p, 'Vivant', 'Vivante')}</span>{/if}
          </p>
        </div>
        <div class="actions">
          <a class="btn" href={lienCentre(treeId, id)}><Icon name="arbre" size={16} /> Voir dans l’arbre</a>
          <button class="btn" onclick={() => (ui.parente = { a: id })} title="Lien de parenté avec une autre personne"><Icon name="link" size={16} /> Parenté</button>
          {#if peutModifier}
            <button class="btn btn-primary" onclick={() => (ui.personne = { personId: id })}><Icon name="edit" size={16} /> Modifier</button>
          {/if}
          <!-- Menu « ⋯ » : carte et PDF pour tous ; racine, événement et suppression pour qui peut modifier -->
          <Menu actions={[
            ...(peutModifier ? [
              estRacine
                ? { label: 'Ne plus être la personne racine', icon: 'star', onclick: () => definirRacine(null) }
                : { label: 'Définir comme personne racine', icon: 'star', onclick: () => definirRacine(id) },
              { label: 'Ajouter un événement', icon: 'calendrier', onclick: () => (ui.evenement = { person_id: id }) },
            ] : []),
            { label: 'Ses lieux sur la carte', icon: 'carte', onclick: () => go(lienCarte(treeId, id)) },
            { label: 'Imprimer la fiche (PDF)', icon: 'telecharger', onclick: () => go(lienImpression(treeId, id, 'fiche')) },
            { label: 'Ascendance en éventail (PDF)', icon: 'eventail', onclick: () => go(lienImpression(treeId, id, 'ascendance')) },
            { label: 'Descendance (PDF)', icon: 'liste', onclick: () => go(lienImpression(treeId, id, 'descendance')) },
            ...(peutModifier ? [{ label: 'Supprimer cette personne', icon: 'trash', danger: true, onclick: supprimer }] : []),
          ]} />
        </div>
      </div>
    </header>

    <div class="tuiles">
      <div class="card tuile">
        <small><Icon name="naissance" size={14} /> {accord(v.p, 'Né', 'Née')}
          {#if v.n && estApproximative(v.n)}<span class="badge badge-warn" title="Date approximative ou incomplète">≈</span>{/if}</small>
        <b>{v.n?.date_text ? afficherDate(v.n) : '—'}</b>
        <span>{v.n ? nomLieu(D, v.n.place_id) : ''}</span>
      </div>
      <div class="card tuile">
        {#if v.p.living}
          <small><Icon name="deces" size={14} /> Décès</small><b>{accord(v.p, 'Vivant', 'Vivante')}</b><span></span>
        {:else}
          <small><Icon name="deces" size={14} /> {accord(v.p, 'Décédé', 'Décédée')}
            {#if v.d && estApproximative(v.d)}<span class="badge badge-warn" title="Date approximative ou incomplète">≈</span>{/if}</small>
          <b>{v.d?.date_text ? afficherDate(v.d) : '—'}</b>
          <span>{v.d ? nomLieu(D, v.d.place_id) : ''}</span>
        {/if}
      </div>
      <div class="card tuile">
        <small><Icon name="calendrier" size={14} /> {v.p.living ? 'Âge' : 'Âge au décès'}</small>
        <b>{v.age || '—'}</b>
        <span>{v.age ? '' : 'Dates à compléter'}</span>
      </div>
      {#if v.sosa.length}
        <div class="card tuile">
          <small><Icon name="star" size={14} /> Sosa</small>
          <b>{v.sosa.join(' et ')}</b>
          <span>{generationSosa(v.sosa[0]) === 1 ? 'personne racine' : `génération ${generationSosa(v.sosa[0])}${v.sosa.length > 1 ? ' · implexe' : ''}`}</span>
        </div>
      {/if}
    </div>

    {#if v.alertes.length}
      <div class="alertes" role="note">
        <Icon name="alert" size={18} />
        <div>
          <b>{v.alertes.length > 1 ? `${v.alertes.length} points à vérifier` : 'Un point à vérifier'}</b>
          <ul>
            {#each v.alertes as a}
              <li>{a.message}{#if a.autre} · <a href={lienPersonne(treeId, a.autre)}>voir la fiche</a>{/if}</li>
            {/each}
          </ul>
        </div>
      </div>
    {/if}

    <div class="grille-fiche">
      <div class="colonne">
        <section class="card card-pad">
          <div class="card-head">
            <h2 class="card-title">Chronologie <span class="n">{v.chrono.length}</span></h2>
            {#if peutModifier}<button class="btn btn-sm" onclick={() => (ui.evenement = { person_id: id })}><Icon name="plus" size={15} /> Événement</button>{/if}
          </div>
          {#if !v.chrono.length}
            <p class="muted small">Aucun événement. Ajoutez une naissance, un mariage, une résidence, un service militaire…</p>
          {:else}
            <ol class="chrono">
              {#each v.chrono as l (l.cle)}
                <li>
                  <span class="pastille" data-icone={l.icone}><Icon name={l.icone} size={17} /></span>
                  <span class="quoi">
                    {#if l.evenement && peutModifier}
                      <button class="titre-ev" onclick={() => (ui.evenement = { id: l.evenement!.id })}>{l.titre}</button>
                    {:else}
                      <b>{l.titre}</b>
                    {/if}
                    {#if l.lieu}<span class="q"><Icon name="lieu" size={12} /> {l.lieu}</span>{/if}
                    {#if l.evenement}
                      {@const ns = (D.citationsCible.get(`e:${l.evenement.id}`) ?? []).length}
                      {@const nd = (D.mediasCible.get(`e:${l.evenement.id}`) ?? []).length}
                      {#if ns || nd}<span class="q">{#if ns}<Icon name="sources" size={12} /> {ns} source{ns > 1 ? 's' : ''}{/if}{#if ns && nd} · {/if}{#if nd}<Icon name="trombone" size={12} /> {nd} document{nd > 1 ? 's' : ''}{/if}</span>{/if}
                    {/if}
                    {#if l.texte}
                      <p>{#if l.lien}<a href={lienPersonne(treeId, l.lien)}>{l.texte}</a>{:else}{l.texte}{/if}</p>
                    {/if}
                  </span>
                  <span class="date">{l.date || 'date inconnue'}{#if l.approx && l.date}<br /><span class="badge badge-warn">approx.</span>{/if}</span>
                </li>
              {/each}
            </ol>
          {/if}
        </section>

        <section class="card card-pad">
          <div class="card-head"><h2 class="card-title">Photos et documents {#if v.nbDocs}<span class="n">{v.nbDocs}</span>{/if}</h2></div>
          <Galerie cible={{ person_id: id }} {peutModifier} photoPour={id} />
        </section>

        <section class="card card-pad">
          <div class="card-head"><h2 class="card-title">Sources {#if v.nbSources}<span class="n">{v.nbSources}</span>{/if}</h2></div>
          <SourcesBloc cible={{ person_id: id }} {peutModifier} />
        </section>

        {#if v.p.notes}
          <section class="card card-pad">
            <div class="card-head"><h2 class="card-title">Notes</h2></div>
            <p class="notes">{v.p.notes}</p>
          </section>
        {/if}
      </div>

      <div class="colonne">
        <section class="card card-pad famille">
          <div class="card-head"><h2 class="card-title">Famille</h2></div>

          <h4>Parents</h4>
          {#each v.parents.liste as p (p.id)}
            {@render ligne(p, '', roleParent(p))}
          {/each}
          {#if v.parents.lien && v.parents.lien.relation === 'adopted'}<p class="muted small">Lien adoptif</p>{/if}
          {#if peutModifier}
            <div class="ajouts-ligne">
              {#if v.parents.liste.length < 2}
                <button class="btn btn-ghost btn-sm ajout" onclick={() => ajouter('parent')}><Icon name="plus" size={15} /> Ajouter un parent</button>
              {/if}
              {#if v.parents.liste.length}
                <button class="btn btn-ghost btn-sm ajout" onclick={() => (ui.parents = { childId: id })}><Icon name="edit" size={15} /> Changer les parents</button>
              {/if}
            </div>
          {:else if !v.parents.liste.length}
            <p class="muted small">Parents inconnus</p>
          {/if}

          {#if v.fratrie.length}
            <h4>Frères et sœurs</h4>
            {#each v.fratrie as f (f.p.id)}
              {@render ligne(f.p, f.demi && f.commun ? `même ${roleParent(f.commun).toLowerCase()}` : '', f.demi ? accord(f.p, 'demi-frère', 'demi-sœur') : '')}
            {/each}
          {/if}

          {#each v.unions as u, i (u.union.id)}
            {@const fin = texteFin(D, u.union, id)}
            <h4>
              {v.unions.length > 1 ? `${rangUnion(i)} · ` : ''}{u.conjoint ? accord(u.conjoint, 'Conjoint', 'Conjointe') : 'Union'}
              {#if u.union.hidden}<span class="badge" title="Les lecteurs de l’arbre ne voient pas cette union"><Icon name="lock" size={12} /> cachée</span>{/if}
            </h4>
            {#if u.conjoint}
              {@render ligne(u.conjoint)}
            {:else}
              <p class="muted small">Autre parent inconnu</p>
            {/if}
            <a class="union" href={lienUnion(treeId, u.union.id)}>
              <Icon name="mariage" size={14} />
              {libelleUnion(u.union)}{u.mariage?.date_text ? ` · ${afficherDate(u.mariage)}` : ''}{u.mariage?.place_id ? `, ${nomLieu(D, u.mariage.place_id)}` : ''}
              {#if fin}<span class="fin">{fin}</span>{/if}
              <Icon name="chevronRight" size={14} />
            </a>
            {#if u.enfants.length}
              <div class="enfants">
                {#each u.enfants as e (e.p.id)}
                  {@render ligne(e.p, '', e.lien.relation === 'adopted' ? 'adopté' : '')}
                {/each}
              </div>
            {/if}
            {#if peutModifier}
              <button class="btn btn-ghost btn-sm ajout" onclick={() => ajouter('enfant', u.union.id)}><Icon name="plus" size={15} /> Ajouter un enfant{u.conjoint ? ` avec ${nomCourt(u.conjoint)}` : ''}</button>
            {/if}
          {/each}

          {#if peutModifier}
            <div class="ajouts">
              <button class="btn btn-sm" onclick={() => ajouter('conjoint')}><Icon name="plus" size={15} /> Conjoint</button>
              {#if !v.unions.length}<button class="btn btn-sm" onclick={() => ajouter('enfant')}><Icon name="plus" size={15} /> Enfant</button>{/if}
            </div>
          {/if}
        </section>

        {#if v.allies.groupes.length || (peutModifier && v.allies.manquants.length)}
          <section class="card card-pad famille">
            <div class="card-head"><h2 class="card-title">Belle-famille</h2></div>
            {#each v.allies.groupes as g (g.titre)}
              <h4>{g.titre}</h4>
              {#each g.liste as a (a.p.id)}
                {@render ligne(a.p, `${a.role} · par ${nomCourt(a.via)}`)}
              {/each}
            {/each}
            {#if peutModifier && v.allies.manquants.length}
              <div class="ajouts">
                {#each v.allies.manquants as c (c.id)}
                  {@const connus = parents(D, c.id).liste}
                  {#if !connus.some((p) => p.sex === 'M')}
                    <button class="btn btn-sm" onclick={() => (ui.personne = { relation: { type: 'parent', of: c.id }, sexe: 'M' })}><Icon name="plus" size={15} /> Père de {nomCourt(c)}</button>
                  {/if}
                  {#if !connus.some((p) => p.sex === 'F') && connus.length < 2}
                    <button class="btn btn-sm" onclick={() => (ui.personne = { relation: { type: 'parent', of: c.id }, sexe: 'F' })}><Icon name="plus" size={15} /> Mère de {nomCourt(c)}</button>
                  {/if}
                {/each}
              </div>
            {/if}
          </section>
        {/if}

        <section class="card card-pad">
          <div class="card-head"><h2 class="card-title">À chercher {#if v.todos.some((t) => !t.done)}<span class="n">{v.todos.filter((t) => !t.done).length}</span>{/if}</h2></div>
          {#if v.todos.length}
            <ul class="todo">
              {#each v.todos as t (t.id)}
                <li class:fait={t.done}>
                  <button class="coche" aria-label={t.done ? 'Marquer à faire' : 'Marquer comme trouvé'} aria-pressed={!!t.done} disabled={!peutModifier} onclick={() => basculerATrouver(t)}>
                    <Icon name="check" size={13} />
                  </button>
                  <span>{t.text}</span>
                  {#if peutModifier}<button class="btn btn-ghost btn-sm btn-icon" aria-label="Retirer" onclick={() => supprimerATrouver(t.id)}><Icon name="x" size={14} /></button>{/if}
                </li>
              {/each}
            </ul>
          {:else}
            <p class="muted small">Notez ici les pistes à creuser : actes à trouver, archives à consulter…</p>
          {/if}
          {#if peutModifier}
            <form class="ajout-todo" onsubmit={ajouterTodo}>
              <input class="input" placeholder="Ex. acte de naissance à Saint-Flour" aria-label="Nouvelle piste à chercher" bind:value={nouveauTodo} />
              <button class="btn" type="submit" disabled={!nouveauTodo.trim() || app.busy}><Icon name="plus" size={16} /></button>
            </form>
          {/if}
        </section>
      </div>
    </div>
  </article>
{/if}

<style>
  .fil { margin: -8px 0 14px; }
  .cadenas { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 14px; background: var(--surface-2); color: var(--text-3); margin-bottom: 8px; }
  .fil a { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; font-weight: 550; color: var(--text-2); }

  .hero { overflow: hidden; }
  .bandeau { height: 92px; background: linear-gradient(120deg, var(--accent-soft), color-mix(in srgb, var(--accent-soft) 40%, var(--surface)) 60%, var(--surface-2)); }
  .bandeau[data-sexe='M'] { background: linear-gradient(120deg, var(--accent-soft), var(--homme-soft) 65%, var(--surface-2)); }
  .bandeau[data-sexe='F'] { background: linear-gradient(120deg, var(--accent-soft), var(--femme-soft) 65%, var(--surface-2)); }
  .corps { display: flex; align-items: flex-end; gap: 20px; padding: 0 24px 22px; margin-top: -48px; }
  .corps :global(.avatar) { box-shadow: 0 0 0 4px var(--surface), var(--shadow-lg) !important; }
  .corps .t { flex: 1; min-width: 0; }
  h1 { font-size: 30px; line-height: 1.15; }
  .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .badges:empty { display: none; }
  .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }

  .tuiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-top: 16px; }
  .alertes { display: flex; gap: 12px; margin-top: 12px; padding: 14px 16px; border-radius: var(--radius); background: var(--warn-soft); font-size: 14px; }
  .alertes > :global(svg) { color: var(--warn); margin-top: 1px; }
  .alertes ul { margin: 4px 0 0; padding-left: 18px; color: var(--text-2); }
  .alertes a { font-weight: 600; }
  .tuile { padding: 14px 16px; }
  .tuile small { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--text-3); }
  .tuile small .badge { height: 20px; margin-left: auto; }
  .tuile b { display: block; font-size: 18px; font-weight: 650; margin: 4px 0 1px; }
  .tuile span { font-size: 13px; color: var(--text-2); }

  .grille-fiche { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; margin-top: 16px; }
  .colonne { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .card-title .n { font-size: 12px; font-weight: 600; color: var(--text-3); background: var(--surface-2); padding: 1px 7px; border-radius: 99px; margin-left: 4px; }

  .chrono { list-style: none; margin: 0; padding: 0; }
  .chrono li { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 12px; padding: 10px 0; position: relative; }
  .chrono li:not(:last-child)::before { content: ''; position: absolute; left: 17px; top: 46px; bottom: -10px; width: 2px; background: var(--surface-2); }
  .pastille { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--surface-2); color: var(--text-2); }
  .pastille[data-icone='naissance'], .pastille[data-icone='bapteme'] { background: var(--pos-soft); color: var(--pos); }
  .pastille[data-icone='mariage'] { background: var(--femme-soft); color: var(--femme); }
  .pastille[data-icone='enfant'] { background: var(--accent-soft); color: var(--accent-text); }
  .quoi { min-width: 0; }
  .quoi b, .titre-ev { font-weight: 600; font-size: 14px; }
  .titre-ev { padding: 0; border: 0; background: none; font: inherit; font-weight: 600; font-size: 14px; color: var(--text); cursor: pointer; text-align: left; }
  .titre-ev:hover { color: var(--accent-text); text-decoration: underline; }
  .q { display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--text-3); }
  .quoi p { font-size: 13.5px; color: var(--text-2); margin-top: 2px; white-space: pre-line; }
  .date { font-size: 13px; font-weight: 600; color: var(--text-2); text-align: right; white-space: nowrap; }
  .date .badge { height: 20px; font-size: 11px; margin-top: 4px; }

  .notes { white-space: pre-line; font-size: 14px; color: var(--text-2); }

  .famille h4 { margin: 16px 0 4px; font-size: 11.5px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); }
  .famille h4:first-of-type { margin-top: 0; }
  .ligne-p { display: flex; align-items: center; gap: 12px; padding: 7px 8px; margin: 0 -8px; border-radius: 10px; color: var(--text); text-decoration: none; }
  .ligne-p:hover { background: var(--surface-2); text-decoration: none; }
  .ligne-p .t { flex: 1; min-width: 0; line-height: 1.3; }
  .ligne-p b { display: block; font-weight: 600; font-size: 14px; }
  .ligne-p small { color: var(--text-3); font-size: 12.5px; }
  .ligne-p :global(svg) { color: var(--text-3); }
  .union { display: flex; align-items: center; gap: 6px; margin: 2px 0 4px 46px; font-size: 12.5px; color: var(--text-2); }
  .enfants { margin-left: 22px; padding-left: 12px; border-left: 2px solid var(--surface-2); }
  .ajout { margin: 2px 0 0 -8px; color: var(--accent-text); }
  .union .fin { padding: 1px 7px; border-radius: 99px; background: var(--surface-2); color: var(--text-2); font-size: 11.5px; font-weight: 600; }
  .ajouts-ligne { display: flex; flex-wrap: wrap; gap: 4px; }
  h4 .badge { display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; vertical-align: middle; text-transform: none; letter-spacing: 0; }
  .ajouts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }

  .todo { list-style: none; margin: 0 0 12px; padding: 0; }
  .todo li { display: flex; gap: 10px; align-items: center; padding: 5px 0; font-size: 14px; }
  .todo li span { flex: 1; }
  .todo li.fait span { text-decoration: line-through; color: var(--text-3); }
  .coche { flex: none; width: 22px; height: 22px; display: grid; place-items: center; border: 1.5px solid var(--border-strong); border-radius: 6px; background: var(--surface); padding: 0; cursor: pointer; color: transparent; }
  .fait .coche { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .ajout-todo { display: flex; gap: 8px; }

  @media (max-width: 1100px) {
    .grille-fiche { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 640px) {
    .hero { border-radius: var(--radius-lg); }
    .bandeau { height: 70px; }
    .corps { flex-direction: column; align-items: center; text-align: center; gap: 10px; padding: 0 16px 18px; }
    .badges { justify-content: center; }
    h1 { font-size: 25px; }
    .actions { width: 100%; }
    .actions .btn-primary { flex: 1; }
    .tuiles { grid-template-columns: 1fr 1fr; gap: 8px; }
    .tuiles .tuile:nth-child(3):last-child { grid-column: 1 / -1; }
    .tuile b { font-size: 16px; }
    .chrono li { grid-template-columns: 36px minmax(0, 1fr); }
    .date { grid-column: 2; grid-row: 1; text-align: left; font-weight: 500; color: var(--text-3); }
    .quoi { grid-column: 2; }
  }
</style>
