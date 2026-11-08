<script lang="ts">
  import Icon from './Icon.svelte';
  import Accueil from './Accueil.svelte';
  import ArbrePage from './ArbrePage.svelte';
  import Reglages from './Reglages.svelte';
  import TreeForm from './TreeForm.svelte';
  import { app, arbreCourant, lienArbre, lienCarte, lienListe, signOut } from '../lib/store.svelte';

  const courant = $derived(arbreCourant());

  // Hors ligne : on peut lire ce qui a été gardé sur l'appareil, mais pas modifier
  let enLigne = $state(navigator.onLine);
  $effect(() => {
    const maj = () => (enLigne = navigator.onLine);
    addEventListener('online', maj);
    addEventListener('offline', maj);
    return () => { removeEventListener('online', maj); removeEventListener('offline', maj); };
  });

  // Navigation : les écrans Personnes, Carte… s'ajouteront ici au fil des étapes
  const nav = $derived([
    { cle: 'accueil', label: 'Accueil', icon: 'accueil', href: '#/' },
    { cle: 'arbre', label: 'Arbre', icon: 'arbre', href: courant ? lienArbre(courant.id) : '#/' },
    { cle: 'personnes', label: 'Personnes', icon: 'personnes', href: courant ? lienListe(courant.id) : '#/' },
    { cle: 'carte', label: 'Carte', icon: 'carte', href: courant ? lienCarte(courant.id) : '#/' },
    { cle: 'reglages', label: 'Réglages', icon: 'reglages', href: '#/reglages' },
  ]);
  // Les onglets « Arbre » et « Personnes » n'apparaissent que lorsqu'un arbre a été ouvert
  const visibles = $derived(nav.filter((n) => !['arbre', 'personnes', 'carte'].includes(n.cle) || courant));
  // Onglet en surbrillance
  const actif = $derived(app.route.ecran === 'arbre' && app.route.liste ? 'personnes' : app.route.ecran === 'arbre' && app.route.carte ? 'carte' : app.route.ecran);
</script>

