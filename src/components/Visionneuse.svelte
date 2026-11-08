<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { arbre, D, definirPhoto, delierMedia, modifierMedia, supprimerMedia, urlFichier, type Cible, type Media, type MediaLien } from '../lib/arbre.svelte';
  import { nomCourt } from '../lib/genealogie';
  import { taille } from '../lib/images';
  import { TYPES_EVENEMENT } from '../../commun/libelles';

  // Visionneuse plein écran : photo ou PDF, flèches pour passer au suivant,
  // titre / date / description modifiables, rattachements, photo principale.
  let {
    docs, index = $bindable(), cible, peutModifier, photoPour, onclose,
  }: { docs: Media[]; index: number | null; cible: Cible; peutModifier: boolean; photoPour?: string; onclose: () => void } = $props();

  const m = $derived(docs[index ?? 0]);
  const estImage = $derived(m?.mime.startsWith('image/'));
  let edition = $state(false);
  let f = $state({ title: '', date_text: '', description: '' });

  const liens = $derived.by(() => {
    arbre.version;
    return (D.liensMedia.get(m?.id ?? '') ?? []).map(libelleLien);
  });
  function libelleLien(l: MediaLien) {
    if (l.person_id) return nomCourt(D.personnes.get(l.person_id));
    if (l.family_id) {
      const u = D.unions.get(l.family_id);
      return `Union ${[u?.partner1_id, u?.partner2_id].map((x) => (x ? nomCourt(D.personnes.get(x)) : '?')).join(' & ')}`;
    }
    const e = D.evenements.get(l.event_id!);
    const qui = e?.person_id ? nomCourt(D.personnes.get(e.person_id)) : '';
    return `${e ? TYPES_EVENEMENT[e.type] : 'Événement'}${qui ? ` de ${qui}` : ''}`;
  }

  const estPhotoPrincipale = $derived(!!photoPour && D.personnes.get(photoPour)?.photo_media_id === m?.id);

  function aller(pas: number) {
    if (index === null) return;
    edition = false;
    index = (index + pas + docs.length) % docs.length;
  }
  function commencerEdition() {
    f = { title: m.title, date_text: m.date_text, description: m.description };
    edition = true;
  }
  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    if (await modifierMedia(m.id, f)) edition = false;
  }
  async function detacher() {
    const reste = (D.liensMedia.get(m.id) ?? []).length;
    if (reste <= 1) return supprimer();
    if (confirm('Retirer ce document de cette fiche ? Il reste rattaché aux autres.') && (await delierMedia(m.id, cible))) onclose();
  }
  async function supprimer() {
    if (confirm(`Supprimer définitivement « ${m.title || 'ce document'} » ?\n\nLe fichier sera effacé de toutes les fiches où il apparaît.`) && (await supprimerMedia(m.id))) onclose();
  }

  onMount(() => {
    const clavier = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if (e.key === 'Escape') onclose();
      else if (e.key === 'ArrowRight') aller(1);
      else if (e.key === 'ArrowLeft') aller(-1);
    };
    window.addEventListener('keydown', clavier);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', clavier); document.body.style.overflow = prev; };
  });
</script>

