<script lang="ts">
  import Panneau from './Panneau.svelte';
  import Icon from './Icon.svelte';
  import DateSaisie from './DateSaisie.svelte';
  import LieuSaisie from './LieuSaisie.svelte';
  import ChoixPersonne from './ChoixPersonne.svelte';
  import { analyserDate, type Qualif } from '../../commun/dates';
  import { TYPES_UNION, type Sexe, type TypeUnion } from '../../commun/libelles';
  import { app, go, lienPersonne, toast } from '../lib/store.svelte';
  import { arbre, creerPersonne, D, lierExistant, modifierPersonne, ui, type PersonneSaisie, type RelationSaisie } from '../lib/arbre.svelte';
  import { accord, evenement, nomCourt, nomLieu, parents, unionsDe } from '../lib/genealogie';

  // Création ou modification d'une personne. Avec `relation`, la nouvelle personne
  // est aussitôt reliée (parent, conjoint ou enfant de quelqu'un).
  // sexe : choix déjà fait ailleurs (ex. case « Ajouter la mère » de la vue arbre)
  let { personId, relation, sexe }: { personId?: string; relation?: RelationSaisie; sexe?: Sexe } = $props();

  const existant = personId ? D.personnes.get(personId) : undefined;
  const of = relation ? D.personnes.get(relation.of) : undefined;
  const fermer = () => (ui.personne = null);

  // ----- Valeurs de départ -----
  const unionsOf = of ? unionsDe(D, of.id) : [];
  // « Avec qui ? » pour un enfant : une union de `of`, 'autre' (une autre personne de l'arbre)
  // ou 'nouvelle' (autre parent inconnu). Toujours affiché : avant, une union unique était prise d'office.
  const uniqueSansConjoint = unionsOf.some((u) => !u.conjoint);
  let unionChoisie = $state(relation?.family_id ?? (unionsOf.length === 1 ? unionsOf[0].union.id : unionsOf.length ? '' : 'nouvelle'));
  let autreParent = $state<string | null>(null);

  // Ajouter un parent : la mère (ou le père) est peut-être déjà en couple avec l'autre parent connu.
  // On propose ces personnes en un clic ; les autres conjoints restent des beaux-parents.
  const parentConnu = relation?.type === 'parent' && of ? parents(D, of.id).liste : [];
  const conjointsDuParent = parentConnu.length === 1
    ? unionsDe(D, parentConnu[0].id).map((u) => u.conjoint).filter((c): c is NonNullable<typeof c> => !!c && c.id !== of?.id)
    : [];
  let typeUnion = $state<TypeUnion>('marriage');

  function sexeParDefaut(): Sexe {
    if (existant) return existant.sex;
    if (sexe) return sexe;
    if (relation?.type === 'parent' && of) return parents(D, of.id).liste.some((p) => p.sex === 'M') ? 'F' : 'M';
    if (relation?.type === 'conjoint' && of) return of.sex === 'M' ? 'F' : of.sex === 'F' ? 'M' : 'U';
    return 'U';
  }
  /** Nom proposé : celui du père (de l'enfant ajouté, ou de l'enfant dont on ajoute le père). */
  function nomParDefaut(sexe: Sexe) {
    if (existant) return existant.surname;
    if (!of) return '';
    if (relation?.type === 'parent' && sexe === 'M') return of.surname;
    if (relation?.type === 'enfant') {
      if (of.sex === 'M') return of.surname;
      const u = unionsOf.find((x) => x.union.id === unionChoisie);
      if (u?.conjoint?.sex === 'M') return u.conjoint.surname;
    }
    return '';
  }

  const naiss = existant ? evenement(D, existant.id, 'birth') : undefined;
  const dec = existant ? evenement(D, existant.id, 'death') : undefined;

  let f = $state({
    given_names: existant?.given_names ?? '',
    surname: '',
    sex: sexeParDefaut(),
    living: !!existant?.living,
    married_name: existant?.married_name ?? '',
    nickname: existant?.nickname ?? '',
    occupations: existant?.occupations ?? '',
    notes: existant?.notes ?? '',
  });
  f.surname = nomParDefaut(f.sex);
  let n = $state({ qual: (naiss?.date_qual ?? 'exact') as Qualif, texte: naiss?.date_text ?? '', lieu: naiss ? nomLieu(D, naiss.place_id) : '' });
  let d = $state({ qual: (dec?.date_qual ?? 'exact') as Qualif, texte: dec?.date_text ?? '', lieu: dec ? nomLieu(D, dec.place_id) : '' });
  // « Plus de détails » ouvert d'office si un champ avancé est déjà rempli
  let details = $state(!!(f.married_name || f.nickname || f.occupations || f.notes));
  let mode = $state<'nouvelle' | 'existante'>('nouvelle');
  let choisie = $state<string | null>(null);

  const titre = existant
    ? `Modifier ${nomCourt(existant)}`
    : relation?.type === 'parent' ? `Ajouter un parent à ${nomCourt(of)}`
    : relation?.type === 'conjoint' ? `Ajouter un conjoint à ${nomCourt(of)}`
    : relation?.type === 'enfant' ? `Ajouter un enfant à ${nomCourt(of)}`
    : 'Nouvelle personne';

  const SEXES: { v: Sexe; label: string }[] = [{ v: 'M', label: 'Homme' }, { v: 'F', label: 'Femme' }, { v: 'U', label: 'Inconnu' }];

  /** Relation complétée avec les choix du formulaire (union de l'enfant, type d'union). */
  function relationFinale(): RelationSaisie | undefined {
    if (!relation) return undefined;
    if (relation.type === 'enfant') {
      if (unionChoisie === 'autre') return { ...relation, family_id: undefined, other_id: autreParent ?? undefined };
      return { ...relation, family_id: unionChoisie || undefined };
    }
    if (relation.type === 'conjoint') return { ...relation, union_type: typeUnion };
    return relation;
  }

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    if (relation?.type === 'enfant' && !unionChoisie) return toast('Choisissez l’autre parent de l’enfant', true);
    if (relation?.type === 'enfant' && unionChoisie === 'autre' && !autreParent) return toast('Cherchez l’autre parent dans l’arbre', true);
    if (mode === 'existante') {
      if (!choisie) return toast('Choisissez une personne dans la liste', true);
      if (await lierExistant(relationFinale()!, choisie)) fermer();
      return;
    }
    if (!f.given_names.trim() && !f.surname.trim()) return toast('Indiquez au moins un prénom ou un nom', true);
    try {
      analyserDate(n.qual, n.texte);
      if (!f.living) analyserDate(d.qual, d.texte);
    } catch (err) {
      return toast((err as Error).message, true);
    }
    const data: PersonneSaisie = {
      ...f,
      birth: { date_qual: n.qual, date_text: n.texte, place: n.lieu },
      ...(f.living ? {} : { death: { date_qual: d.qual, date_text: d.texte, place: d.lieu } }),
    };
    if (existant) {
      if (await modifierPersonne(existant.id, data)) fermer();
    } else {
      // Personne ajoutée seule (pas depuis une fiche) : on ouvrira sa fiche.
      // (À décider AVANT de fermer : une fois fermé, le formulaire n'a plus accès à ses réglages.)
      const ouvrirFiche = !relation;
      const id = await creerPersonne(data, relationFinale());
      if (!id) return;
      fermer();
      if (ouvrirFiche && arbre.treeId) go(lienPersonne(arbre.treeId, id));
    }
  }
