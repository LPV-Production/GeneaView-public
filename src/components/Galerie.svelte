<script lang="ts">
  import Icon from './Icon.svelte';
  import Visionneuse from './Visionneuse.svelte';
  import { toast } from '../lib/store.svelte';
  import { arbre, D, envoyerFichier, urlFichier, type Cible, type Media } from '../lib/arbre.svelte';
  import { cleCible } from '../lib/donnees';
  import { preparerFichier, taille } from '../lib/images';

  // Galerie des photos et documents d'une personne, d'une union ou d'un événement,
  // avec envoi (plusieurs fichiers à la fois) et visionneuse.
  let { cible, peutModifier, compact = false, photoPour }: { cible: Cible; peutModifier: boolean; compact?: boolean; photoPour?: string } = $props();

  const docs = $derived.by(() => {
    arbre.version;
    return (D.mediasCible.get(cleCible(cible)) ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  });

  let choix: HTMLInputElement | undefined = $state();
  let envois = $state<{ nom: string; etape: string; p: number; erreur?: string }[]>([]);
  let ouvert = $state<number | null>(null);

  async function envoyerTous(fichiers: FileList | null) {
    if (!fichiers?.length) return;
    const liste = [...fichiers];
    envois = [...envois, ...liste.map((f) => ({ nom: f.name, etape: 'En attente', p: 0 }))];
    const debut = envois.length - liste.length;
    // Un fichier après l'autre : plus doux pour les connexions mobiles
    for (const [i, f] of liste.entries()) {
      const e = envois[debut + i];
      try {
        e.etape = f.type === 'application/pdf' ? 'Préparation…' : 'Réduction de la photo…';
        const pret = await preparerFichier(f);
        e.etape = `Envoi (${taille(pret.fichier.size)})…`;
        await envoyerFichier(pret, cible, (p) => (e.p = p));
        e.etape = 'Envoyé';
        e.p = 1;
      } catch (err) {
        e.erreur = (err as Error).message;
      }
    }
    const erreurs = envois.filter((x) => x.erreur);
    if (erreurs.length) toast(`${erreurs.length} fichier(s) non envoyé(s) : ${erreurs[0].erreur}`, true);
    else toast(liste.length > 1 ? `${liste.length} documents ajoutés` : 'Document ajouté');
    // On garde les erreurs à l'écran, on retire les envois réussis
    setTimeout(() => (envois = envois.filter((x) => x.erreur)), 1500);
    if (choix) choix.value = '';
  }

  const estImage = (m: Media) => m.mime.startsWith('image/');
</script>

<div class="galerie" class:compact>
  {#if docs.length}
    <ul class="grille">
      {#each docs as m, i (m.id)}
        <li>
          <button class="doc" onclick={() => (ouvert = i)} title={m.title}>
            <span class="vignette" class:pdf={!estImage(m)}>
              {#if estImage(m)}
                <img src={urlFichier(m.id, 'thumb')} alt="" loading="lazy" decoding="async" />
              {:else}
                <Icon name="fichierPdf" size={30} /><span class="type">PDF</span>
              {/if}
            </span>
            {#if !compact}<b>{m.title || 'Sans titre'}</b><small>{m.date_text || (estImage(m) ? 'Photo' : 'PDF')}</small>{/if}
          </button>
        </li>
      {/each}
    </ul>
  {:else if !peutModifier}
    <p class="muted small">Aucun document.</p>
  {/if}

  {#if envois.length}
    <ul class="envois" aria-live="polite">
      {#each envois as e}
        <li class:erreur={e.erreur}>
          <span class="nom">{e.nom}</span>
          <span class="etape">{e.erreur ?? e.etape}</span>
          {#if !e.erreur}<span class="barre"><span style="width:{Math.round(e.p * 100)}%"></span></span>{/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if peutModifier}
    <input bind:this={choix} type="file" accept="image/*,application/pdf" multiple hidden onchange={(e) => envoyerTous((e.currentTarget as HTMLInputElement).files)} />
    <button class="btn btn-sm ajout" onclick={() => choix?.click()}>
      <Icon name="envoyer" size={15} /> {docs.length ? 'Ajouter' : 'Ajouter une photo ou un PDF'}
    </button>
    {#if !docs.length && !compact}<p class="muted small aide">Photos réduites automatiquement avant l’envoi · PDF jusqu’à 15 Mo.</p>{/if}
  {/if}
</div>

{#if ouvert !== null && docs[ouvert]}
  <Visionneuse {docs} bind:index={ouvert} {cible} {peutModifier} {photoPour} onclose={() => (ouvert = null)} />
{/if}

<style>
  .galerie { display: flex; flex-direction: column; gap: 12px; }
  .grille { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 12px; }
  .compact .grille { grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 8px; }
  .doc { display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 0; border: 0; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer; min-width: 0; }
  .vignette { position: relative; aspect-ratio: 1; display: grid; place-items: center; border-radius: 12px; overflow: hidden; background: var(--surface-2); color: var(--text-3); border: 1px solid var(--border); transition: border-color var(--dur-fast); }
  .doc:hover .vignette { border-color: var(--accent); }
  .vignette img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .vignette.pdf { background: var(--neg-soft); color: var(--neg); }
  .type { position: absolute; left: 6px; bottom: 6px; padding: 1px 6px; border-radius: 6px; font-size: 10px; font-weight: 700; background: var(--neg); color: #fff; }
  .doc b { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .doc small { font-size: 11.5px; color: var(--text-3); margin-top: -4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ajout { align-self: flex-start; }
  .aide { margin-top: -6px; }
  .envois { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .envois li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; padding: 8px 10px; border-radius: 10px; background: var(--surface-2); font-size: 13px; }
  .envois li.erreur { background: var(--neg-soft); color: var(--neg); }
  .envois .nom { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .envois .etape { color: var(--text-3); }
  .envois .erreur .etape { color: inherit; grid-column: 1 / -1; }
  .barre { grid-column: 1 / -1; height: 4px; border-radius: 4px; background: var(--border); overflow: hidden; }
  .barre span { display: block; height: 100%; background: var(--accent); transition: width 200ms; }
</style>
