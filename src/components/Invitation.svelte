<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { api } from '../lib/api';
  import { app, go, lienArbre, loadAll, signIn, signOut } from '../lib/store.svelte';
  import { ROLES } from '../lib/format';

  // Page ouverte depuis un lien d'invitation (#/invitation/<code>) :
  // l'invité crée son compte, ou se connecte avec le sien, puis arrive dans l'arbre.
  let { code }: { code: string } = $props();

  type Infos = { tree_name: string; role: 'editor' | 'viewer'; invited_by: string | null };
  let infos = $state<Infos | null>(null);
  let introuvable = $state('');
  let mode = $state<'creer' | 'connexion'>('creer');
  let identifiant = $state('');
  let nom = $state('');
  let motDePasse = $state('');
  let montrer = $state(false);
  let erreur = $state('');
  let occupe = $state(false);

  onMount(async () => {
    try { infos = await api<Infos>('GET', `/invitations/${encodeURIComponent(code)}`); }
    catch (e) { introuvable = (e as Error).message; }
  });

  // Propose un identifiant à partir du prénom : « Marie-Claire » → « marie-claire »
  function suggerer() {
    if (identifiant) return;
    identifiant = nom.trim().split(/\s+/)[0]?.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) ?? '';
  }

  async function arriver(treeId: string) {
    app.phase = 'loading';
    await loadAll();
    go(lienArbre(treeId));
  }

  async function creer(e: SubmitEvent) {
    e.preventDefault();
    if (occupe) return;
    occupe = true;
    erreur = '';
    try {
      const r = await api<{ tree_id: string }>('POST', `/invitations/${encodeURIComponent(code)}/accept`, { id: identifiant, label: nom, password: motDePasse });
      await arriver(r.tree_id);
    } catch (e) {
      erreur = (e as Error).message;
    }
    occupe = false;
  }

  async function seConnecter(e: SubmitEvent) {
    e.preventDefault();
    if (occupe) return;
    occupe = true;
    erreur = (await signIn(identifiant, motDePasse)) ?? '';
    if (erreur) motDePasse = '';
    occupe = false;
  }

  // Déconnexion sans quitter la page d'invitation
  async function changerDeCompte() {
    await signOut();
    go(`#/invitation/${encodeURIComponent(code)}`);
  }

  async function rejoindre() {
    if (occupe) return;
    occupe = true;
    erreur = '';
    try {
      const r = await api<{ tree_id: string }>('POST', `/invitations/${encodeURIComponent(code)}/join`);
      await arriver(r.tree_id);
    } catch (e) {
      erreur = (e as Error).message;
    }
    occupe = false;
  }
</script>

