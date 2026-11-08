<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { api } from '../lib/api';
  import { app, toast } from '../lib/store.svelte';
  import { disablePush, enablePush, getPushState, sendTestPush, type PushState } from '../lib/push';

  // Notifications d'anniversaires : activation sur cet appareil + choix par arbre.
  type Prefs = { enabled: number; births: number; deaths: number; marriages: number; round_only: number };
  let etat = $state<PushState | 'loading'>('loading');
  let occupe = $state(false);
  let prefs = $state<Record<string, Prefs>>({});

  onMount(async () => {
    etat = await getPushState();
    for (const a of app.arbres) {
      try { prefs[a.id] = await api<Prefs>('GET', `/trees/${a.id}/notifications`); } catch {}
    }
  });

  async function agir(fn: () => Promise<unknown>) {
    occupe = true;
    try { await fn(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Action impossible', true); }
    finally { etat = await getPushState(); occupe = false; }
  }
  async function changer(treeId: string, champ: keyof Prefs, valeur: boolean) {
    try { prefs[treeId] = await api<Prefs>('PUT', `/trees/${treeId}/notifications`, { [champ]: valeur }); }
    catch (e) { toast((e as Error).message, true); }
  }
</script>

<section class="card card-pad">
  <div class="tete">
    <h2 class="card-title">Rappels d’anniversaires</h2>
    {#if etat === 'on'}<span class="badge badge-pos"><span class="dot"></span>Activés sur cet appareil</span>{/if}
  </div>
  <p class="muted small intro">
    Une notification à 9 h, seulement les jours où il y a quelque chose : « Il y a 100 ans naissait Jeanne Martin », « Louise a 74 ans aujourd’hui »…
  </p>

  {#if etat === 'loading'}
    <p class="muted small">…</p>
  {:else if etat === 'needs-install'}
    <div class="etapes">
      <p><strong>Sur iPhone, installez d’abord l’appli :</strong></p>
      <ol>
        <li>Ouvrez ce site dans <strong>Safari</strong></li>
        <li>Touchez <strong>Partager</strong> (carré avec une flèche)</li>
        <li>Choisissez <strong>Sur l’écran d’accueil</strong></li>
        <li>Ouvrez l’appli depuis sa nouvelle icône et revenez ici</li>
      </ol>
    </div>
  {:else if etat === 'unsupported'}
    <p class="small">Ce navigateur ne gère pas les notifications. Utilisez Chrome (Android, ordinateur) ou l’appli installée depuis Safari (iPhone, iOS 16.4 ou plus).</p>
  {:else if etat === 'denied'}
    <p class="small">Les notifications sont bloquées pour ce site. Réactivez-les dans les réglages du téléphone (Notifications → GeneaView), puis revenez ici.</p>
  {:else if etat === 'off'}
    <button class="btn btn-primary" disabled={occupe} onclick={() => agir(async () => { if ((await enablePush()) === 'on') toast('Rappels activés sur cet appareil'); })}>
      <Icon name="calendrier" size={16} /> Activer sur cet appareil
    </button>
  {:else}
    <div class="ligne">
      <button class="btn" disabled={occupe} onclick={() => agir(async () => { await sendTestPush(); toast('Notification de test envoyée'); })}>Envoyer un test</button>
      <button class="btn btn-ghost btn-danger" disabled={occupe} onclick={() => agir(async () => { await disablePush(); toast('Rappels désactivés sur cet appareil'); })}>Désactiver</button>
    </div>
  {/if}

  {#if app.arbres.length}
    <h3 class="sous">Pour chaque arbre</h3>
    {#each app.arbres as a (a.id)}
      {@const p = prefs[a.id]}
      {#if p}
        <div class="arbre-prefs">
          <label class="case principale"><input type="checkbox" checked={!!p.enabled} onchange={(e) => changer(a.id, 'enabled', e.currentTarget.checked)} /> <b>{a.name}</b></label>
          {#if p.enabled}
            <div class="options">
              <label class="case"><input type="checkbox" checked={!!p.births} onchange={(e) => changer(a.id, 'births', e.currentTarget.checked)} /> Naissances</label>
              <label class="case"><input type="checkbox" checked={!!p.deaths} onchange={(e) => changer(a.id, 'deaths', e.currentTarget.checked)} /> Décès</label>
              <label class="case"><input type="checkbox" checked={!!p.marriages} onchange={(e) => changer(a.id, 'marriages', e.currentTarget.checked)} /> Mariages</label>
              <label class="case"><input type="checkbox" checked={!!p.round_only} onchange={(e) => changer(a.id, 'round_only', e.currentTarget.checked)} /> Ancêtres : tous les 10 ans seulement</label>
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  {/if}
</section>

<style>
  .tete { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .intro { margin: 4px 0 16px; }
  .ligne { display: flex; flex-wrap: wrap; gap: 8px; }
  .etapes { padding: 12px 14px; border-radius: var(--radius-sm); background: var(--surface-2); font-size: 14px; }
  .etapes ol { margin: 6px 0 0; padding-left: 20px; }
  .sous { margin: 18px 0 6px; font-size: 12px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); }
  .arbre-prefs { padding: 8px 0; border-top: 1px solid var(--border); }
  .case { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; min-height: 32px; }
  .case input { width: 18px; height: 18px; accent-color: var(--accent); }
  .options { display: flex; flex-wrap: wrap; gap: 4px 16px; padding-left: 26px; }
  @media (max-width: 900px) { .card-pad { padding: 16px; } .ligne .btn { flex: 1; } }
</style>
