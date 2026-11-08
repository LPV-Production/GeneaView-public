<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { lienPersonne, type Arbre } from '../lib/store.svelte';
  import { analyse, arbre, D, urlFichier } from '../lib/arbre.svelte';
  import { afficherDate } from '../../commun/dates';
  import { FIABILITES, TYPES_EVENEMENT, TYPES_SOURCE } from '../../commun/libelles';
  import { calculerEventail, RAYON_CENTRE } from '../lib/eventail';
  import { generationSosa } from '../lib/analyse';
  import { accord, ageTexte, chronologie, datePhrase, deces, fratrie, initiales, libelleUnion, naissance, nomComplet, nomCourt, nomLieu, parents, unionsDe, vieCourte } from '../lib/genealogie';
  import { cleCible } from '../lib/donnees';

  // ============================================================
  // Pages à imprimer ou à « Enregistrer au format PDF » (boîte d'impression
  // du navigateur) : fiche d'une personne, éventail des ascendants,
  // descendance numérotée. Formats A4 / A3, portrait / paysage.
  // Tout est préparé dans le navigateur : aucun service payant.
  // ============================================================
  let { infos, type, personId }: { infos: Arbre; type: 'fiche' | 'ascendance' | 'descendance'; personId: string } = $props();

  let format = $state<'A4' | 'A3'>('A4');
  let orientation = $state<'portrait' | 'landscape'>(type === 'ascendance' ? 'landscape' : 'portrait');
  let generations = $state(type === 'ascendance' ? 5 : 4);

  // Taille de page pour l'impression (règle @page ajoutée à la volée)
  $effect(() => {
    const style = document.createElement('style');
    style.textContent = `@page { size: ${format} ${orientation}; margin: 12mm; }`;
    document.head.append(style);
    return () => style.remove();
  });
  // Toujours en clair sur papier
  onMount(() => {
    const avant = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = 'light';
    return () => { if (avant) document.documentElement.dataset.theme = avant; };
  });

  const p = $derived.by(() => { arbre.version; return D.personnes.get(personId); });
  const sosa = $derived(analyse().sosa.get(personId));
  const titre = $derived(type === 'fiche' ? nomComplet(p) : type === 'ascendance' ? `Ascendance de ${nomComplet(p)}` : `Descendance de ${nomComplet(p)}`);

  // ----- Fiche -----
  const fiche = $derived.by(() => {
    arbre.version;
    if (type !== 'fiche' || !p) return null;
    const photos = (D.mediasCible.get(`p:${personId}`) ?? []).filter((m) => m.mime.startsWith('image/'));
    const citations = (D.citationsCible.get(cleCible({ person_id: personId })) ?? [])
      .concat(...(D.evPersonne.get(personId) ?? []).map((e) => D.citationsCible.get(`e:${e.id}`) ?? []));
    return {
      chrono: chronologie(D, personId), parents: parents(D, personId).liste, fratrie: fratrie(D, personId), unions: unionsDe(D, personId),
      photo: p.photo_media_id ?? photos[0]?.id ?? null,
      sources: citations.map((c) => ({ c, s: D.sources.get(c.source_id)! })).filter((x) => x.s),
      todos: (D.todosPersonne.get(personId) ?? []).filter((t) => !t.done),
    };
  });

  // ----- Ascendance (éventail) -----
  const fan = $derived.by(() => { arbre.version; return type === 'ascendance' ? calculerEventail(D, personId, generations, false) : null; });

  // ----- Descendance numérotée : 1, 1.1, 1.1.1… -----
  type Ligne = { num: string; id: string; profondeur: number; unions: { conjoint?: string; type: string; mariage: string }[] };
  const descendance = $derived.by(() => {
    arbre.version;
    if (type !== 'descendance') return [];
    const res: Ligne[] = [];
    const vus = new Set<string>();
    const parcourir = (id: string, num: string, prof: number) => {
      if (vus.has(id) || prof > generations) return;
      vus.add(id);
      const unions = unionsDe(D, id);
      res.push({
        num, id, profondeur: prof,
        unions: unions.map((u) => ({ conjoint: u.conjoint?.id, type: libelleUnion(u.union), mariage: u.mariage ? [afficherDate(u.mariage), nomLieu(D, u.mariage.place_id)].filter(Boolean).join(', ') : '' })),
      });
      let i = 1;
      for (const u of unions) for (const e of u.enfants) parcourir(e.p.id, `${num}.${i++}`, prof + 1);
    };
    parcourir(personId, '1', 1);
    return res;
  });

  const vieDetaillee = (id: string) => {
    const n = naissance(D, id), d = deces(D, id), q = D.personnes.get(id);
    return [
      n?.date_text || n?.place_id ? `${accord(q, 'né', 'née')} ${datePhrase(n)}${n?.place_id ? ` à ${nomLieu(D, n.place_id)}` : ''}` : '',
      d?.date_text || d?.place_id ? `${accord(q, 'décédé', 'décédée')} ${datePhrase(d)}${d?.place_id ? ` à ${nomLieu(D, d.place_id)}` : ''}` : '',
    ].filter(Boolean).join(', ');
  };
