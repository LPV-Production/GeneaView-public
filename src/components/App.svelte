<script lang="ts">
  import { onMount } from 'svelte';
  import Shell from './Shell.svelte';
  import Login from './Login.svelte';
  import Invitation from './Invitation.svelte';
  import Icon from './Icon.svelte';
  import { app, demarrer, loadAll } from '../lib/store.svelte';

  onMount(() => {
    demarrer();
    // Programme d'arrière-plan : nécessaire pour installer l'appli sur le téléphone
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
</script>

{#if app.route.ecran === 'invitation' && (app.phase === 'ready' || app.phase === 'login')}
  <Invitation code={app.route.code} />
{:else if app.phase === 'ready'}
  <Shell />
{:else if app.phase === 'login'}
  <Login />
{:else if app.phase === 'error'}
  <div class="center">
    <div class="card box">
      <Icon name="refresh" size={28} />
      <p><strong>Impossible de charger vos arbres</strong></p>
      <p class="muted small">{app.loadError}</p>
      <button class="btn btn-primary" onclick={() => { app.phase = 'loading'; loadAll(); }}>Réessayer</button>
    </div>
  </div>
{:else}
  <div class="center" aria-busy="true">
    <span class="spinner" role="status" aria-label="Chargement"></span>
  </div>
{/if}

<style>
  .center { min-height: 100dvh; display: grid; place-items: center; padding: 16px; }
  .box { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 40px 28px; text-align: center; max-width: 380px; color: var(--text-3); }
  .box strong { color: var(--text); }
  .box .btn { margin-top: 12px; }
  .spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--border); border-top-color: var(--accent); animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
