<script lang="ts">
  import { afficherDate, analyserDate, QUALIFS, type Qualif } from '../../commun/dates';

  // Saisie d'une date incertaine : précision (exacte, vers, avant, après, entre) + la date.
  // Sous le champ, l'appli dit comment elle a compris la date (ou pourquoi elle ne la comprend pas).
  let { qual = $bindable('exact'), texte = $bindable(''), label = 'Date' }: { qual?: Qualif; texte?: string; label?: string } = $props();

  const uid = Math.random().toString(36).slice(2, 8);

  // Pour « entre », deux champs ; le texte enregistré est « 1864 et 1868 »
  const [d1, d2] = texte.split(/\s+et\s+/i);
  let debut = $state(d1 ?? '');
  let fin = $state(d2 ?? '');
  let simple = $state(texte);

  $effect(() => {
    texte = qual === 'between' ? (debut.trim() || fin.trim() ? `${debut.trim()} et ${fin.trim()}` : '') : simple;
  });

  const lecture = $derived.by(() => {
    if (!texte.trim()) return null;
    try {
      const d = analyserDate(qual, texte);
      return { ok: true, txt: afficherDate(d) };
    } catch (e) {
      return { ok: false, txt: (e as Error).message };
    }
  });

  function choisir(q: Qualif) {
    if (q === 'between' && qual !== 'between') { debut = simple; fin = ''; }
    if (q !== 'between' && qual === 'between') simple = debut;
    qual = q;
  }
</script>

<div class="field">
  <span id="lbl-{uid}">{label}</span>
  <div class="precisions" role="radiogroup" aria-labelledby="lbl-{uid}">
    {#each QUALIFS as q}
      <button type="button" role="radio" aria-checked={qual === q.v} class:actif={qual === q.v} onclick={() => choisir(q.v)}>{q.label}</button>
    {/each}
  </div>
  {#if qual === 'between'}
    <div class="entre">
      <input class="input" aria-label="{label} : début" placeholder="1864" bind:value={debut} />
      <span class="muted">et</span>
      <input class="input" aria-label="{label} : fin" placeholder="1868" bind:value={fin} />
    </div>
  {:else}
    <input class="input" aria-labelledby="lbl-{uid}" placeholder="1890 · 03/1890 · 12/03/1890" bind:value={simple} />
  {/if}
  {#if lecture}
    <span class="lecture" class:erreur={!lecture.ok} aria-live="polite">{lecture.ok ? `Compris : ${lecture.txt}` : lecture.txt}</span>
  {:else}
    <span class="hint">Année seule, mois/année ou date complète.</span>
  {/if}
</div>

<style>
  .precisions { display: flex; flex-wrap: wrap; gap: 6px; }
  .precisions button {
    min-height: 32px; padding: 0 12px; border-radius: 99px; border: 1px solid var(--border); background: var(--surface);
    font-size: 13px; font-weight: 600; color: var(--text-2); cursor: pointer;
  }
  .precisions button.actif { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .entre { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; }
  .lecture { font-size: 12.5px; color: var(--pos); font-weight: 550; }
  .lecture.erreur { color: var(--neg); }
</style>
