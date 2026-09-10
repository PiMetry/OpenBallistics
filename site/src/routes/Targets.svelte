<script lang="ts">
  import ScaleRuler from '../components/ScaleRuler.svelte';
  import { Label } from '$lib/components/ui/label/index.js';
  import { NativeSelect } from '$lib/components/ui/native-select/index.js';
  import { Button as ShadcnButton } from '$lib/components/ui/button/index.js';

  import AddAction from '../components/AddAction.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { t } from '../lib/i18n.svelte';
  import * as records from '../lib/records.svelte';
  import { readPref, writePref } from '../lib/prefs';
  import { href } from '../lib/router';
  import { TARGET_FACES, asTargetFace } from '../lib/target-catalogue';
  import { downloadJson } from '../lib/download';
  import { targetExtentMm, targetSvg, type TargetFace } from '@lib/targets';

  // Selected face and zoom are preferences, separate from target records.
  /** Every face the dataset carries, whichever body published it. */
  const CATALOGUE = TARGET_FACES;

  let faceId = $state(CATALOGUE[0]!.id);
  let restored = $state(false);
  let error = $state('');
  let deleting = $state(false);
  let extent = $state<'card' | 'rings'>(readPref('targets.extent', ['card', 'rings'] as const, 'card'));


  $effect(() => writePref('targets.extent', extent));
  $effect(() => { if (restored) writePref('targets.face', faceId); });

  const allFaces = $derived<TargetFace[]>([
    ...CATALOGUE,
    ...records.state.targetFaces.map(f => asTargetFace(f, t('targets.noRulebook')))
  ]);

  const face = $derived<TargetFace>(allFaces.find((f) => f.id === faceId) ?? CATALOGUE[0]!);
  $effect(() => {
    if (!records.state.ready) return;
    if (!restored) {
      faceId = readPref('targets.face', allFaces.map(f => f.id), CATALOGUE[0]!.id);
      restored = true;
    } else if (!allFaces.some(f => f.id === faceId)) {
      faceId = CATALOGUE[0]!.id;
    }
  });

  async function remove(id: string) {
    error = '';
    deleting = true;
    try { await records.removeTargetFace(id); }
    catch { error = t('targetEditor.deleteError'); }
    finally { deleting = false; }
  }

  const picture = $derived(targetSvg(face, { extent }));

  /**
   * The drawing's share of the printed sheet, in millimetres.
   *
   * A4 portrait with the 15 mm margin the print rules set is 180 x 267 mm of paper. The rest of
   * the sheet - the masthead over the drawing, the scale bar under it and the specification below
   * that - was measured across all 24 faces and costs at most 79.5 mm, on the face with the most
   * rings, three rulebooks and a note; 85 are kept back, which leaves the drawing 182.
   *
   * A face that fits both numbers prints at 1:1, which is the only scale a target is any use at:
   * the drawing is the target, and one that is 96 % of the size it names scores a different shot
   * than the range does. A face that does not fit - a 300 m face is more than a metre across - is
   * brought down to the paper and the sheet says, in print, what it was reduced to. The
   * alternative is either a target that is quietly the wrong size or nine pages to tape together.
   */
  const PRINT_WIDTH_MM = 180;
  const PRINT_HEIGHT_MM = 182;
  const printExtent = $derived(targetExtentMm(face, { extent }));
  const printScale = $derived(
    Math.min(
      1,
      PRINT_WIDTH_MM / printExtent.widthMm,
      PRINT_HEIGHT_MM / printExtent.heightMm
    )
  );
  /** Rounded down, because a sheet may not claim to be larger than it is. */
  const printPercent = $derived(`${Math.floor(printScale * 100)} %`);
</script>
<div data-ui="Targets" class="contents">