</script>

<Panneau title={titre} subtitle={existant ? '' : 'Seuls le prénom ou le nom sont nécessaires.'} onclose={fermer}>
  <form id="form-personne" class="form" onsubmit={enregistrer}>
    {#if relation}
      <div class="segmented large" role="group" aria-label="Personne à relier">
        <button type="button" class:active={mode === 'nouvelle'} onclick={() => (mode = 'nouvelle')}>Nouvelle personne</button>
        <button type="button" class:active={mode === 'existante'} onclick={() => (mode = 'existante')}>Déjà dans l’arbre</button>
      </div>
    {/if}

    {#if relation?.type === 'enfant'}
      <div class="field">
        <span>Enfant de {nomCourt(of)} et de…</span>
        <select class="input" bind:value={unionChoisie} required>
          <option value="" disabled>Choisir l’autre parent</option>
          {#each unionsOf as u}
            <option value={u.union.id}>{u.conjoint ? nomCourt(u.conjoint) : 'autre parent inconnu'}</option>
          {/each}
          <option value="autre">Une autre personne déjà dans l’arbre…</option>
          {#if !uniqueSansConjoint}<option value="nouvelle">Autre parent inconnu (pas encore saisi)</option>{/if}
        </select>
        {#if unionChoisie === 'autre'}
          <div class="sous-choix"><ChoixPersonne exclure={[relation.of, ...unionsOf.map((u) => u.conjoint?.id ?? '')]} bind:choisie={autreParent} /></div>
        {/if}
      </div>
    {/if}
    {#if conjointsDuParent.length && mode === 'nouvelle'}
      <div class="raccourci">
        <p>{accord(of, 'Son', 'Sa', 'Son')} {f.sex === 'F' ? 'mère' : f.sex === 'M' ? 'père' : 'parent'} est peut-être déjà dans l’arbre :</p>
        <div class="boutons">
          {#each conjointsDuParent as c (c.id)}
            <button type="button" class="btn btn-sm" disabled={app.busy} onclick={async () => { if (await lierExistant(relation!, c.id)) fermer(); }}>
              C’est {nomCourt(c)}
            </button>
          {/each}
        </div>
        <p class="hint">Si {conjointsDuParent.length > 1 ? 'l’une de ces personnes' : nomCourt(conjointsDuParent[0])} est {accord(conjointsDuParent[0], 'le compagnon', 'la compagne')} de {nomCourt(parentConnu[0])} sans être {accord(conjointsDuParent[0], 'le père', 'la mère')} de {nomCourt(of)}, ne l’ajoutez pas ici : c’est {accord(conjointsDuParent[0], 'son beau-père', 'sa belle-mère')}, {accord(conjointsDuParent[0], 'il', 'elle')} apparaît déjà dans la rubrique « Belle-famille » de sa fiche.</p>
      </div>
    {/if}
    {#if relation?.type === 'conjoint'}
      <label class="field">
        <span>Type d’union</span>
        <select class="input" bind:value={typeUnion}>
          {#each Object.entries(TYPES_UNION) as [v, label]}<option value={v}>{v === 'unknown' ? 'Inconnu' : label}</option>{/each}
        </select>
        <span class="hint">La date et le lieu du mariage s’ajoutent ensuite depuis la fiche de l’union.</span>
      </label>
    {/if}

    {#if mode === 'existante'}
      <ChoixPersonne exclure={[relation!.of]} bind:choisie />
    {:else}
      <section class="groupe">
        <h3>Identité</h3>
        <div class="form-grid">
          <label class="field"><span>Prénoms</span><input class="input" autocomplete="off" bind:value={f.given_names} /></label>
          <label class="field"><span>Nom de naissance</span><input class="input" autocomplete="off" bind:value={f.surname} /></label>
          <div class="field full">
            <span>Sexe</span>
            <div class="segmented large" role="radiogroup" aria-label="Sexe">
              {#each SEXES as s}
                <button type="button" role="radio" aria-checked={f.sex === s.v} class:active={f.sex === s.v} onclick={() => (f.sex = s.v)}>{s.label}</button>
              {/each}
            </div>
          </div>
          <label class="case full">
            <input type="checkbox" bind:checked={f.living} />
            <span><strong>Personne vivante</strong><br /><span class="muted small">Elle sera masquée aux personnes à qui l’arbre est partagé en lecture.</span></span>
          </label>
        </div>
      </section>

      <section class="groupe">
        <h3><Icon name="naissance" size={15} /> Naissance</h3>
        <DateSaisie bind:qual={n.qual} bind:texte={n.texte} />
        <LieuSaisie bind:value={n.lieu} />
      </section>

      {#if !f.living}
        <section class="groupe">
          <h3><Icon name="deces" size={15} /> Décès</h3>
          <DateSaisie bind:qual={d.qual} bind:texte={d.texte} />
          <LieuSaisie bind:value={d.lieu} />
        </section>
      {/if}

      <section class="groupe">
        <button type="button" class="plus-details" aria-expanded={details} onclick={() => (details = !details)}>
          <span>Plus de détails <span class="muted small">(nom d’usage, surnom, professions, notes)</span></span>
          <Icon name="chevronDown" size={18} />
        </button>
        {#if details}
          <div class="form-grid">
            <label class="field"><span>Nom d’usage / marital</span><input class="input" bind:value={f.married_name} /></label>
            <label class="field"><span>Surnom</span><input class="input" bind:value={f.nickname} /></label>
            <label class="field full"><span>Professions</span><input class="input" placeholder="Forgeron, maréchal-ferrant" bind:value={f.occupations} /><span class="hint">Séparées par des virgules.</span></label>
            <label class="field full"><span>Notes</span><textarea class="input" rows="5" bind:value={f.notes}></textarea></label>
          </div>
        {/if}
      </section>
    {/if}
  </form>
  {#snippet footer()}
    <button class="btn" type="button" onclick={fermer}>Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-personne" disabled={app.busy}>
      <Icon name="check" size={16} /> {existant ? 'Enregistrer' : mode === 'existante' ? 'Relier' : 'Ajouter'}
    </button>
  {/snippet}
</Panneau>

<style>
  .form { display: flex; flex-direction: column; gap: 24px; }
  .groupe { display: flex; flex-direction: column; gap: 14px; }
  .sous-choix { margin-top: 8px; }
  .raccourci { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: var(--radius); background: var(--surface-2); font-size: 14px; }
  .raccourci p { margin: 0; }
  .raccourci .boutons { display: flex; flex-wrap: wrap; gap: 8px; }
  .groupe h3 { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  .segmented.large { display: flex; width: 100%; }
  .segmented.large button { flex: 1; }
  .case { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border-radius: var(--radius); background: var(--surface-2); cursor: pointer; font-size: 14px; }
  .case input { width: 20px; height: 20px; margin-top: 1px; accent-color: var(--accent); flex: none; }
  .plus-details {
    display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 12px 14px;
    border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface-2); font: inherit; font-weight: 600; font-size: 14px;
    color: var(--text-2); cursor: pointer; text-align: left;
  }
  .plus-details :global(svg) { transition: rotate var(--dur); }
  .plus-details[aria-expanded='true'] :global(svg) { rotate: 180deg; }
  @media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } }
</style>
