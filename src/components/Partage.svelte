<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from './Modal.svelte';
  import Icon from './Icon.svelte';
  import { api } from '../lib/api';
  import { toast, type Arbre } from '../lib/store.svelte';
  import { ROLES } from '../lib/format';

  // Partage d'un arbre : lien d'invitation (crée le compte de l'invité), ajout par identifiant,
  // liste des membres, changement de rôle, retrait.
  let { arbre, onclose }: { arbre: Arbre; onclose: () => void } = $props();

  type Membre = { user_id: string; label: string; role: 'owner' | 'editor' | 'viewer' };
  let membres = $state<Membre[]>([]);
  let chargement = $state(true);
  let identifiant = $state('');
  let role = $state<'viewer' | 'editor'>('viewer');
  let occupe = $state(false);

  // Invitations par lien : le code n'est connu qu'au moment de sa création (le serveur n'en garde que l'empreinte)
  type Invitation = { id: string; role: 'editor' | 'viewer'; expires_at: number };
  let invitations = $state<Invitation[]>([]);
  let roleInvite = $state<'viewer' | 'editor'>('editor');
  let lien = $state('');
  const partageNatif = typeof navigator !== 'undefined' && 'share' in navigator;
  const dateFin = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

  async function creerLien() {
    if (occupe) return;
    occupe = true;
    try {
      const r = await api<{ code: string; invitations: Invitation[] }>('POST', `/trees/${arbre.id}/invitations`, { role: roleInvite });
      invitations = r.invitations;
      lien = `${location.origin}/#/invitation/${r.code}`;
    } catch (e) {
      toast((e as Error).message, true);
    }
    occupe = false;
  }

  async function copier() {
    try { await navigator.clipboard.writeText(lien); toast('Lien copié'); }
    catch { toast('Copie impossible : sélectionnez le lien et copiez-le à la main', true); }
  }

  async function envoyer() {
    try {
      await navigator.share({ title: 'Invitation GeneaView', text: `Rejoins notre arbre « ${arbre.name} » sur GeneaView (lien valable 7 jours, une seule fois) :`, url: lien });
    } catch {}
  }

  async function annuler(inv: Invitation) {
    try { invitations = (await api<{ invitations: Invitation[] }>('DELETE', `/trees/${arbre.id}/invitations/${inv.id}`)).invitations; toast('Invitation annulée'); }
    catch (e) { toast((e as Error).message, true); }
  }

  async function action(fn: () => Promise<{ members: Membre[] }>, message: string) {
    if (occupe) return;
    occupe = true;
    try {
      membres = (await fn()).members;
      toast(message);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      occupe = false;
    }
  }

  onMount(async () => {
    try {
      membres = (await api<{ members: Membre[] }>('GET', `/trees/${arbre.id}/members`)).members;
      invitations = (await api<{ invitations: Invitation[] }>('GET', `/trees/${arbre.id}/invitations`)).invitations;
    }
    catch (e) { toast((e as Error).message, true); }
    chargement = false;
  });

  async function ajouter(e: SubmitEvent) {
    e.preventDefault();
    const id = identifiant.trim().toLowerCase();
    if (!id) return;
    await action(() => api('POST', `/trees/${arbre.id}/members`, { user_id: id, role }), `Arbre partagé avec ${id}`);
    identifiant = '';
  }
</script>

