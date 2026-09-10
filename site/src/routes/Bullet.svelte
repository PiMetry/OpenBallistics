<script lang="ts">
  import CipBadge from '../components/CipBadge.svelte';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { ArrowUpRight } from '@lucide/svelte';
  import ScaleRuler from '../components/ScaleRuler.svelte';
  import { Button as ShadcnButton } from '$lib/components/ui/button/index.js';

  import { bulletByKey, cartridgesFor, loadBullet, type BulletRecord } from '../lib/bullets';
  import { entries } from '../lib/data';
  import { bulletFromRecord, liveBulletDrawing } from '@lib/render2d';
  import { STYLES } from '@lib/core';
import {
  rememberStyle,
  storedStyle,
  styleLabel,
  styleNote
} from '../lib/drawings';
  import { t, type Key } from '../lib/i18n.svelte';
  import { href } from '../lib/router';
  import { PX_PER_MM } from '@lib/core';
  import { type DrawingStyle } from '@lib/core';
import { familyLabel } from '../lib/labels';

  interface Props {
    key: string;
  }
  let { key }: Props = $props();

  let matchQuery = $state('');
  $effect(() => { key; matchQuery = ''; });

  const entry = $derived(bulletByKey(key));
  const record = $derived(loadBullet(key));

  /** The same picks as a cartridge page, sharing the stored style; the dimensions default on. */
  let style = $state<DrawingStyle>(storedStyle());
  let dimensions = $state(true);

  /**
   * How large the drawing is shown. A bullet is thirty millimetres long, and at life size the
   * dimension symbols are a millimetre high; so it is enlarged up to four times - the scale the
   * file was drawn at, where the symbols read - and less only where the panel is narrower.
   */
  const MAX_ZOOM = 4;
  let panelWidth = $state(0);
  function zoom(size: [number, number]): number {
    const life = size[0] * PX_PER_MM;
    if (!panelWidth) return 1;
    return Math.max(1, Math.min(MAX_ZOOM, (panelWidth - 40) / life));
  }
  function setStyle(next: DrawingStyle) {
    style = next;
    rememberStyle(next);
  }
  /** The catalogue's drawing, made here from the record: the same drawing the file is. */
  function drawn(data: BulletRecord, k: number) {
    try {
      const { bullet } = bulletFromRecord(data);
      return liveBulletDrawing(data, bullet, {
        style, dimensions, pixelsPerMm: PX_PER_MM * k, className: style === 'technical' ? 'plate technical' : 'plate'
      });
    } catch {
      return null;
    }
  }

  /**
   * The catalogue's symbols, in the order the drawing stacks them, each with the record field it
   * reads and the derived figure the drawing was made with. A field the build assumed is said to
   * be, beside its value, which is the whole point of publishing the derived block.
   */
  const ROWS: { symbol: string; label: Key; field: string; derived: keyof BulletRecord['derived'] }[] = [
    { symbol: 'D', label: 'bullets.diameter', field: 'diameter', derived: 'length' },
    { symbol: 'L', label: 'bullets.length', field: 'length', derived: 'length' },
    { symbol: 'Lbt', label: 'bullets.boatTail', field: 'base.length', derived: 'boatTail' },
    { symbol: 'Lb', label: 'bullets.bearing', field: 'bearing', derived: 'bearing' },
    { symbol: 'Ln', label: 'bullets.nose', field: 'nose', derived: 'nose' },
    { symbol: 'Lbo', label: 'bullets.baseToOgive', field: 'base_to_ogive', derived: 'length' },
    { symbol: 'Db', label: 'bullets.baseDiameter', field: 'base.diameter', derived: 'baseDiameter' },
    { symbol: 'Dm', label: 'bullets.meplat', field: 'meplat', derived: 'meplat' }
  ];

  function value(data: BulletRecord, row: (typeof ROWS)[number]): number | null {
    if (row.symbol === 'D') return data.diameter;
    if (row.symbol === 'Lbo') return data.base_to_ogive ?? null;
    return data.derived[row.derived] as number;
  }
  function sourced(data: BulletRecord, field: string): boolean {
    return data.sources.some((source) => source.fields.some((f) => f === field || field.startsWith(f + '.')));
  }
  const grains = (mass: number) => (mass / 0.06479891).toFixed(0);
