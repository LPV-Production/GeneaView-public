<script lang="ts">
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';
  import Partage from './Partage.svelte';
  import Notifications from './Notifications.svelte';
  import { api } from '../lib/api';
  import { app, changePassword, choisirTheme, deleteTree, openTreeForm, signOut, toast, type Arbre, type Theme } from '../lib/store.svelte';
  import { pluriel, ROLES } from '../lib/format';
  import { exporterGedcom, sauvegardeComplete } from '../lib/sauvegarde';
  import { taille } from '../lib/images';

  const THEMES: { v: Theme; label: string; icon: string }[] = [
    { v: 'auto', label: 'Automatique', icon: 'auto' },
    { v: 'light', label: 'Clair', icon: 'sun' },
    { v: 'dark', label: 'Sombre', icon: 'moon' },
  ];

  const mesArbres = $derived(app.arbres.filter((a) => a.role === 'owner'));
  const partages = $derived(app.arbres.filter((a) => a.role !== 'owner'));
  let aPartager = $state<Arbre | null>(null);

  // Espace occupé par les photos et documents (plafond commun : 9,5 Go, pour rester gratuit)
  let stockage = $state<{ used: number; max: number } | null>(null);
  $effect(() => { api<{ used: number; max: number }>('GET', '/storage').then((r) => (stockage = r)).catch(() => {}); });
  const pourcent = $derived(stockage ? Math.min(100, (stockage.used / stockage.max) * 100) : 0);

  // Quitter un arbre partagé avec moi
  async function quitter(a: Arbre) {
    if (!confirm(`Quitter l’arbre « ${a.name} » ? Vous n’y aurez plus accès, sauf si ${a.owner_label} vous le partage à nouveau.`)) return;
    try {
      await api('DELETE', `/trees/${a.id}/members/${app.user!.id}`);
      app.arbres = app.arbres.filter((x) => x.id !== a.id);
      toast('Vous avez quitté cet arbre');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  // Changement de mot de passe
  let pw = $state({ current: '', next: '', confirm: '' });
  async function submitPassword(e: SubmitEvent) {
    e.preventDefault();
    if (pw.next !== pw.confirm) return toast('Les deux nouveaux mots de passe ne correspondent pas', true);
    if (await changePassword(pw.current, pw.next)) pw = { current: '', next: '', confirm: '' };
  }

  // Exports : GEDCOM ou sauvegarde complète (ZIP avec les fichiers)
  let exportEnCours = $state<{ id: string; msg: string } | null>(null);
  async function exporter(a: Arbre, quoi: 'gedcom' | 'zip') {
    if (exportEnCours) return;
    exportEnCours = { id: a.id, msg: 'Préparation…' };
    try {
      if (quoi === 'gedcom') { await exporterGedcom(a, app.user?.label ?? ''); toast('Fichier GEDCOM téléchargé'); }
      else {
        const r = await sauvegardeComplete(a, app.user?.label ?? '', (msg) => (exportEnCours = { id: a.id, msg }));
        toast(`Sauvegarde téléchargée : ${pluriel(r.personnes, 'personne')}, ${pluriel(r.fichiers, 'fichier')}, ${taille(r.taille)}`);
      }
    } catch (e) {
      toast(`Export impossible : ${(e as Error).message}`, true);
    } finally {
      exportEnCours = null;
    }
  }

  // Suppression d'un arbre : il faut retaper son nom (action définitive)
  let aSupprimer = $state<Arbre | null>(null);
  let confirmation = $state('');
  async function supprimer() {
    if (!aSupprimer || confirmation.trim() !== aSupprimer.name) return;
    if (await deleteTree(aSupprimer.id)) aSupprimer = null;
  }
</script>

<header class="page-head">
  <div>
    <h1>Réglages</h1>
    <p class="muted">Connecté en tant que {app.user?.label}.</p>
  </div>
</header>

<div class="layout">
  <section class="card card-pad">
    <h2 class="card-title">Apparence</h2>
    <p class="muted small intro">En automatique, GeneaView suit le réglage de votre téléphone ou ordinateur.</p>
    <div class="segmented" role="radiogroup" aria-label="Thème">
      {#each THEMES as t}
        <button role="radio" aria-checked={app.theme === t.v} class:active={app.theme === t.v} onclick={() => choisirTheme(t.v)}>
          <Icon name={t.icon} size={15} /> {t.label}
        </button>
      {/each}
    </div>
  </section>

  <section class="card card-pad">
    <h2 class="card-title">Mes arbres</h2>
    <p class="muted small intro">Renommer, partager avec la famille ou supprimer les arbres dont vous êtes propriétaire.</p>
    {#if mesArbres.length === 0}
      <p class="muted small">Vous n’avez encore créé aucun arbre.</p>
    {:else}
      <ul class="liste">
        {#each mesArbres as a (a.id)}
          <li class="arbre-ligne">
            <span class="t"><strong>{a.name}</strong><span class="muted small">{pluriel(a.person_count, 'personne')}</span></span>
            <button class="btn btn-ghost btn-sm" onclick={() => (aPartager = a)}><Icon name="personnes" size={15} /> Partager</button>
            <button class="btn btn-ghost btn-sm" onclick={() => openTreeForm(a.id)}><Icon name="edit" size={15} /> Renommer</button>
            <button class="btn btn-ghost btn-sm btn-danger" onclick={() => { aSupprimer = a; confirmation = ''; }}><Icon name="trash" size={15} /> Supprimer</button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if partages.length}
      <h3 class="sous">Partagés avec moi</h3>
      <ul class="liste">
        {#each partages as a (a.id)}
          <li class="arbre-ligne">
            <span class="t"><strong>{a.name}</strong><span class="muted small">{ROLES[a.role]} · arbre de {a.owner_label}</span></span>
            <button class="btn btn-ghost btn-sm btn-danger" onclick={() => quitter(a)}><Icon name="logout" size={15} /> Quitter</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <Notifications />

  {#if stockage}
    <section class="card card-pad">
      <h2 class="card-title">Espace de stockage</h2>
      <p class="muted small intro">Photos et documents de tous les arbres. Au-delà de 9,5 Go, l’appli refuse les nouveaux envois : vous ne paierez jamais rien.</p>
      <div class="jauge" class:presque={pourcent >= 90} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(pourcent)}><span style:width="{pourcent}%"></span></div>
      <p class="small">{stockage.used >= 1e9 ? `${(stockage.used / 1e9).toFixed(2).replace('.', ',')} Go` : taille(stockage.used)} utilisés sur 9,5 Go</p>
    </section>
  {/if}

  <section class="card card-pad">
    <h2 class="card-title">Exporter et sauvegarder</h2>
    <p class="muted small intro"><b>GEDCOM</b> : à ouvrir dans n’importe quel logiciel de généalogie. <b>Sauvegarde complète</b> : un fichier ZIP avec toutes les données, le GEDCOM et toutes les photos et PDF. Faites-en une de temps en temps, et gardez-la sur une clé USB ou un autre disque.</p>
    {#if !app.arbres.length}
      <p class="muted small">Aucun arbre à exporter.</p>
    {:else}
      <ul class="liste">
        {#each app.arbres as a (a.id)}
          <li class="export">
            <span class="t"><strong>{a.name}</strong><span class="muted small">{exportEnCours?.id === a.id ? exportEnCours.msg : `${pluriel(a.person_count, 'personne')} · ${ROLES[a.role]}`}</span></span>
            <button class="btn btn-sm" disabled={!!exportEnCours} onclick={() => exporter(a, 'gedcom')}><Icon name="telecharger" size={15} /> GEDCOM</button>
            <button class="btn btn-sm" disabled={!!exportEnCours} onclick={() => exporter(a, 'zip')}><Icon name="telecharger" size={15} /> Sauvegarde ZIP</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="card card-pad">
    <h2 class="card-title">Mot de passe</h2>
    <form class="form-section" onsubmit={submitPassword}>
      <input type="text" name="username" autocomplete="username" value={app.user?.id} hidden />
      <label class="field"><span>Mot de passe actuel</span><input class="input" type="password" autocomplete="current-password" required bind:value={pw.current} /></label>
      <div class="form-grid">
        <label class="field"><span>Nouveau mot de passe</span><input class="input" type="password" autocomplete="new-password" minlength="10" required bind:value={pw.next} /></label>
        <label class="field"><span>Confirmer</span><input class="input" type="password" autocomplete="new-password" minlength="10" required bind:value={pw.confirm} /></label>
      </div>
      <span class="hint muted small">10 caractères minimum. Vos autres appareils connectés seront déconnectés.</span>
      <div class="actions">
        <button class="btn btn-primary" type="submit" disabled={app.busy}>Changer le mot de passe</button>
        <button class="btn btn-danger" type="button" onclick={signOut}><Icon name="logout" size={16} /> Se déconnecter</button>
      </div>
    </form>
  </section>
</div>

{#if aPartager}
  <Partage arbre={aPartager} onclose={() => (aPartager = null)} />
{/if}

{#if aSupprimer}
  <Modal title="Supprimer « {aSupprimer.name} » ?" onclose={() => (aSupprimer = null)}>
    <div class="alerte">
      <Icon name="alert" size={18} />
      <p>Toutes les personnes, sources, photos et documents de cet arbre seront <strong>définitivement effacés</strong>, pour vous comme pour les personnes avec qui il est partagé. Pensez à faire une sauvegarde avant.</p>
    </div>
    <label class="field">
      <span>Pour confirmer, tapez le nom de l’arbre</span>
      <input class="input" autocomplete="off" placeholder={aSupprimer.name} bind:value={confirmation} />
    </label>
    {#snippet footer()}
      <button class="btn" onclick={() => (aSupprimer = null)}>Annuler</button>
      <button class="btn btn-primary danger" disabled={app.busy || confirmation.trim() !== aSupprimer?.name} onclick={supprimer}>Supprimer définitivement</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .layout { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
  .intro { margin: 4px 0 16px; }
  .jauge { height: 10px; border-radius: 99px; background: var(--surface-2, var(--border)); overflow: hidden; margin-bottom: 8px; }
  .jauge span { display: block; height: 100%; background: var(--accent); border-radius: inherit; }
  .jauge.presque span { background: var(--danger, #b3261e); }
  .liste { list-style: none; margin: 0; padding: 0; }
  .liste li { display: flex; align-items: center; gap: 4px; padding: 10px 0; border-top: 1px solid var(--border); }
  .liste li:first-child { border-top: 0; padding-top: 0; }
  .liste .t { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
  .liste strong { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .sous { margin: 18px 0 6px; font-size: 12px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); }
  @media (max-width: 640px) { .arbre-ligne { flex-wrap: wrap; } .arbre-ligne .t { flex-basis: 100%; } }
  .export { gap: 6px !important; }
  @media (max-width: 640px) { .export { flex-wrap: wrap; } .export .t { flex-basis: 100%; } .export .btn { flex: 1; } }
  .alerte { display: flex; gap: 12px; padding: 14px 16px; border-radius: var(--radius); background: var(--neg-soft); color: var(--text); font-size: 14px; }
  .alerte :global(svg) { color: var(--neg); margin-top: 2px; }
  .danger { background: var(--neg); border-color: var(--neg); color: #fff; }
  .danger:hover { background: var(--neg); border-color: var(--neg); filter: brightness(1.08); }
  @media (max-width: 1000px) { .layout { grid-template-columns: minmax(0, 1fr); gap: 12px; } }
  @media (max-width: 900px) { .card-pad { padding: 16px; } .actions .btn { flex: 1; } }
</style>