<PageHeader title={t('targets.title')} description={t('targets.databaseLede')}>
  {#snippet actions()}<AddAction label={t('actions.addTarget')} href={href.newTarget()} />{/snippet}
</PageHeader>

<form class="inputs filters" onsubmit={(e) => e.preventDefault()}>
  <Label>
    {t('targets.face')}
    <NativeSelect data-report-context="Target" bind:value={faceId} disabled={!restored}>
      {#each allFaces as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
    </NativeSelect>
  </Label>
  <Label>
    {t('targets.extent')}
    <NativeSelect bind:value={extent}>
      <option value="card">{t('targets.wholeCard')}</option>
      <option value="rings">{t('targets.ringsOnly')}</option>
    </NativeSelect>
  </Label>

</form>



<div class="target-detail">
<div class="visual">
<!--
  The sheet's own masthead: on screen the face is named by the control that chose it, and paper has
  no control to read. Which face, from which rulebook, and at what scale it came off the printer.
  The distance and the card are not repeated here - the specification under the drawing prints them.
-->
<div class="print-title">
  <h2>{face.name}</h2>
  <p>{face.source.body} {face.source.rulebook} {face.source.edition}, {t('targets.rule')} {face.source.rule}</p>
  <p class="print-scale" class:reduced={printScale < 1}>
    {printScale < 1 ? t('targets.printReduced', { percent: printPercent }) : t('targets.printTrue')}
  </p>
</div>
<div class="sheet" style={`--print-width: ${(printExtent.widthMm * printScale).toFixed(1)}mm`}>
  <!--
    `@html` is safe here: the markup is built by `targetSvg` from the face's own numbers, which it
    rounds, and the one string it embeds it escapes. Nothing typed on this page reaches it raw.
  -->
  {@html picture}
</div>
<ScaleRuler />

<div class="actions"><ShadcnButton href={href.targetScoring(face.id)}>{t('targets.openScore')}</ShadcnButton><ShadcnButton variant="outline" type="button" onclick={() => window.print()}>{t('targets.print')}</ShadcnButton><ShadcnButton variant="outline" type="button" onclick={() => downloadJson(face, `${face.id}.json`)}>{t('targetEditor.download')}</ShadcnButton></div>

</div>
<div class="specification">
<dl class="cited">
  {#if face.cardMm}
    <dt>{t('targets.card')}</dt>
    <dd>{face.cardMm.width} x {face.cardMm.height} mm</dd>
  {/if}
  <dt>{t('targets.distances')}</dt><dd>{(face.distancesM ?? [face.distanceM]).join(', ')} m</dd>
  <dt>{t('targets.scoringMethod')}</dt><dd>{t(face.scoringMethod === 'centre' ? 'targets.scoreCentre' : 'targets.scoreEdge')}</dd>
  {#if face.ruleSources?.length}
    <dt>{t('targets.rulesChecked')}</dt>
    <dd><ul class="rule-sources">{#each face.ruleSources as source}<li><a href={source.url} target="_blank" rel="noreferrer">{source.body} {source.rulebook}</a></li>{/each}</ul></dd>
  {/if}
  {#if face.note}
    <dt>{t('targets.note')}</dt>
    <dd>{face.note}</dd>
  {/if}
</dl>

<table><thead><tr><th>{t('targets.ring')}</th><th>{t('targets.diameter')}</th></tr></thead><tbody>{#each face.rings as ring}<tr><td>{ring.score}</td><td>{ring.diameterMm}</td></tr>{/each}</tbody></table>
</div>
</div>


{#if error}<p role="alert">{error}</p>{/if}
{#if records.state.targetFaces.length}
  <section class="own">
    <h2>{t('targetEditor.mine')}</h2>
    <ul class="mine">
      {#each records.state.targetFaces as own (own.id)}
        <li>
          <ShadcnButton variant="outline" type="button" class="linkish" onclick={() => (faceId = own.id)}>{own.name}</ShadcnButton>
          <span class="quiet">{own.rings.length} / {own.distanceM} m</span>
          <ShadcnButton variant="outline" type="button" disabled={deleting} onclick={() => remove(own.id)}>{t('targets.deleteFace')}</ShadcnButton>
        </li>
      {/each}
    </ul>
  </section>
{/if}



</div>
<style>
  @layer legacy {
  :global([data-ui="Targets"] .filters) { padding: var(--panel-padding); border: 1px solid var(--rule); border-radius: var(--panel-radius); background: var(--surface); }
  :global([data-ui="Targets"] .filters [data-slot="label"]:first-child) { flex: 2 1 20rem; }
  :global([data-ui="Targets"] .filters [data-slot="label"]:last-child) { flex: 1 1 12rem; }
  :global([data-ui="Targets"] .target-detail) { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; gap: var(--section-gap); margin-top: var(--section-gap); }
  :global([data-ui="Targets"] .visual),
:global([data-ui="Targets"] .specification) { min-width: 0; padding: var(--panel-padding); border: 1px solid var(--rule); border-radius: var(--panel-radius); background: var(--surface); }
  :global([data-ui="Targets"] .target-detail .sheet) { margin-top: 0; }
  :global([data-ui="Targets"] .target-detail .cited) { grid-template-columns: minmax(6rem, auto) minmax(0, 1fr); margin-top: 0; }
  @media (max-width: 800px) { :global([data-ui="Targets"] .target-detail) { grid-template-columns: minmax(0, 1fr); } }

  :global([data-ui="Targets"] .rule-sources) { padding: 0; margin: 0; list-style: none; } :global([data-ui="Targets"] .rule-sources li + li) { margin-top: .4rem; }
  :global([data-ui="Targets"] .inputs) { display: flex; flex-wrap: wrap; gap: .75rem; margin: 1rem 0; }
  :global([data-ui="Targets"] [data-slot="label"]) { display: grid; gap: .25rem; min-width: 0; max-width: 100%; font-size: .9rem; }
  :global([data-ui="Targets"] [data-slot="native-select"]) { min-width: 0; max-width: 100%; }
  :global([data-ui="Targets"] .sheet) { margin: 1rem 0; max-width: 32rem; }
  :global([data-ui="Targets"] .sheet svg) { width: 100%; height: auto; display: block; }
  :global([data-ui="Targets"] .cited) { margin: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: .4rem 1rem; max-width: 60rem; font-size: .9rem; }
  :global([data-ui="Targets"] dd) { margin: 0; overflow-wrap: anywhere; } :global([data-ui="Targets"] dt),
:global([data-ui="Targets"] .quiet) { color: var(--ink-2); }
  :global([data-ui="Targets"] table) { width: 100%; border-collapse: collapse; margin-block: 1.5rem; }
  :global([data-ui="Targets"] th),
:global([data-ui="Targets"] td) { text-align: left; padding: .4rem .7rem; border-bottom: 1px solid var(--rule); }
  :global([data-ui="Targets"] .own) { margin-top: 2rem; border-top: 1px solid var(--rule); padding-top: 1rem; }
  :global([data-ui="Targets"] h2) { font-size: 1.1rem; }
  :global([data-ui="Targets"] .actions) { padding-top: var(--space-4); border-top: 1px solid var(--rule); display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; }
  :global([data-ui="Targets"] [data-slot="button"]) { min-height: var(--control-height); padding: .4rem .75rem; border: 1px solid var(--rule-strong); border-radius: var(--radius); background: var(--surface); }
  :global([data-ui="Targets"] .mine) { padding: 0; list-style: none; } :global([data-ui="Targets"] .mine li) { display: flex; flex-wrap: wrap; gap: .5rem; margin-block: .5rem; }
  @media (max-width: 48rem) { :global([data-ui="Targets"] .target-detail) { grid-template-columns: minmax(0, 1fr); gap: 1rem; } }

  /* The masthead belongs to the paper. On screen the face is named by the control that chose it
     and the citation is in the panel beside the drawing; both would be a second, worse copy. */
  :global([data-ui="Targets"] .print-title) { display: none; }

  /* The sheet: the face, at the size it really is.

     A target is not an illustration of a target. What comes off the printer is shot at and scored
     with a gauge, so the one thing the page owes it is that a 100 mm ring measures 100 mm on the
     paper - which is why the drawing is sized in millimetres here rather than left to fill the
     column. The SVG's viewBox is already in millimetres, so a box of `width: 154mm` around a
     154 mm face is 1:1 exactly, and the ruler beneath it is measured from the rendered drawing at
     `beforeprint` and prints whatever scale it actually came out at.

     `@page` matches the cartridge sheet's 15 mm rather than choosing its own. A route's styles
     stay in the document after the reader leaves it, `@page` is a document-wide rule, and two
     pages that disagree about the margin would leave the winner to whichever route was opened
     last - and the millimetres above are only true at one of them.

     Everything else goes. The filters chose the face and the choice is made; the citation and the
     ring table are reference reading, and the sheet's own masthead carries the rulebook and rule
     for the record; the saved faces are a list of other targets. What is left is a target. */
  @media print {
    @page {
      size: A4 portrait;
      margin: 1.5cm;
    }
    :global([data-ui="Targets"] > header),
:global([data-ui="Targets"] .filters),
:global([data-ui="Targets"] .actions),
:global([data-ui="Targets"] .own) {
      display: none !important;
    }
    :global([data-ui="Targets"] .print-title) {
      display: block;
      margin: 0 0 4mm;
    }
    :global([data-ui="Targets"] .print-title h2) {
      font-size: 1.1rem;
      margin: 0;
      border: 0;
      padding: 0;
      text-transform: none;
      letter-spacing: 0;
    }
    :global([data-ui="Targets"] .print-title p) {
      margin: 0.15rem 0 0;
      font-size: 0.7rem;
      color: var(--ink-2);
    }
    /* A reduced face is not a target, and the line that says so is the only thing standing between
       a printed sheet and a score card made against the wrong diameters. */
    :global([data-ui="Targets"] .print-scale.reduced) {
      font-weight: 600;
      color: var(--ink);
    }
    :global([data-ui="Targets"] .target-detail) {
      display: block;
      margin: 0;
      gap: 0;
    }
    :global([data-ui="Targets"] .visual) {
      padding: 0;
      border: 0;
      background: none;
    }
    :global([data-ui="Targets"] .sheet) {
      width: var(--print-width);
      max-width: 100%;
      margin: 0 auto;
      break-inside: avoid;
    }
    :global([data-ui="Targets"] .sheet svg) {
      width: 100%;
      height: auto;
    }
    /* The specification, under the face rather than beside it.

       Beside it is where the screen puts it, and on paper that would cost the drawing half the
       width - which is the half the 1:1 rule is spent on. Under it, the two compete for the page's
       height instead, and the drawing's share of that is the budget above.

       Two columns of its own: what the face is, and what it scores. The ring table is the taller
       of the two and it is the one a scorer reads down. */
    :global([data-ui="Targets"] .specification) {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
      align-items: start;
      gap: 0 6mm;
      margin-top: 3mm;
      padding: 0;
      border: 0;
      background: none;
      break-inside: avoid;
      line-height: 1.3;
    }
    :global([data-ui="Targets"] .specification .cited) {
      grid-template-columns: minmax(5.5rem, auto) minmax(0, 1fr);
      gap: 0.1rem 0.6rem;
      font-size: 0.65rem;
    }
    :global([data-ui="Targets"] .specification table) {
      margin: 0;
      font-size: 0.65rem;
    }
    :global([data-ui="Targets"] .specification th),
:global([data-ui="Targets"] .specification td) {
      padding: 0.05rem 0.5rem 0.05rem 0;
      border-bottom: 0;
    }
    :global([data-ui="Targets"] .specification th) {
      border-bottom: 1px solid var(--rule);
    }
    /* The rulebook links are addresses on screen and ink on paper; the body and the rulebook are
       what identifies them, and they are already the text of the link. */
    :global([data-ui="Targets"] .rule-sources a) {
      text-decoration: none;
      color: inherit;
    }
    :global([data-ui="Targets"] .rule-sources li + li) {
      margin-top: 0.1rem;
    }
  }
  }
</style>
