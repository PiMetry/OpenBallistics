<script lang="ts">
  import { bulletDrawingUrl, bullets } from '../lib/bullets';
  import { face } from '../lib/drawings';
  import { t } from '../lib/i18n.svelte';
  import { href } from '../lib/router';
  import { PX_PER_MM } from '../lib/scale';

  /**
   * The catalogue, as a table. A table rather than the cartridges' grid because the interesting
   * thing about six 168-grain .30 calibre match bullets is the tenth of a millimetre between them,
   * and columns line those up where cards would not. Each row carries the drawing at life size,
   * the rendered face without its dimensions -- a bullet is small enough that this costs nothing.
   */
  let query = $state('');
  let calibre = $state('');

  const calibres = $derived([...new Set(bullets.map((bullet) => bullet.calibre))].sort());
  const shown = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    return bullets.filter(
      (bullet) =>
        (!calibre || bullet.calibre === calibre) &&
        (!needle ||
          `${bullet.manufacturer} ${bullet.line ?? ''} ${bullet.name} ${bullet.model}`
            .toLowerCase()
            .includes(needle))
    );
  });
  const grains = (mass: number) => (mass / 0.06479891).toFixed(0);
</script>

<h1>{t('bullets.title')}</h1>
<p class="lede">{t('bullets.lede')}</p>

<div class="controls">
  <label>
    <span class="eyebrow">{t('list.search')}</span>
    <input type="search" bind:value={query} placeholder="Berger, Scenar, 30501…" />
  </label>
  <label>
    <span class="eyebrow">{t('bullets.calibre')}</span>
    <select bind:value={calibre}>
      <option value="">{t('list.all')}</option>
      {#each calibres as option (option)}
        <option value={option}>{option}</option>
      {/each}
    </select>
  </label>
</div>

{#if shown.length === 0}
  <p class="empty">{t('list.emptyLead')}</p>
{:else}
  <div class="scroll-x">
    <table>
      <thead>
        <tr>
          <th></th>
          <th>{t('bullets.maker')}</th>
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
          <tr>
            <td class="picture">
              {#if bullet.tight}
                <a href={href.bullet(bullet.key)}>
                  <img
                    src={bulletDrawingUrl(bullet.key, face('visual', false))}
                    alt={`${bullet.manufacturer} ${bullet.name}, drawn to scale`}
                    width={bullet.tight[0] * PX_PER_MM}
                    height={bullet.tight[1] * PX_PER_MM}
                    loading="lazy"
                  />
                </a>
              {/if}
            </td>
            <td>{bullet.manufacturer}{#if bullet.line}<span class="muted"> · {bullet.line}</span>{/if}</td>
            <td><a href={href.bullet(bullet.key)}>{bullet.name}</a> <span class="muted num">{bullet.model}</span></td>
            <td class="num">{bullet.diameter}</td>
            <td class="num">{grains(bullet.mass)}</td>
            <td class="num">{bullet.length ?? '-'}</td>
            <td class="num">{bullet.g1 ?? '-'}</td>
            <td class="num">{bullet.g7 ?? '-'}</td>
            <td class="muted">{bullet.assumed ? t('bullets.assumedCount', { count: bullet.assumed }) : t('bullets.allSourced')}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  h1 {
    font-size: var(--step-3);
  }
  .lede {
    max-width: 70ch;
    color: var(--ink-2);
    margin: 0.4rem 0 1.25rem;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem 1.5rem;
    margin-bottom: 1.25rem;
  }
  .controls label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .controls input {
    min-width: 16rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    font-size: var(--step-0);
  }
  th,
  td {
    text-align: left;
    padding: 0.55rem 0.7rem;
    border-bottom: 1px solid var(--rule);
    vertical-align: middle;
  }
  th {
    color: var(--ink-2);
    font-weight: 500;
    border-bottom: 2px solid var(--rule-strong);
  }
  th.num,
  td.num {
    text-align: right;
  }
  .unit {
    font-size: 0.78em;
    color: var(--ink-3);
  }
  .picture img {
    display: block;
    max-width: none;
  }
  .muted {
    color: var(--ink-3);
  }
  .empty {
    color: var(--ink-2);
  }
</style>