<main class="wrap">
  <div class="card boite">
    <div class="brand">
      <span class="logo" aria-hidden="true"><Icon name="arbre" size={22} /></span>
      <h1 class="titre">GeneaView</h1>
    </div>

    {#if introuvable}
      <p class="msg"><Icon name="alert" size={18} /> {introuvable}</p>
      <a class="btn" href="#/">Aller à l’accueil</a>
    {:else if !infos}
      <p class="muted small centre">Chargement de l’invitation…</p>
    {:else}
      <div class="invite">
        <p>{infos.invited_by ?? 'Quelqu’un'} vous invite dans l’arbre</p>
        <strong class="titre">{infos.tree_name}</strong>
        <span class="badge">{ROLES[infos.role]}</span>
        <p class="muted small">{infos.role === 'editor'
          ? 'Vous pourrez ajouter et corriger des personnes, des sources et des photos.'
          : 'Vous pourrez consulter l’arbre (les personnes vivantes restent masquées).'}</p>
      </div>

      {#if app.phase === 'ready' && app.user}
        <p class="small centre">Vous êtes connecté en tant que <b>{app.user.label}</b> ({app.user.id}).</p>
        <p class="error" role="alert">{erreur}</p>
        <button class="btn btn-primary grand" disabled={occupe} onclick={rejoindre}><Icon name="check" size={18} /> Rejoindre l’arbre</button>
        <button class="btn btn-ghost btn-sm" onclick={changerDeCompte}>Ce n’est pas moi : changer de compte</button>
      {:else}
        <div class="onglets" role="tablist">
          <button role="tab" aria-selected={mode === 'creer'} class:actif={mode === 'creer'} onclick={() => { mode = 'creer'; erreur = ''; }}>Je n’ai pas de compte</button>
          <button role="tab" aria-selected={mode === 'connexion'} class:actif={mode === 'connexion'} onclick={() => { mode = 'connexion'; erreur = ''; }}>J’ai déjà un compte</button>
        </div>

        {#if mode === 'creer'}
          <form onsubmit={creer}>
            <label class="field">
              <span>Votre prénom (affiché aux autres)</span>
              <input class="input" autocomplete="given-name" required maxlength="60" bind:value={nom} onblur={suggerer} />
            </label>
            <label class="field">
              <span>Identifiant de connexion</span>
              <input class="input" autocomplete="username" autocapitalize="none" spellcheck="false" required pattern="[a-z0-9_\-]{'{'}2,30{'}'}" maxlength="30"
                bind:value={identifiant} oninput={() => (identifiant = identifiant.toLowerCase())} />
              <small class="muted">Lettres minuscules sans accent, chiffres, - ou _. Ex. : marie</small>
            </label>
            <label class="field">
              <span>Mot de passe (10 caractères minimum)</span>
              <div class="pw">
                <input class="input" type={montrer ? 'text' : 'password'} autocomplete="new-password" required minlength="10" bind:value={motDePasse} />
                <button type="button" class="btn btn-ghost btn-sm" onclick={() => (montrer = !montrer)} aria-pressed={montrer}>{montrer ? 'Masquer' : 'Afficher'}</button>
              </div>
            </label>
            <p class="error" role="alert">{erreur}</p>
            <button class="btn btn-primary grand" type="submit" disabled={occupe}>{occupe ? 'Création…' : 'Créer mon compte et rejoindre l’arbre'}</button>
          </form>
        {:else}
          <form onsubmit={seConnecter}>
            <label class="field">
              <span>Identifiant</span>
              <input class="input" autocomplete="username" autocapitalize="none" spellcheck="false" required bind:value={identifiant} />
            </label>
            <label class="field">
              <span>Mot de passe</span>
              <div class="pw">
                <input class="input" type={montrer ? 'text' : 'password'} autocomplete="current-password" required bind:value={motDePasse} />
                <button type="button" class="btn btn-ghost btn-sm" onclick={() => (montrer = !montrer)} aria-pressed={montrer}>{montrer ? 'Masquer' : 'Afficher'}</button>
              </div>
            </label>
            <p class="error" role="alert">{erreur}</p>
            <button class="btn btn-primary grand" type="submit" disabled={occupe}>{occupe ? 'Connexion…' : 'Se connecter'}</button>
          </form>
        {/if}
      {/if}
    {/if}
  </div>
</main>

<style>
  .wrap { min-height: 100dvh; display: grid; place-items: center; padding: 16px; }
  .boite { width: min(430px, 100%); padding: 28px 24px; display: flex; flex-direction: column; gap: 14px; }
  .brand { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .logo { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; background: var(--accent); color: var(--on-accent); }
  h1 { font-size: 26px; }
  .invite { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; padding: 16px; border-radius: var(--radius); background: var(--surface-2); }
  .invite p { margin: 0; }
  .invite strong { font-size: 22px; line-height: 1.2; }
  .centre { text-align: center; margin: 0; }
  .msg { display: flex; gap: 8px; align-items: flex-start; margin: 0; color: var(--text-2); }
  .onglets { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: var(--radius); background: var(--surface-2); }
  .onglets button { border: 0; background: none; padding: 9px 6px; border-radius: calc(var(--radius) - 3px); font: inherit; font-size: 13.5px; font-weight: 600; color: var(--text-2); cursor: pointer; }
  .onglets button.actif { background: var(--surface); color: var(--text); box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
  form { display: flex; flex-direction: column; gap: 14px; }
  .field small { font-size: 12px; }
  .pw { position: relative; display: flex; align-items: center; }
  .pw .input { padding-right: 90px; }
  .pw .btn { position: absolute; right: 4px; }
  .error { min-height: 1.4em; margin: -4px 0; color: var(--neg); font-size: 14px; font-weight: 550; }
  .error:empty { min-height: 0; }
  .grand { min-height: 46px; font-size: 15px; }
  input { font-size: 16px; } /* évite le zoom automatique sur iPhone */
</style>
