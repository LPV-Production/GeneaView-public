<script lang="ts">
  import Modal from './Modal.svelte';
  import Icon from './Icon.svelte';
  import { api } from '../lib/api';
  import { app, go, lienArbre, toast, type Arbre } from '../lib/store.svelte';
  import { lireGedcom, type ResultatImport } from '../lib/gedcom';
  import { envoyerImport } from '../lib/importer';

  // Import d'un fichier GEDCOM dans un NOUVEL arbre :
  // 1. choix du fichier, lu dans le navigateur ; 2. résumé ; 3. création et envoi par lots.
  let { onclose }: { onclose: () => void } = $props();

  let etape = $state<'choix' | 'resume' | 'envoi'>('choix');
  let erreur = $state('');
  let resultat = $state<ResultatImport | null>(null);
  let nom = $state('');
  let avancement = $state(0);
  let enCours = $state(false);

  async function lire(fichiers: FileList | null) {
    const f = fichiers?.[0];
    if (!f) return;
    erreur = '';
    if (f.size > 50 * 1024 * 1024) { erreur = 'Fichier trop gros (50 Mo maximum).'; return; }
    try {
      resultat = lireGedcom(new Uint8Array(await f.arrayBuffer()));
      nom = resultat.nomArbre === 'Arbre importé' ? f.name.replace(/\.ged$/i, '') : resultat.nomArbre.replace(/[_-]+/g, ' ');
      if (!resultat.lignes.persons.length) { erreur = 'Ce fichier ne contient aucune personne.'; return; }
      etape = 'resume';
    } catch (e) {
      erreur = (e as Error).message;
    }
  }

  async function importer() {
    if (!resultat || enCours) return;
    enCours = true;
    etape = 'envoi';
    let arbre: Arbre | null = null;
    try {
      arbre = await api<Arbre>('POST', '/trees', { name: nom.trim() || 'Arbre importé', description: `Importé d’un fichier GEDCOM (${resultat.logiciel}) le ${new Date().toLocaleDateString('fr-FR')}` });
      const { refusees } = await envoyerImport(
        resultat.lignes,
        (table, rows) => api('POST', `/trees/${arbre!.id}/import`, { table, rows }),
        (fait, total) => (avancement = total ? fait / total : 1),
      );
      // La première personne du fichier devient la personne racine (Sosa 1), comme dans la plupart des logiciels
      if (resultat.premiereRef) await api('PUT', `/trees/${arbre.id}/root`, { person_id: resultat.premiereRef }).catch(() => {});
      const frais = await api<Arbre>('GET', `/trees/${arbre.id}`);
      app.arbres = [frais, ...app.arbres];
      toast(refusees ? `Arbre importé, ${refusees} élément(s) ignoré(s)` : `Arbre « ${frais.name} » importé`);
      onclose();
      go(lienArbre(frais.id));
    } catch (e) {
      // En cas d'échec, on supprime l'arbre à moitié rempli
      if (arbre) await api('DELETE', `/trees/${arbre.id}`).catch(() => {});
      erreur = `L’import a échoué : ${(e as Error).message}. Rien n’a été conservé, vous pouvez réessayer.`;
      etape = 'resume';
    } finally {
      enCours = false;
    }
  }

  const L = $derived(resultat?.lignes);
</script>

<Modal title="Importer un fichier GEDCOM" subtitle="Le fichier crée un nouvel arbre ; vos arbres existants ne sont pas modifiés." onclose={() => !enCours && onclose()}>
  {#if etape === 'choix'}
    <label class="depot">
      <Icon name="importer" size={28} />
      <b>Choisir un fichier .ged</b>
      <span class="muted small">Exporté depuis Geneanet, Heredis, MyHeritage, Ancestry, Gramps…</span>
      <input type="file" accept=".ged,.gedcom,text/plain" onchange={(e) => lire((e.currentTarget as HTMLInputElement).files)} />
    </label>
  {:else if etape === 'resume' && L && resultat}
    <div class="resume">
      <div class="chiffres">
        <div><b>{L.persons.length.toLocaleString('fr-FR')}</b><span>personnes</span></div>
        <div><b>{L.families.length.toLocaleString('fr-FR')}</b><span>unions</span></div>
        <div><b>{L.events.length.toLocaleString('fr-FR')}</b><span>événements</span></div>
        <div><b>{L.places.length.toLocaleString('fr-FR')}</b><span>lieux</span></div>
        <div><b>{L.sources.length.toLocaleString('fr-FR')}</b><span>sources</span></div>
        <div><b>{L.citations.length.toLocaleString('fr-FR')}</b><span>citations</span></div>
      </div>
      <p class="muted small">Fichier {resultat.logiciel !== 'inconnu' ? `créé avec ${resultat.logiciel}, ` : ''}encodage {resultat.encodage}.
        Personnes considérées comme vivantes (aucun décès connu, nées il y a moins de 100 ans) : <b>{resultat.vivantes}</b>. Elles seront masquées aux personnes à qui l’arbre est partagé en lecture.</p>
      {#if resultat.avertissements.length}
        <div class="avert">
          <Icon name="alert" size={16} />
          <ul>{#each resultat.avertissements as a}<li>{a}</li>{/each}</ul>
        </div>
      {/if}
      <label class="field"><span>Nom du nouvel arbre</span><input class="input" maxlength="100" bind:value={nom} /></label>
    </div>
  {:else}
    <div class="envoi" aria-live="polite">
      <p><b>Import en cours…</b> Gardez cette page ouverte.</p>
      <div class="barre"><span style="width:{Math.round(avancement * 100)}%"></span></div>
      <p class="muted small">{Math.round(avancement * 100)} %</p>
    </div>
  {/if}
  {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}

  {#snippet footer()}
    {#if etape === 'resume'}
      <button class="btn" onclick={() => { etape = 'choix'; resultat = null; erreur = ''; }}>Autre fichier</button>
      <button class="btn btn-primary" onclick={importer} disabled={!nom.trim()}><Icon name="check" size={16} /> Créer l’arbre</button>
    {:else if etape === 'choix'}
      <button class="btn" onclick={onclose}>Annuler</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .depot {
    position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 32px 16px; text-align: center;
    border: 2px dashed var(--border-strong); border-radius: var(--radius-lg); color: var(--accent-text); cursor: pointer;
  }
  .depot:hover, .depot:focus-within { border-color: var(--accent); background: var(--accent-soft); }
  .depot b { color: var(--text); }
  .depot input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .resume { display: flex; flex-direction: column; gap: 14px; }
  .chiffres { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .chiffres div { padding: 10px; border-radius: 10px; background: var(--surface-2); text-align: center; }
  .chiffres b { display: block; font-size: 20px; font-variant-numeric: tabular-nums; }
  .chiffres span { font-size: 12px; color: var(--text-3); }
  .avert { display: flex; gap: 10px; padding: 12px 14px; border-radius: var(--radius); background: var(--warn-soft); font-size: 13.5px; }
  .avert :global(svg) { color: var(--warn); margin-top: 2px; }
  .avert ul { margin: 0; padding-left: 16px; }
  .envoi { display: flex; flex-direction: column; gap: 10px; padding: 12px 0; }
  .barre { height: 8px; border-radius: 8px; background: var(--surface-2); overflow: hidden; }
  .barre span { display: block; height: 100%; background: var(--accent); transition: width 200ms; }
  .erreur { color: var(--neg); font-size: 14px; font-weight: 550; }
</style>