<div class="shell">
  <aside class="sidebar" aria-label="Navigation principale">
    <a class="brand" href="#/">
      <span class="logo" aria-hidden="true"><Icon name="arbre" size={17} /></span>
      <span class="titre">GeneaView</span>
    </a>

    {#if courant}
      <a class="selecteur" href={lienArbre(courant.id)} title="Arbre ouvert">
        <span><small>Arbre ouvert</small><strong>{courant.name}</strong></span>
        <Icon name="chevronRight" size={16} />
      </a>
    {/if}

    <nav class="nav">
      {#each visibles as item}
        <a class="nav-item" href={item.href} class:active={actif === item.cle} aria-current={actif === item.cle ? 'page' : undefined}>
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </a>
      {/each}
    </nav>

    <div class="user">
      <span class="avatar" aria-hidden="true">{app.user?.label[0]}</span>
      <div class="user-name">
        <strong>{app.user?.label}</strong>
        <span class="muted small">{app.arbres.length} arbre{app.arbres.length > 1 ? 's' : ''}</span>
      </div>
      <button class="btn btn-ghost btn-sm btn-icon" aria-label="Se déconnecter" title="Se déconnecter" onclick={signOut}>
        <Icon name="logout" size={16} />
      </button>
    </div>
  </aside>

  <header class="topbar">
    <a class="brand" href="#/">
      <span class="logo" aria-hidden="true"><Icon name="arbre" size={17} /></span>
      <span class="titre">GeneaView</span>
    </a>
  </header>

  {#if !enLigne}
    <div class="hors-ligne" role="status"><Icon name="alert" size={15} /> Hors ligne : vous consultez la dernière version gardée sur cet appareil. Les modifications reprendront avec la connexion.</div>
  {/if}

  <main class="main">
    {#if app.route.ecran === 'arbre'}
      {#key app.route.treeId}<ArbrePage id={app.route.treeId} personId={app.route.personId} unionId={app.route.unionId} centreId={app.route.centreId} liste={app.route.liste} carte={app.route.carte} cartePersonne={app.route.cartePersonne} impression={app.route.impression} />{/key}
    {:else if app.route.ecran === 'reglages'}
      <Reglages />
    {:else}
      <Accueil />
    {/if}
  </main>

  <nav class="bottom-nav" aria-label="Navigation" style="grid-template-columns: repeat({visibles.length}, 1fr)">
    {#each visibles as item}
      <a class="tab" href={item.href} class:active={actif === item.cle} aria-current={actif === item.cle ? 'page' : undefined}>
        <Icon name={item.icon} size={22} />
        <span>{item.label}</span>
      </a>
    {/each}
  </nav>
</div>

{#if app.modal?.kind === 'arbre'}
  <TreeForm id={app.modal.id} />
{/if}

{#if app.toast}
  <div class="toast" class:error={app.toast.error} role="status">{app.toast.msg}</div>
{/if}

<style>
  .shell { min-height: 100dvh; }

  .brand { display: flex; align-items: center; gap: 10px; font-size: 19px; color: var(--text); text-decoration: none; }
  .brand:hover { text-decoration: none; }
  .logo { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: var(--accent); color: var(--on-accent); }

  /* ---------- Barre latérale (ordinateur) ---------- */
  .sidebar {
    position: fixed; inset: 0 auto 0 0; width: var(--sidebar-w);
    display: flex; flex-direction: column; gap: 16px;
    padding: 20px 14px; background: var(--surface); border-right: 1px solid var(--border);
  }
  .sidebar .brand { padding: 0 8px 4px; }
  .selecteur {
    display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--radius);
    border: 1px solid var(--border); background: var(--surface-2); color: var(--text); text-decoration: none;
  }
  .selecteur:hover { border-color: var(--border-strong); text-decoration: none; }
  .selecteur span { flex: 1; min-width: 0; line-height: 1.25; }
  .selecteur small { display: block; font-size: 12px; color: var(--text-3); }
  .selecteur strong { display: block; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .nav-item {
    display: flex; align-items: center; gap: 12px; width: 100%; min-height: 40px; padding: 0 10px;
    border-radius: var(--radius-sm); color: var(--text-2); font-weight: 550; font-size: 14px; text-decoration: none;
    transition: background var(--dur-fast), color var(--dur-fast);
  }
  .nav-item:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }
  .nav-item.active { background: var(--accent-soft); color: var(--accent-text); }

  .user { display: flex; align-items: center; gap: 8px; padding: 10px 8px 0; border-top: 1px solid var(--border); }
  .avatar { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); font-weight: 700; }
  .user-name { flex: 1; display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
  .user-name strong { font-size: 14px; }

  .main { margin-left: var(--sidebar-w); padding: 32px 36px 48px; max-width: calc(1240px + var(--sidebar-w)); }

  .topbar, .bottom-nav { display: none; }
  /* Impression : seulement le contenu de la page */
  @media print {
    .sidebar, .topbar, .bottom-nav, .toast, .hors-ligne { display: none !important; }
    .main { margin: 0 !important; padding: 0 !important; max-width: none !important; }
  }
  .hors-ligne { position: sticky; top: 0; z-index: 40; display: flex; align-items: center; gap: 8px; margin-left: var(--sidebar-w); padding: 8px 16px; background: var(--warn-soft); color: var(--text); font-size: 13.5px; }
  @media (max-width: 900px) { .hors-ligne { margin-left: 0; top: calc(56px + env(safe-area-inset-top)); } }

  /* ---------- Téléphone et petite tablette ---------- */
  @media (max-width: 900px) {
    .sidebar { display: none; }
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      position: sticky; top: 0; z-index: 20; height: calc(56px + env(safe-area-inset-top)); padding: 0 8px 0 16px;
      padding-top: env(safe-area-inset-top);
      background: color-mix(in srgb, var(--bg) 85%, transparent); backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
    }
    .main { margin-left: 0; padding: 16px 16px calc(var(--bottom-nav-h) + 32px + env(safe-area-inset-bottom)); }

    .bottom-nav {
      display: grid;
      position: fixed; inset: auto 0 0 0; z-index: 30;
      height: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom);
      background: color-mix(in srgb, var(--surface) 92%, transparent); backdrop-filter: blur(12px); border-top: 1px solid var(--border);
    }
    .tab {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
      color: var(--text-3); font-size: 11px; font-weight: 600; text-decoration: none;
    }
    .tab:hover { text-decoration: none; }
    .tab.active { color: var(--accent-text); }
  }

  .toast {
    position: fixed; left: 50%; bottom: 24px; z-index: 100; transform: translateX(-50%);
    padding: 12px 18px; border-radius: var(--radius); background: var(--text); color: var(--bg);
    font-size: 14px; font-weight: 550; box-shadow: var(--shadow-lg); animation: rise var(--dur) var(--ease-out);
    max-width: calc(100vw - 32px);
  }
  .toast.error { background: var(--neg); color: #fff; }
  @media (max-width: 900px) { .toast { bottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom) + 16px); } }
  @keyframes rise { from { opacity: 0; translate: 0 8px; } }
</style>
