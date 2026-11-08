<script lang="ts">
  import Icon from './Icon.svelte';
  import { signIn } from '../lib/store.svelte';

  let id = $state('');
  let password = $state('');
  let show = $state(false);
  let error = $state('');
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = (await signIn(id, password)) ?? '';
    busy = false;
    if (error) password = '';
  }
</script>

<main class="wrap">
  <form class="card login" onsubmit={submit}>
    <div class="brand">
      <span class="logo" aria-hidden="true"><Icon name="arbre" size={22} /></span>
      <h1 class="titre">GeneaView</h1>
      <p class="muted small">Connectez-vous pour retrouver vos arbres.</p>
    </div>

    <label class="field">
      <span>Identifiant</span>
      <input class="input" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required bind:value={id} />
    </label>
    <label class="field">
      <span>Mot de passe</span>
      <div class="pw">
        <input class="input" name="password" type={show ? 'text' : 'password'} autocomplete="current-password" required bind:value={password} />
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => (show = !show)} aria-pressed={show}>{show ? 'Masquer' : 'Afficher'}</button>
      </div>
    </label>

    <p class="error" role="alert" aria-live="assertive">{error}</p>

    <button class="btn btn-primary submit" type="submit" disabled={busy}>
      {busy ? 'Connexion…' : 'Se connecter'}
    </button>
  </form>
</main>

<style>
  .wrap { min-height: 100dvh; display: grid; place-items: center; padding: 16px; }
  .login { width: min(400px, 100%); padding: 32px 28px; display: flex; flex-direction: column; gap: 16px; }
  .brand { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; margin-bottom: 8px; }
  .logo { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; background: var(--accent); color: var(--on-accent); margin-bottom: 6px; }
  h1 { font-size: 28px; }
  .pw { position: relative; display: flex; align-items: center; }
  .pw .input { padding-right: 90px; }
  .pw .btn { position: absolute; right: 4px; }
  .error { min-height: 1.4em; margin: -6px 0 -6px; color: var(--neg); font-size: 14px; font-weight: 550; }
  .submit { min-height: 46px; font-size: 15px; }
  input { font-size: 16px; } /* évite le zoom automatique sur iPhone */
</style>