<div class="visionneuse" role="dialog" aria-modal="true" aria-label={m?.title || 'Document'}>
  <div class="scene">
    {#key m.id}
      {#if estImage}
        <img src={urlFichier(m.id)} alt={m.title} />
      {:else}
        <iframe src={urlFichier(m.id)} title={m.title || 'Document PDF'}></iframe>
      {/if}
    {/key}
    {#if docs.length > 1}
      <button class="fleche gauche" aria-label="Document précédent" onclick={() => aller(-1)}><Icon name="back" size={22} /></button>
      <button class="fleche droite" aria-label="Document suivant" onclick={() => aller(1)}><Icon name="chevronRight" size={22} /></button>
    {/if}
    <button class="fermer" aria-label="Fermer" onclick={onclose}><Icon name="x" size={22} /></button>
  </div>

  <aside class="infos">
    {#if edition}
      <form class="form-section" onsubmit={enregistrer}>
        <label class="field"><span>Titre</span><input class="input" bind:value={f.title} /></label>
        <label class="field"><span>Date</span><input class="input" placeholder="Ex. vers 1920" bind:value={f.date_text} /></label>
        <label class="field"><span>Description</span><textarea class="input" rows="4" bind:value={f.description}></textarea></label>
        <div class="boutons"><button class="btn" type="button" onclick={() => (edition = false)}>Annuler</button><button class="btn btn-primary" type="submit">Enregistrer</button></div>
      </form>
    {:else}
      <div class="tete">
        <div>
          <h2 class="titre">{m.title || 'Sans titre'}</h2>
          <p class="muted small">{[m.date_text, estImage ? 'Photo' : 'PDF', taille(m.size)].filter(Boolean).join(' · ')}{docs.length > 1 ? ` · ${(index ?? 0) + 1}/${docs.length}` : ''}</p>
        </div>
        {#if peutModifier}<button class="btn btn-ghost btn-sm btn-icon" aria-label="Modifier le titre, la date, la description" onclick={commencerEdition}><Icon name="edit" size={16} /></button>{/if}
      </div>
      {#if m.description}<p class="description">{m.description}</p>{/if}
      {#if liens.length}
        <p class="small muted">Rattaché à : {liens.join(', ')}</p>
      {/if}
      <div class="actions">
        <a class="btn btn-sm" href="{urlFichier(m.id)}?telecharger" download><Icon name="telecharger" size={15} /> Télécharger</a>
        {#if peutModifier && photoPour && estImage}
          {#if estPhotoPrincipale}
            <button class="btn btn-sm" onclick={() => definirPhoto(photoPour, null)}><Icon name="star" size={15} /> Ne plus utiliser comme photo</button>
          {:else}
            <button class="btn btn-sm" onclick={() => definirPhoto(photoPour, m.id)}><Icon name="star" size={15} /> Photo principale</button>
          {/if}
        {/if}
        {#if peutModifier}
          <button class="btn btn-sm btn-danger" onclick={detacher}><Icon name="trash" size={15} /> {liens.length > 1 ? 'Retirer de cette fiche' : 'Supprimer'}</button>
        {/if}
      </div>
    {/if}
  </aside>
</div>

<style>
  .visionneuse { position: fixed; inset: 0; z-index: 60; display: grid; grid-template-columns: minmax(0, 1fr) 340px; background: rgb(10 14 11 / 0.94); animation: fade 180ms ease-out; }
  .scene { position: relative; display: grid; place-items: center; min-height: 0; padding: 24px; }
  .scene img { max-width: 100%; max-height: calc(100dvh - 48px); object-fit: contain; border-radius: 6px; box-shadow: 0 20px 60px rgb(0 0 0 / 0.5); }
  .scene iframe { width: 100%; height: calc(100dvh - 48px); border: 0; border-radius: 8px; background: #fff; }
  .fleche, .fermer {
    position: absolute; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; border: 0;
    background: rgb(255 255 255 / 0.12); color: #fff; cursor: pointer; backdrop-filter: blur(6px);
  }
  .fleche:hover, .fermer:hover { background: rgb(255 255 255 / 0.25); }
  .fleche { top: 50%; translate: 0 -50%; }
  .gauche { left: 16px; }
  .droite { right: 16px; }
  .fermer { top: 16px; right: 16px; }
  .infos { display: flex; flex-direction: column; gap: 14px; padding: 24px 20px; background: var(--surface); overflow-y: auto; }
  .tete { display: flex; align-items: flex-start; gap: 8px; }
  .tete > div { flex: 1; min-width: 0; }
  h2 { font-size: 21px; line-height: 1.25; word-break: break-word; }
  .description { white-space: pre-line; font-size: 14px; color: var(--text-2); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .boutons { display: flex; gap: 8px; justify-content: flex-end; }
  @keyframes fade { from { opacity: 0; } }
  @media (max-width: 800px) {
    .visionneuse { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; }
    .scene { padding: 56px 8px 8px; }
    .scene img { max-height: calc(100dvh - 300px); }
    .scene iframe { height: calc(100dvh - 300px); }
    .infos { max-height: 45dvh; padding: 16px; border-radius: 18px 18px 0 0; padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
    .fleche { top: auto; bottom: 16px; translate: none; }
    .fermer { top: 8px; right: 8px; }
  }
</style>
