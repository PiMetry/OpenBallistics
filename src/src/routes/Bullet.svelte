<script lang="ts">
  import { bulletByKey, bulletDrawingUrl, cartridgesFor, loadBullet, type BulletRecord } from '../lib/bullets';
  import { entries } from '../lib/data';
  import { face, rememberStyle, storedStyle, styleLabel, styleNote, STYLES } from '../lib/drawings';
  import { t, type Key } from '../lib/i18n.svelte';
  import { href } from '../lib/router';
  import { PX_PER_MM } from '../lib/scale';
  import { isDark } from '../lib/theme.svelte';
  import { familyLabel, type DrawingStyle } from '../lib/types';

  interface Props {
    key: string;
  }
  let { key }: Props = $props();

  const entry = $derived(bulletByKey(key));
  const record = $derived(loadBullet(key));

  /** The same picks as a cartridge page, sharing the stored style; the dimensions default on. */
  let style = $state<DrawingStyle>(storedStyle());
  let dimensions = $state(true);

  /**
   * How large the drawing is shown. A bullet is thirty millimetres long, and at life size the
   * dimension symbols are a millimetre high; so it is enlarged up to four times -- the scale the
   * file was drawn at, where the symbols read -- and less only where the panel is narrower.
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

{#await record}
  <p class="status">{t('record.loading', { name: entry?.name ?? key })}</p>
{:then data}
  {@const fits = entry ? cartridgesFor(entry, entries) : []}
  <header class="head">
    <div>
      <p class="eyebrow">{data.manufacturer}{#if data.line} · {data.line}{/if}</p>
      <h1>{data.name}</h1>
      <p class="alt">{t('bullets.partNumber')} <span class="num">{data.model}</span> · {data.calibre} · {grains(data.mass)} gr · {data.mass} g</p>
    </div>
    <dl class="meta">
      {#if data.ballistics.g1}<dt>G1</dt><dd class="num">{data.ballistics.g1}</dd>{/if}
      {#if data.ballistics.g7}<dt>G7</dt><dd class="num">{data.ballistics.g7}</dd>{/if}
      <dt>SD</dt><dd class="num">{data.derived.sectionalDensity}</dd>
      {#if data.recommended_twist}<dt>{t('bullets.twist')}</dt><dd class="num">{data.recommended_twist}</dd>{/if}
    </dl>
  </header>

  {#if entry?.svg && entry.tight}
    {@const size = dimensions ? entry.svg : entry.tight}
    {@const k = zoom(size)}
    <div class="views">
      <div class="view">
        <div class="options" role="group" aria-label={t('draw.style')}>
          {#each STYLES as option (option)}
            <button type="button" class="option" class:on={option === style} aria-pressed={option === style}
              title={styleNote(option)} onclick={() => setStyle(option)}>
              <span class="option-name">{styleLabel(option)}</span>
            </button>
          {/each}
        </div>
        <div class="options" role="group" aria-label={t('draw.dimensions')}>
          <button type="button" class="option" class:on={dimensions} aria-pressed={dimensions}
            onclick={() => (dimensions = !dimensions)}>
            <span class="option-name">{t('draw.dimensions')}</span>
          </button>
        </div>
      </div>
    </div>
    <!--
      Life size, lying down, in a box that pans if a window is narrower than the drawing. A bullet
      is thirty millimetres long; there is nothing to fit.
    -->
    <figure class="drawing" bind:clientWidth={panelWidth}>
      <img
        class="plate"
        class:technical={style === 'technical'}
        src={bulletDrawingUrl(key, face(style, dimensions, isDark()))}
        alt={`${data.manufacturer} ${data.name}, drawn to scale`}
        width={size[0] * PX_PER_MM * k}
        height={size[1] * PX_PER_MM * k}
      />
      <figcaption class="scale">{k.toFixed(k >= 1.05 ? 1 : 0)} : 1</figcaption>
    </figure>
  {/if}

  <div class="sheet">
    <section class="side">
      <h2>{t('bullets.measurements')}</h2>
      <table>
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
                  {#if assumed}{t('bullets.assumed')}{:else if sourced(data, row.field)}{t('bullets.sourced')}{:else}{t('bullets.derived')}{/if}
                </td>
              </tr>
            {/if}
          {/each}
          <tr>
            <td class="num symbol">R</td>
            <td>{t('bullets.ogive')} · {data.ogive.form}</td>
            <td class="num value">{data.derived.ogiveRadiusCalibres} <span class="unit">cal</span></td>
            <td class="prov">{data.derived.assumed.includes('ogive.radius_calibres') ? t('bullets.assumed') : t('bullets.sourced')}</td>
          </tr>
          {#if data.derived.boatTailAngle}
            <tr class:assumed={data.derived.assumed.includes('base.angle')}>
              <td class="num symbol">β</td>
              <td>{t('bullets.boatTailAngle')}</td>
              <td class="num value">{data.derived.boatTailAngle}°</td>
              <td class="prov">{data.derived.assumed.includes('base.angle') ? t('bullets.assumed') : t('bullets.sourced')}</td>
            </tr>
          {/if}
        </tbody>
      </table>
      <p class="note">{t('bullets.assumedNote')}</p>
      <h3>{t('bullets.construction')}</h3>
      <p class="plain">
        {data.base.type.replace('_', ' ')} · {data.tip.type.replace('_', ' ')} · {data.construction.jacket.toUpperCase()} ·
        {data.construction.jacket_material.toLowerCase().replace('_', ' ')} / {data.construction.core_material.toLowerCase()}
      </p>
      {#if data.notes}<p class="note">{data.notes}</p>{/if}
    </section>

    <section class="side">
      <h2>{t('bullets.sources')}</h2>
      <ul class="sources">
        {#each data.sources as source (source.url + source.fields.join())}
          <li>
            <a href={source.url} target="_blank" rel="noopener noreferrer">{source.publisher}</a>
            <span class="muted"> · {source.kind} · {source.retrieved}</span>
            <br /><span class="fields num">{source.fields.join(', ')}</span>
            {#if source.note}<br /><span class="muted">{source.note}</span>{/if}
          </li>
        {/each}
      </ul>

      {#if fits.length}
        <h2>{t('bullets.fits')}</h2>
        <p class="note">{t('bullets.fitsNote')}</p>
        <p class="fits">
          {#each fits as cartridge, i (cartridge.key)}
            {#if i}<span class="sep"> · </span>{/if}<a href={href.cartridge(cartridge.key)} title={familyLabel(cartridge.family)}>{cartridge.name}</a>
          {/each}
        </p>
      {/if}
    </section>
  </div>

  <p class="foot"><a href={href.bullets()}>{t('bullets.back')}</a></p>
{:catch error}
  <p class="status error">{error.message} <a href={href.bullets()}>{t('bullets.back')}</a></p>
{/await}

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 1rem 2rem;
    align-items: start;
  }
  h1 {
    font-size: var(--step-4);
    letter-spacing: -0.01em;
  }
  .alt {
    margin: 0.25rem 0 0;
    color: var(--ink-2);
    font-size: var(--step-0);
  }
  .meta {
    display: grid;
    grid-template-columns: auto auto;
    gap: 0.1rem 0.9rem;
    margin: 0;
    font-size: var(--step-0);
  }
  .meta dt {
    color: var(--ink-3);
  }
  .meta dd {
    margin: 0;
    text-align: right;
  }
  .views {
    margin: 1.5rem 0 0;
  }
  .view {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.6rem;
  }
  .options {
    display: flex;
    gap: 0.3rem;
  }
  .option {
    padding: 0.2rem 0.55rem;
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink-2);
    line-height: 1.2;
    font-size: var(--step-0);
  }
  .option.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  .drawing {
    margin: 0.75rem 0 1.5rem;
    padding: 1.25rem;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    overflow-x: auto;
  }
  .plate {
    display: block;
    max-width: none;
    margin: 0 auto;
  }
  .plate.technical {
    filter: var(--line-art);
  }
  .sheet {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2rem;
  }
  @media (min-width: 58rem) {
    .sheet {
      grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
      gap: 2.5rem;
    }
  }
  h2 {
    font-size: var(--step-1);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid var(--rule-strong);
    margin-bottom: 1rem;
  }
  h3 {
    font-size: var(--step-0);
    margin: 1.25rem 0 0.3rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--step-0);
  }
  td {
    padding: 0.3rem 0.6rem 0.3rem 0;
    border-bottom: 1px solid var(--rule);
    vertical-align: baseline;
  }
  .symbol {
    color: var(--ink-2);
    width: 3rem;
  }
  td.value {
    text-align: right;
    font-weight: 500;
    white-space: nowrap;
  }
  .unit {
    font-size: 0.78em;
    color: var(--ink-3);
    font-weight: 400;
  }
  .prov {
    color: var(--ink-3);
    font-size: 0.78rem;
    text-align: right;
  }
  tr.assumed td {
    color: var(--ink-3);
  }
  tr.assumed td.value {
    font-weight: 400;
  }
  .note {
    margin: 0.6rem 0 0;
    font-size: 0.78rem;
    color: var(--ink-2);
    max-width: 62ch;
  }
  .plain {
    margin: 0;
    font-size: var(--step-0);
    color: var(--ink-2);
  }
  .sources {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--step-0);
  }
  .sources li {
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--rule);
  }
  .fits {
    margin: 0;
    font-size: var(--step-0);
    line-height: 1.8;
  }
  .sep {
    color: var(--ink-3);
  }
  .scale {
    margin-top: 0.5rem;
    font-size: 0.72rem;
    color: var(--ink-3);
  }
  .fields {
    font-size: 0.75rem;
    color: var(--ink-3);
  }
  .muted {
    color: var(--ink-3);
    font-size: 0.85em;
  }
  .status {
    color: var(--ink-2);
  }
  .foot {
    margin-top: 2.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--rule);
    color: var(--ink-2);
    font-size: var(--step-0);
  }
</style>