</script>

<div class="outils no-print">
  <a class="btn btn-ghost" href={lienPersonne(infos.id, personId)}><Icon name="back" size={16} /> Retour à la fiche</a>
  <div class="reglages">
    <select class="input" bind:value={format} aria-label="Format du papier"><option value="A4">A4</option><option value="A3">A3</option></select>
    <select class="input" bind:value={orientation} aria-label="Orientation"><option value="portrait">Portrait</option><option value="landscape">Paysage</option></select>
    {#if type !== 'fiche'}
      <select class="input" bind:value={generations} aria-label="Générations">
        {#each type === 'ascendance' ? [4, 5, 6, 7, 8] : [2, 3, 4, 5, 6, 8, 10] as g}<option value={g}>{g} générations</option>{/each}
      </select>
    {/if}
    <button class="btn btn-primary" onclick={() => window.print()}><Icon name="telecharger" size={16} /> Imprimer / Enregistrer en PDF</button>
  </div>
  <p class="muted small aide">Dans la fenêtre qui s’ouvre, choisissez l’imprimante « <b>Enregistrer au format PDF</b> » (ou « Microsoft Print to PDF »). Sur téléphone : Partager → Imprimer, puis écartez deux doigts sur l’aperçu pour obtenir le PDF.</p>
</div>

<article class="feuille {format} {orientation}" class:fiche-impr={type === 'fiche'}>
  <header class="entete">
    <div>
      <h1 class="titre">{titre}</h1>
      <p class="muted">{infos.name}{sosa ? ` · Sosa ${sosa.join(', ')}` : ''}</p>
    </div>
    <span class="logo titre">GeneaView</span>
  </header>

  {#if type === 'fiche' && fiche && p}
    <section class="identite">
      {#if fiche.photo}<img src={urlFichier(fiche.photo)} alt="" />{:else}<span class="monogramme">{initiales(p)}</span>{/if}
      <div>
        <p class="grand">{nomComplet(p)}</p>
        {#if p.nickname || p.married_name}<p>{[p.nickname && `dit « ${p.nickname} »`, p.married_name && `nom d’usage ${p.married_name}`].filter(Boolean).join(' · ')}</p>{/if}
        <p>{vieDetaillee(personId) || 'Dates inconnues'}{ageTexte(D, personId) ? ` (${ageTexte(D, personId)})` : ''}</p>
        {#if p.occupations}<p>Profession : {p.occupations}</p>{/if}
      </div>
    </section>

    <section>
      <h2>Famille</h2>
      <table>
        <tbody>
          {#each fiche.parents as x}<tr><th>{x.sex === 'F' ? 'Mère' : x.sex === 'M' ? 'Père' : 'Parent'}</th><td>{nomComplet(x)} <span class="muted">{vieCourte(D, x.id)}</span></td></tr>{/each}
          {#each fiche.unions as u}
            <tr><th>{u.conjoint ? accord(u.conjoint, 'Conjoint', 'Conjointe') : 'Union'}</th><td>{u.conjoint ? nomComplet(u.conjoint) : 'inconnu'} <span class="muted">{u.conjoint ? vieCourte(D, u.conjoint.id) : ''}{u.mariage?.date_text ? ` · ${libelleUnion(u.union).toLowerCase()} ${datePhrase(u.mariage)}` : ''}{u.mariage?.place_id ? ` à ${nomLieu(D, u.mariage.place_id)}` : ''}</span></td></tr>
            {#each u.enfants as e}<tr><th class="enfant">Enfant</th><td>{nomComplet(e.p)} <span class="muted">{vieCourte(D, e.p.id)}</span></td></tr>{/each}
          {/each}
          {#each fiche.fratrie as f}<tr><th>{f.demi ? accord(f.p, 'Demi-frère', 'Demi-sœur') : accord(f.p, 'Frère', 'Sœur')}</th><td>{nomComplet(f.p)} <span class="muted">{vieCourte(D, f.p.id)}</span></td></tr>{/each}
        </tbody>
      </table>
    </section>

    {#if fiche.chrono.length}
      <section>
        <h2>Chronologie</h2>
        <table class="chrono">
          <tbody>
            {#each fiche.chrono as l}<tr><th>{l.date || '—'}</th><td><b>{l.titre}</b>{l.lieu ? ` · ${l.lieu}` : ''}{l.texte ? ` — ${l.texte}` : ''}</td></tr>{/each}
          </tbody>
        </table>
      </section>
    {/if}

    {#if p.notes}<section><h2>Notes</h2><p class="notes">{p.notes}</p></section>{/if}

    {#if fiche.sources.length}
      <section>
        <h2>Sources</h2>
        <ol class="sources">
          {#each fiche.sources as { c, s }}<li><b>{s.title}</b> — {TYPES_SOURCE[s.type]}{s.reference ? `, ${s.reference}` : ''}{c.detail ? `, ${c.detail}` : ''} <i>({FIABILITES[s.reliability]})</i>{s.url ? ` · ${s.url}` : ''}</li>{/each}
        </ol>
      </section>
    {/if}

    {#if fiche.todos.length}
      <section><h2>À chercher</h2><ul>{#each fiche.todos as t}<li>☐ {t.text}</li>{/each}</ul></section>
    {/if}
  {/if}

  {#if type === 'ascendance' && fan}
    <svg class="eventail" viewBox="{-fan.rayon - 4} {-fan.rayon - 4} {2 * fan.rayon + 8} {fan.rayon * 1.52 + 8}" preserveAspectRatio="xMidYMid meet">
      {#each fan.segments as s (s.n)}
        <g class="seg {s.cote} g{s.gen}">
          <path d={s.d} />
          {#if s.texte}
            <text x={s.texte.x} y={s.texte.y} transform="rotate({s.texte.rot} {s.texte.x} {s.texte.y})" font-size={s.texte.taille} text-anchor="middle">
              {#each s.texte.lignes as l, i}<tspan x={s.texte.x} dy={i === 0 ? `${(-(s.texte.lignes.length - 1) / 2) * 1.15 + 0.35}em` : '1.15em'} font-weight={i === 0 ? 650 : 400}>{l}</tspan>{/each}
            </text>
          {/if}
        </g>
      {/each}
      <circle r={RAYON_CENTRE - 3} class="centre" />
      <text y="-4" text-anchor="middle" font-size="13" font-weight="700">{nomCourt(p)}</text>
      <text y="14" text-anchor="middle" font-size="10">{vieCourte(D, personId)}</text>
    </svg>
    <p class="muted small legende">Lignée paternelle à gauche, maternelle à droite · {generations} générations · {fan.segments.filter((s) => s.id).length} ancêtres connus</p>
  {/if}

  {#if type === 'descendance'}
    <ol class="descendance">
      {#each descendance as l (l.num)}
        {@const q = D.personnes.get(l.id)}
        <li style="--prof:{l.profondeur - 1}">
          <span class="num">{l.num}</span>
          <div>
            <b>{nomComplet(q)}</b> <span class="muted">{vieDetaillee(l.id)}</span>
            {#each l.unions.filter((u) => u.conjoint || u.mariage) as u}
              <div class="union">{u.type === 'Union' ? 'Union' : u.type} {u.conjoint ? `avec ${nomComplet(D.personnes.get(u.conjoint))}` : ''} <span class="muted">{u.conjoint ? vieCourte(D, u.conjoint) : ''}{u.mariage ? ` · ${u.mariage}` : ''}</span></div>
            {/each}
          </div>
        </li>
      {/each}
    </ol>
    <p class="muted small legende">{descendance.length} personnes sur {generations} générations · numérotation : 1.2.1 = premier enfant du deuxième enfant</p>
  {/if}

  <footer class="pied muted small">Imprimé depuis GeneaView le {new Date().toLocaleDateString('fr-FR')}</footer>
</article>

<style>
  .outils { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
  .reglages { display: flex; flex-wrap: wrap; gap: 8px; }
  .reglages .input { width: auto; padding-right: 32px; }
  .aide { max-width: 760px; }
  /* Aperçu à l'écran : une feuille blanche aux proportions du papier */
  .feuille { background: #fff; color: #1c251d; padding: 14mm; margin: 0 auto; box-shadow: var(--shadow-lg); border-radius: 4px; display: flex; flex-direction: column; gap: 14px; }
  .A4.portrait { width: 210mm; min-height: 297mm; }
  .A4.landscape { width: 297mm; min-height: 210mm; }
  .A3.portrait { width: 297mm; min-height: 420mm; }
  .A3.landscape { width: 420mm; min-height: 297mm; }
  .entete { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding-bottom: 8px; border-bottom: 2px solid #2f6b4f; }
  .entete h1 { font-size: 24px; }
  .logo { color: #2f6b4f; font-size: 15px; }
  h2 { font: 600 16px var(--titre); margin: 0 0 6px; color: #25593f; border-bottom: 1px solid #dfe3d5; padding-bottom: 3px; }
  section { break-inside: avoid; }
  .identite { display: flex; gap: 16px; align-items: center; }
  .identite img, .monogramme { width: 90px; height: 110px; object-fit: cover; border-radius: 6px; border: 1px solid #c7cebb; flex: none; }
  .monogramme { display: grid; place-items: center; font: 600 28px var(--titre); color: #2f6b4f; background: #e0eee5; }
  .grand { font: 600 20px var(--titre); }
  .identite p { margin: 2px 0; font-size: 13.5px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { text-align: left; padding: 3px 6px; vertical-align: top; border-bottom: 1px solid #eef0e8; }
  th { width: 120px; font-weight: 600; color: #4a5649; }
  th.enfant { padding-left: 18px; font-weight: 500; }
  .chrono th { width: 150px; font-weight: 500; }
  .notes { white-space: pre-line; font-size: 12.5px; }
  .sources { font-size: 12px; padding-left: 18px; margin: 0; }
  .sources li { margin-bottom: 3px; }
  ul { font-size: 12.5px; padding-left: 4px; list-style: none; margin: 0; }
  .muted { color: #6b7769; }
  .eventail { width: 100%; flex: 1; max-height: 100%; }
  .seg path { stroke: #fff; stroke-width: 1.2; }
  .pat path { fill: color-mix(in srgb, #3d6e9e var(--k), #fff); }
  .mat path { fill: color-mix(in srgb, #b4566c var(--k), #fff); }
  .g1 { --k: 40%; } .g2 { --k: 32%; } .g3 { --k: 25%; } .g4 { --k: 19%; } .g5 { --k: 15%; } .g6 { --k: 12%; } .g7 { --k: 9%; } .g8 { --k: 7%; }
  .eventail text { fill: #1c251d; font-family: var(--font); }
  .centre { fill: #fff; stroke: #2f6b4f; stroke-width: 2; }
  .legende { text-align: center; }
  .descendance { list-style: none; margin: 0; padding: 0; font-size: 12.5px; }
  .descendance li { display: flex; gap: 8px; padding: 3px 0 3px calc(var(--prof) * 18px); border-bottom: 1px solid #f1f3ec; break-inside: avoid; }
  .num { flex: none; min-width: 44px; font-weight: 700; color: #2f6b4f; font-variant-numeric: tabular-nums; }
  .union { font-size: 12px; color: #4a5649; }
  .pied { margin-top: auto; padding-top: 8px; border-top: 1px solid #dfe3d5; text-align: right; }
  @media (max-width: 900px) { .feuille { width: 100% !important; min-height: 0 !important; padding: 16px; } }

  /* À l'impression : seulement la feuille, sans ombre ni marges d'écran */
  @media print {
    .no-print { display: none !important; }
    .feuille { width: auto !important; min-height: 0 !important; padding: 0; box-shadow: none; border-radius: 0; }
    :global(body) { background: #fff !important; }
  }
</style>