<Modal title="Partager « {arbre.name} »" onclose={onclose}>
  <div class="explications">
    <p><b>Lecteur</b> : voit l’arbre, mais pas les personnes vivantes (affichées « Personne vivante », sans dates, photos ni documents). Ne peut rien modifier.</p>
    <p><b>Éditeur</b> : voit tout et peut ajouter ou modifier personnes, sources et documents. Ne peut ni renommer, ni partager, ni supprimer l’arbre.</p>
  </div>

  <section class="bloc">
    <h3>Inviter quelqu’un</h3>
    <p class="muted small">Créez un lien et envoyez-le par SMS, WhatsApp ou e-mail. La personne choisit son identifiant et son mot de passe, puis arrive directement dans l’arbre. Si elle a déjà un compte, elle se connecte simplement. Le lien sert une seule fois et expire au bout de 7 jours.</p>
    <div class="ajout invite">
      <label class="field">
        <span>Rôle</span>
        <select class="input" bind:value={roleInvite}><option value="editor">Éditeur</option><option value="viewer">Lecteur</option></select>
      </label>
      <button class="btn btn-primary" disabled={occupe} onclick={creerLien}><Icon name="link" size={16} /> Créer un lien d’invitation</button>
    </div>
    {#if lien}
      <div class="lien">
        <input class="input" readonly value={lien} aria-label="Lien d’invitation" onfocus={(e) => e.currentTarget.select()} />
        <div class="boutons">
          <button class="btn btn-sm" onclick={copier}><Icon name="check" size={15} /> Copier</button>
          {#if partageNatif}<button class="btn btn-sm btn-primary" onclick={envoyer}><Icon name="envoyer" size={15} /> Envoyer…</button>{/if}
        </div>
        <small class="muted">Ce lien ne sera plus affiché après fermeture : envoyez-le maintenant (vous pourrez toujours en créer un autre).</small>
      </div>
    {/if}
    {#if invitations.length}
      <ul class="attente">
        {#each invitations as inv (inv.id)}
          <li>
            <Icon name="link" size={15} />
            <span class="t">Invitation {ROLES[inv.role].toLowerCase()} en attente <small>valable jusqu’au {dateFin(inv.expires_at)}</small></span>
            <button class="btn btn-ghost btn-sm btn-danger" onclick={() => annuler(inv)}>Annuler</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <h3>Ajouter un compte existant</h3>
  <form class="ajout" onsubmit={ajouter}>
    <label class="field">
      <span>Identifiant du compte</span>
      <input class="input" autocapitalize="none" spellcheck="false" placeholder="Ex. marie" bind:value={identifiant} />
    </label>
    <label class="field">
      <span>Rôle</span>
      <select class="input" bind:value={role}><option value="viewer">Lecteur</option><option value="editor">Éditeur</option></select>
    </label>
    <button class="btn btn-primary" type="submit" disabled={occupe || !identifiant.trim()}><Icon name="plus" size={16} /> Partager</button>
  </form>
  <p class="muted small">Si la personne a déjà un compte GeneaView, vous pouvez aussi l’ajouter avec son identifiant.</p>

  {#if chargement}
    <p class="muted small">Chargement…</p>
  {:else}
    <ul class="membres">
      {#each membres as m (m.user_id)}
        <li>
          <span class="av" aria-hidden="true">{m.label[0]}</span>
          <span class="t"><b>{m.label}</b><small>{m.user_id}</small></span>
          {#if m.role === 'owner'}
            <span class="badge">Propriétaire</span>
          {:else}
            <select class="input role" aria-label="Rôle de {m.label}" value={m.role} disabled={occupe}
              onchange={(e) => action(() => api('PUT', `/trees/${arbre.id}/members/${m.user_id}`, { role: (e.currentTarget as HTMLSelectElement).value }), `${m.label} : ${ROLES[(e.currentTarget as HTMLSelectElement).value].toLowerCase()}`)}>
              <option value="viewer">Lecteur</option><option value="editor">Éditeur</option>
            </select>
            <button class="btn btn-ghost btn-sm btn-icon btn-danger" aria-label="Retirer {m.label}" title="Retirer l’accès" disabled={occupe}
              onclick={() => confirm(`Retirer l’accès de ${m.label} à cet arbre ?`) && action(() => api('DELETE', `/trees/${arbre.id}/members/${m.user_id}`), `Accès de ${m.label} retiré`)}>
              <Icon name="x" size={16} />
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#snippet footer()}
    <button class="btn" onclick={onclose}>Fermer</button>
  {/snippet}
</Modal>

<style>
  .explications { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: var(--radius); background: var(--surface-2); font-size: 13.5px; color: var(--text-2); }
  h3 { margin: 6px 0 0; font-size: 12px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); }
  .bloc { display: flex; flex-direction: column; gap: 10px; }
  .bloc p { margin: 0; }
  .ajout.invite { grid-template-columns: 140px auto; justify-content: start; }
  .lien { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: var(--radius); border: 1px dashed var(--accent); background: var(--accent-soft); }
  .lien .input { font-size: 13px; }
  .boutons { display: flex; gap: 8px; flex-wrap: wrap; }
  .attente { list-style: none; margin: 0; padding: 0; }
  .attente li { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13.5px; color: var(--text-2); }
  .attente small { display: block; color: var(--text-3); font-size: 12px; }
  .ajout { display: grid; grid-template-columns: minmax(0, 1fr) 140px auto; gap: 8px; align-items: end; }
  .membres { list-style: none; margin: 0; padding: 0; }
  .membres li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--border); }
  .av { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); font-weight: 700; flex: none; }
  .t { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
  .t b { font-weight: 600; font-size: 14px; }
  .t small { color: var(--text-3); font-size: 12px; }
  .role { width: auto; min-height: 34px; font-size: 13px; padding-right: 30px; }
  @media (max-width: 560px) { .ajout { grid-template-columns: 1fr 1fr; } .ajout .btn { grid-column: 1 / -1; } .ajout.invite { grid-template-columns: 1fr; } }
</style>
