<script module lang="ts">
  // Keep the current search while a detail page is open, for this visit only.
  let previous = { query: '', calibre: '' };
</script>

<script lang="ts">
  import { Badge } from '$lib/components/ui/badge/index.js';
  import ScaleRuler from '../components/ScaleRuler.svelte';
  import { Label } from '$lib/components/ui/label/index.js';
  import { NativeSelect } from '$lib/components/ui/native-select/index.js';
  import { Button as ShadcnButton } from '$lib/components/ui/button/index.js';

  import SearchPanel from '../components/SearchPanel.svelte';
  import ResultsSummary from '../components/ResultsSummary.svelte';
  import AddAction from '../components/AddAction.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { onDestroy } from 'svelte';
  import { bullets, loadBullet, type BulletRecord } from '../lib/bullets';
  import { bulletFromRecord, liveBulletDrawing } from '@lib/render2d';
  import { t } from '../lib/i18n.svelte';
  import { href } from '../lib/router';
  import { PX_PER_MM } from '@lib/core';

  // Sample records share a table so dimensions stay easy to compare.
  let query = $state(previous.query);
  let calibre = $state(previous.calibre);

  const calibres = $derived([...new Set(bullets.map((bullet) => bullet.calibre))].sort());
  const shown = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    return bullets.filter(
      (bullet) =>
        (!calibre || bullet.calibre === calibre) &&
        (!needle ||
          `${bullet.calibre} ${bullet.manufacturer} ${bullet.line ?? ''} ${bullet.name} ${bullet.model}`
            .toLowerCase()
            .includes(needle))
    );
  });
  const filtering = $derived(query.trim() !== '' || calibre !== '');
  function reset() { query = ''; calibre = ''; }
  const grains = (mass: number) => (mass / 0.06479891).toFixed(0);

  /** The bullet's picture, made here from its record: the catalogue drawing's coloured face. */
  function picture(record: BulletRecord) {
    try {
      const { bullet } = bulletFromRecord(record);
      return liveBulletDrawing(record, bullet, { style: 'visual', dimensions: false, pixelsPerMm: PX_PER_MM, className: 'plate' });
    } catch {
      return null;
    }
  }
  onDestroy(() => { previous = { query, calibre }; });
</script>
<div data-ui="Bullets" class="contents">

<PageHeader title={t('bullets.title')} description={t('bullets.lede')}>
  {#snippet actions()}<AddAction label={t('actions.addBullet')} href={href.designer()} />{/snippet}
</PageHeader>

<SearchPanel bind:query placeholder={t('bullets.searchHint')}>
  {#snippet filters()}
  <Label>
    <span class="eyebrow">{t('bullets.calibre')}</span>
    <NativeSelect class={[(calibre !== '') ? "on" : '']} bind:value={calibre} >
      <option value="">{t('list.all')}</option>
      {#each calibres as option (option)}
        <option value={option}>{option}</option>
      {/each}
    </NativeSelect>
  </Label>
  {/snippet}
</SearchPanel>

<ResultsSummary count={t('bullets.count', { shown: shown.length, total: bullets.length })} {filtering} onclear={reset} />

{#if shown.length === 0}
  <div class="ui-empty"><p>{t('list.emptyLead')}</p><div class="ui-actions"><ShadcnButton variant="outline" type="button" onclick={reset}>{t('list.clear')}</ShadcnButton></div></div>
{:else}
  <div class="scroll-x" role="region" aria-label={t('bullets.title')}>
    <table>
      <caption class="sr-only">{t('bullets.title')}</caption>
      <thead>
        <tr>
          <th></th>
          <th>{t('bullets.calibre')}</th>
          <th>{t('bullets.bullet')}</th>
          <th class="num">D <span class="unit">mm</span></th>
          <th class="num">{t('bullets.weight')} <span class="unit">gr</span></th>
          <th class="num">L <span class="unit">mm</span></th>
          <th class="num">G1</th>
          <th class="num">G7</th>
          <th>{t('bullets.assumedHead')}</th>
        </tr>
      </thead>
      <tbody>
        {#each shown as bullet (bullet.key)}
          <!--
            The whole row is the link, as in the cartridge table: only a cell may hold the anchor,
            so the other cells carry a click that follows it. The anchor is what the keyboard
            reaches and a screen reader announces; the click is a convenience on top.
          -->
          <tr onclick={(event) => {
            if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || (event.target as Element).closest('a')) return;
            location.hash = href.bullet(bullet.key).slice(1);
          }}>
            <td class="picture">
              {#if bullet.tight}
                <a href={href.bullet(bullet.key)} class="plate-live" aria-label={t('list.preview', { name: `${bullet.manufacturer} ${bullet.name}` })}
                  style={`width:${(bullet.tight[0] * PX_PER_MM).toFixed(1)}px;height:${(bullet.tight[1] * PX_PER_MM).toFixed(1)}px`}>
                  {#await loadBullet(bullet.key) then record}
                    {@const made = picture(record)}
                    {#if made}{@html made.markup}{/if}
                  {:catch}
                    <span class="muted">{t('draw.unavailable')}</span>
                  {/await}
                </a>
                <ScaleRuler widthMm={bullet.tight[0]} />
              {/if}
            </td>
            <td>{bullet.calibre}</td>
            <td><a href={href.bullet(bullet.key)}>{bullet.name}</a> <span class="muted num">{bullet.model}</span></td>
            <td class="num">{bullet.diameter}</td>
            <td class="num">{grains(bullet.mass)}</td>
            <td class="num">{bullet.length ?? '-'}</td>
            <td class="num">{bullet.g1 ?? '-'}</td>
            <td class="num">{bullet.g7 ?? '-'}</td>
            <td><Badge variant="secondary">{bullet.sample ? t('bullets.sample') : t('bullets.assumedCount', { count: bullet.assumed })}</Badge></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

</div>
<style>
  @layer legacy {
  :global([data-ui="Bullets"] .scroll-x) { border: 1px solid var(--rule); border-radius: var(--panel-radius); background: var(--surface); }
  :global([data-ui="Bullets"] tbody tr:focus-within) {
    background: var(--accent-soft);
  }
  :global([data-ui="Bullets"] table) {
    min-width: 54rem;
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    font-size: var(--step-0);
  }
  :global([data-ui="Bullets"] tbody tr) {
    cursor: pointer;
  }
  :global([data-ui="Bullets"] tbody tr:hover) {
    background: var(--surface-2);
  }
  :global([data-ui="Bullets"] th),
:global([data-ui="Bullets"] td) {
    text-align: left;
    padding: 0.55rem 0.7rem;
    border-bottom: 1px solid var(--rule);
    vertical-align: middle;
  }
  :global([data-ui="Bullets"] th) {
    color: var(--ink-2);
    font-weight: 500;
    border-bottom: 2px solid var(--rule-strong);
  }
  :global([data-ui="Bullets"] th.num),
:global([data-ui="Bullets"] td.num) {
    text-align: right;
  }
  :global([data-ui="Bullets"] .unit) {
    font-size: 0.78em;
    color: var(--ink-3);
  }
  :global([data-ui="Bullets"] .plate-live) {
    display: block;
  }
  :global([data-ui="Bullets"] .plate-live svg) {
    display: block;
  }
  :global([data-ui="Bullets"] .muted) {
    color: var(--ink-3);
  }

  }
</style>