</script>
<div data-ui="Bullet" class="contents">

{#await record}
  <p class="status">{t('record.loading', { name: entry?.name ?? key })}</p>
{:then data}
  {@const fits = entry ? cartridgesFor(entry, entries) : []}
  <header class="head">
    <div>
      <p class="eyebrow flex items-center gap-2">{#if data.sample}<Badge variant="secondary">{t('bullets.sample')}</Badge>{/if}{data.manufacturer}{#if data.line} · {data.line}{/if}</p>
      <h1>{data.name}</h1>
      <p class="alt">{t(data.sample ? 'bullets.sampleId' : 'bullets.partNumber')} <span class="num">{data.model}</span> · {data.calibre} · {grains(data.mass)} gr · {data.mass} g</p>
    </div>
    <dl class="meta">
      {#if data.ballistics.g1}<dt>G1</dt><dd class="num">{data.ballistics.g1}</dd>{/if}
      {#if data.ballistics.g7}<dt>G7</dt><dd class="num">{data.ballistics.g7}</dd>{/if}
      <dt>SD</dt><dd class="num">{data.derived.sectionalDensity}</dd>
      {#if data.recommended_twist}<dt>{t('bullets.twist')}</dt><dd class="num">{data.recommended_twist}</dd>{/if}
    </dl>
  </header>

  {#if data.sample}
    <p class="sample-note rounded-lg border bg-muted/40 p-4 text-sm text-foreground">{t('bullets.sampleNote')}</p>
  {/if}

  {#if entry?.svg && entry.tight}
    {@const size = dimensions ? entry.svg : entry.tight}
    {@const k = zoom(size)}
    {@const made = drawn(data, k)}
    <div class="views">
      <div class="view">
        <div class="inline-flex isolate" role="group" aria-label={t('draw.style')}>
          {#each STYLES as option (option)}
            <ShadcnButton variant={option === style ? 'default' : 'outline'} class="-ml-px rounded-none first:ml-0 first:rounded-l-md last:rounded-r-md focus-visible:relative focus-visible:z-10" type="button"   aria-pressed={option === style}
              title={styleNote(option)} onclick={() => setStyle(option)}>
              <span class="option-name">{styleLabel(option)}</span>
            </ShadcnButton>
          {/each}
        </div>
        <div class="options" role="group" aria-label={t('draw.dimensions')}>
          <ShadcnButton variant={dimensions ? 'default' : 'outline'}  type="button"   aria-pressed={dimensions}
            onclick={() => (dimensions = !dimensions)}>
            <span class="option-name">{t('draw.dimensions')}</span>
          </ShadcnButton>
        </div>
      </div>
    </div>
    <!--
      Life size, lying down, in a box that pans if a window is narrower than the drawing. A bullet
      is thirty millimetres long; there is nothing to fit.
    -->
    <figure class="drawing" bind:clientWidth={panelWidth}>
      {#if made}
        <span class="plate-live" role="img" aria-label={`${data.manufacturer} ${data.name}, drawn to scale`}
          style={`width:${(size[0] * PX_PER_MM * k).toFixed(1)}px;height:${(size[1] * PX_PER_MM * k).toFixed(1)}px`}>
          {@html made.markup}
        </span>
      {/if}
      <ScaleRuler widthMm={made?.widthMm} />
    </figure>
  {/if}

  <div class="sheet">
    <section class="side">
      <h2>{t('bullets.measurements')}</h2>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to pan the measurement table.) -->
      <div class="scroll-x" role="region" aria-label={t('bullets.measurements')} tabindex={0}>
      <table>
        <caption class="sr-only">{t('bullets.measurements')}</caption>
        <tbody>
          {#each ROWS as row (row.symbol)}
            {@const v = value(data, row)}
            {#if v !== null && !(row.symbol === 'Lbt' && data.base.type === 'flat')}
              {@const assumed = data.derived.assumed.includes(row.field)}
              <tr class:assumed>
                <td class="num symbol">{row.symbol}</td>
                <td>{t(row.label)}</td>
                <td class="num value">{v} <span class="unit">mm</span></td>
                <td class="prov">
                  {#if data.sample}{t('bullets.sample')}{:else if assumed}{t('bullets.assumed')}{:else if sourced(data, row.field)}{t('bullets.sourced')}{:else}{t('bullets.derived')}{/if}
                </td>
              </tr>
            {/if}
          {/each}
          <tr>
            <td class="num symbol">R</td>
            <td>{t('bullets.ogive')} · {data.ogive.form}</td>
            <td class="num value">{data.derived.ogiveRadiusCalibres} <span class="unit">cal</span></td>
            <td class="prov">{data.sample ? t('bullets.sample') : data.derived.assumed.includes('ogive.radius_calibres') ? t('bullets.assumed') : t('bullets.sourced')}</td>
          </tr>
          {#if data.derived.boatTailAngle}
            <tr class:assumed={data.derived.assumed.includes('base.angle')}>
              <td class="num symbol">β</td>
              <td>{t('bullets.boatTailAngle')}</td>
              <td class="num value">{data.derived.boatTailAngle}°</td>
              <td class="prov">{data.sample ? t('bullets.sample') : data.derived.assumed.includes('base.angle') ? t('bullets.assumed') : t('bullets.sourced')}</td>
            </tr>
          {/if}
        </tbody>
      </table>
      </div>
      {#if !data.sample}<p class="note">{t('bullets.assumedNote')}</p>{/if}
    </section>
    <section class="side">
      <h2>{t('bullets.construction')}</h2>
      <p class="plain">
        {data.base.type.replace('_', ' ')} · {data.tip.type.replace('_', ' ')} · {data.construction.jacket.toUpperCase()} ·
        {data.construction.jacket_material.toLowerCase().replace('_', ' ')} / {data.construction.core_material.toLowerCase()}
      </p>
      {#if data.notes && !data.sample}<p class="note">{data.notes}</p>{/if}
    </section>

  </div>

  {#if fits.length}
    {@const matches = fits.filter(cartridge => `${cartridge.name} ${cartridge.alt.join(' ')} ${cartridge.key}`.toLowerCase().includes(matchQuery.trim().toLowerCase()))}
    <section class="catalogue mt-8 space-y-5 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="matching-cartridges">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 space-y-2">
          <h2 id="matching-cartridges" class="m-0 border-0 p-0 text-lg normal-case tracking-tight">{t('bullets.fits')}</h2>
          <p class="m-0 text-sm text-muted-foreground">{t('bullets.fitsNote')}</p>
        </div>
        <Badge variant="secondary">{matches.length} / {fits.length}</Badge>
      </div>
      <Label class="max-w-sm">{t('list.search')}<Input type="search" bind:value={matchQuery} placeholder={t('bullets.searchCartridges')} /></Label>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {#each matches as cartridge (cartridge.key)}
          <ShadcnButton href={href.cartridge(cartridge.key)} variant="outline" class="h-auto min-h-20 justify-between gap-3 whitespace-normal p-4 text-left">
            <span class="grid min-w-0 gap-1">
              <span class="font-semibold">{cartridge.name}</span>
              <span class="flex flex-wrap items-center gap-2 text-xs font-normal text-muted-foreground"><CipBadge />{familyLabel(cartridge.family)}</span>
            </span>
            <ArrowUpRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </ShadcnButton>
        {/each}
      </div>
      {#if !matches.length}<p role="status" class="text-sm text-muted-foreground">{t('bullets.noMatches')}</p>{/if}
    </section>
  {/if}

  <p class="foot">
    <a href={href.bullets()}>{t('bullets.back')}</a>
  </p>
{:catch error}
  <p class="status error">{error.message} <a href={href.bullets()}>{t('bullets.back')}</a></p>
{/await}

</div>
<style>
  @layer legacy {
  :global([data-ui="Bullet"] .plate-live) {
    display: block;
  }
  :global([data-ui="Bullet"] .plate-live svg) {
    display: block;
  }

  :global([data-ui="Bullet"] .head > div) { min-width: 0; }
  :global([data-ui="Bullet"] .head .eyebrow) { margin: 0 0 .375rem; }
  :global([data-ui="Bullet"] .head) {
    padding-bottom: var(--space-6);
    border-bottom: 1px solid var(--rule);
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 1rem 2rem;
    align-items: start;
  }
  :global([data-ui="Bullet"] h1) {
    font-size: clamp(var(--step-3), 1.2rem + 2vw, var(--step-4));
    line-height: 1.15;
    letter-spacing: -0.01em;
  }
  :global([data-ui="Bullet"] .alt) {
    margin: 0.25rem 0 0;
    color: var(--ink-2);
    font-size: var(--step-0);
  }
  :global([data-ui="Bullet"] .meta) {
    display: grid;
    grid-template-columns: minmax(0, auto) minmax(0, 1fr);
    gap: 0.1rem 0.9rem;
    margin: 0;
    font-size: var(--step-0);
  }
  :global([data-ui="Bullet"] .meta dt) {
    color: var(--ink-3);
  }
  :global([data-ui="Bullet"] .meta dd) {
    margin: 0;
    text-align: right;
  }
  :global([data-ui="Bullet"] .views) {
    margin: 1.5rem 0 0;
  }
  :global([data-ui="Bullet"] .view) {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.6rem;
  }
  :global([data-ui="Bullet"] .options) {
    display: flex;
    gap: 0.3rem;
  }
  :global([data-ui="Bullet"] .drawing) {
    margin: 0.75rem 0 1.5rem;
    padding: var(--panel-padding);
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    overflow-x: auto;
  }
  :global([data-ui="Bullet"] .plate-live) { display: block; margin-inline: auto; }
  :global([data-ui="Bullet"] .drawing figcaption) { text-align: center; }
  :global([data-ui="Bullet"] .drawing .plate) {
    display: block;
    max-width: none;
    margin: 0 auto;
  }
  :global([data-ui="Bullet"] .drawing .plate.technical) {
    filter: var(--line-art);
  }
  :global([data-ui="Bullet"] .sheet) {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2rem;
  }
  @media (min-width: 58rem) {
    :global([data-ui="Bullet"] .sheet) {
      grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
      gap: 2.5rem;
    }
  }
  :global([data-ui="Bullet"] h2) {
    font-size: var(--step-1);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid var(--rule-strong);
    margin-bottom: 1rem;
  }
  :global([data-ui="Bullet"] h3) {
    font-size: var(--step-0);
    margin: 1.25rem 0 0.3rem;
  }
  :global([data-ui="Bullet"] table) {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--step-0);
  }
  :global([data-ui="Bullet"] td) {
    padding: 0.3rem 0.6rem 0.3rem 0;
    border-bottom: 1px solid var(--rule);
    vertical-align: baseline;
  }
  :global([data-ui="Bullet"] .symbol) {
    color: var(--ink-2);
    width: 3rem;
  }
  :global([data-ui="Bullet"] td.value) {
    text-align: right;
    font-weight: 500;
    white-space: nowrap;
  }
  :global([data-ui="Bullet"] .unit) {
    font-size: 0.78em;
    color: var(--ink-3);
    font-weight: 400;
  }
  :global([data-ui="Bullet"] .prov) {
    color: var(--ink-3);
    font-size: 0.78rem;
    text-align: right;
  }
  :global([data-ui="Bullet"] tr.assumed td) {
    color: var(--ink-3);
  }
  :global([data-ui="Bullet"] tr.assumed td.value) {
    font-weight: 400;
  }
  :global([data-ui="Bullet"] .note) {
    margin: 0.6rem 0 0;
    font-size: 0.78rem;
    color: var(--ink-2);
    max-width: 62ch;
  }
  :global([data-ui="Bullet"] .plain) {
    margin: 0;
    font-size: var(--step-0);
    color: var(--ink-2);
  }
  :global([data-ui="Bullet"] .muted) {
    color: var(--ink-3);
    font-size: 0.85em;
  }
  :global([data-ui="Bullet"] .status) {
    color: var(--ink-2);
  }
  :global([data-ui="Bullet"] .foot) {
    margin-top: 2.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--rule);
    color: var(--ink-2);
    font-size: var(--step-0);
  }

  /* The sheet.
     What prints is the record: the title block, the drawing, the measurements and where each
     figure came from. The controls choose which drawing is shown and on paper the choice has
     already been made; the calibre matches and the way back to the list are pointers to other
     pages, which paper cannot follow. The site's own footer is taken off the sheet in
     `App.svelte`, where that markup lives.

     The sample notice stays. It is the one line saying these figures are illustrative rather than
     a maker's, and a page of numbers that has lost it reads as a specification for a bullet
     nobody makes - so it prints, in small type under the title rather than as a box. */
  @media print {
    /* The cartridge sheet's margin, not one of its own: a route's styles stay in the document
       after the reader leaves it and `@page` is document-wide, so two pages that disagree leave
       the margin to whichever was opened last. */
    @page {
      size: A4 portrait;
      margin: 1.5cm;
    }
    :global([data-ui="Bullet"] .views),
:global([data-ui="Bullet"] .catalogue),
:global([data-ui="Bullet"] .foot) {
      display: none !important;
    }
    :global([data-ui="Bullet"] .head) {
      padding-bottom: 0.5rem;
    }
    :global([data-ui="Bullet"] h1) {
      font-size: 1.4rem;
    }
    /* `!important` because the notice wears Tailwind utilities for its box on screen, and those
       sit in a later cascade layer than this one: without it the print rules lose to `p-4`. */
    :global([data-ui="Bullet"] .sample-note) {
      margin: 0.5rem 0 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: none !important;
      font-size: 0.72rem !important;
      font-style: italic;
      color: var(--ink-2) !important;
    }
    /* As large as it was on screen, and no wider than the sheet: a drawing too wide for its panel
       is scrolled sideways in the browser, and on paper the same drawing would simply have its tip
       cut off. The ruler under it measures the rendered SVG at `beforeprint`, so whichever of the
       two the drawing ends up at, the sheet states the scale it is at. */
    :global([data-ui="Bullet"] .drawing) {
      margin: 0.75rem 0 1rem;
      padding: 0;
      border: 0;
      background: none;
      overflow: visible;
      break-inside: avoid;
    }
    :global([data-ui="Bullet"] .plate-live) {
      max-width: 100%;
      height: auto !important;
    }
    :global([data-ui="Bullet"] .plate-live svg) {
      width: 100%;
      height: auto;
    }
    /* Two columns on paper as on a wide screen: the measurements are a narrow table and the
       construction line beside them is shorter still, and stacked they leave half the sheet white. */
    :global([data-ui="Bullet"] .sheet) {
      grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
      gap: 1.5rem;
    }
    :global([data-ui="Bullet"] .side) {
      break-inside: avoid;
    }
    :global([data-ui="Bullet"] h2) {
      font-size: 0.8rem;
      padding-bottom: 0.2rem;
      margin-bottom: 0.5rem;
      break-after: avoid;
    }
    :global([data-ui="Bullet"] table),
:global([data-ui="Bullet"] .plain) {
      font-size: 0.7rem;
    }
    :global([data-ui="Bullet"] td) {
      padding: 0.15rem 0.4rem 0.15rem 0;
    }
    :global([data-ui="Bullet"] .prov),
:global([data-ui="Bullet"] .note) {
      font-size: 0.65rem;
    }
    /* The scroll region is a screen affordance; on paper it is a box that can only clip. */
    :global([data-ui="Bullet"] .scroll-x) {
      overflow: visible !important;
    }
  }
  }
</style>
