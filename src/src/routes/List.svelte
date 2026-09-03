<script lang="ts">
  import Card from '../components/Card.svelte';
  import { addCartridgeUrl } from '../lib/issue';
  import { countries, entries, families, search } from '../lib/data';
  import { href } from '../lib/router';
  import { CONFIDENCE_LABELS, FAMILY_LABELS } from '../lib/types';

  let query = $state('');
  let family = $state('');
  let country = $state('');
  let cartridgeVerification = $state<'' | 'verified' | 'unverified' | 'implausible'>('');
  let bulletVerification = $state<'' | 'verified' | 'unverified'>('');
  let sort = $state<'name' | 'family' | 'L3' | 'L6' | 'G1'>('name');

  /**
   * Two ways of looking at the same 532 records, because they answer different questions.
   *
   * The **grid** is for looking, and it is the default: each cartridge drawn from its own published
   * dimensions, every card at the same scale, so the shape of a family and the size of one
   * cartridge against another are visible without opening anything. That is the thing this site can
   * do that a shelf of PDFs cannot, so it is what a visitor should meet first. The **list** is for
   * finding one known thing quickly: dense rows, nothing but names, sortable.
   *
   * The choice is remembered, because it is a preference about how somebody reads rather than about
   * what they are reading. Wrapped, because a browser set to block site data throws on the first
   * access rather than returning nothing.
   */
  let view = $state<'grid' | 'list'>(restoreView());

  function restoreView(): 'grid' | 'list' {
    try {
      return localStorage.getItem('cip.view') === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  }
  $effect(() => {
    try {
      localStorage.setItem('cip.view', view);
    } catch {
      // A private window or blocked site data; the view still works, it just is not remembered.
    }
  });

  const shown = $derived.by(() => {
    let list = entries;
    if (family) list = list.filter((entry) => entry.family === family);
    if (country) list = list.filter((entry) => entry.country === country);
    if (cartridgeVerification) {
      list = list.filter((entry) =>
        cartridgeVerification === 'implausible'
          ? entry.checks > 0
          : entry.checks === 0 && entry.confidence === cartridgeVerification
      );
    }
    if (bulletVerification) {
      list = list.filter((entry) =>
        entry.svg && (bulletVerification === 'verified' ? entry.bulletVerified : !entry.bulletVerified)
      );
    }
    list = search(query, list);

    const sorted = [...list];
    if (sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    } else if (sort === 'family') {
      sorted.sort((a, b) =>
        (FAMILY_LABELS[a.family] ?? a.family).localeCompare(FAMILY_LABELS[b.family] ?? b.family, 'en') ||
        a.name.localeCompare(b.name, 'en')
      );
    } else {
      // A record with no published value for the sort column goes last rather than reading as
      // zero: the sheet being silent is not the same as the dimension measuring nothing.
      const column = sort;
      sorted.sort((a, b) => {
        const x: number | null = a[column];
        const y: number | null = b[column];
        if (x === null && y === null) return a.name.localeCompare(b.name, 'en');
        if (x === null) return 1;
        if (y === null) return -1;
        return x - y;
      });
    }
    return sorted;
  });

  /**
   * Millimetres per pixel for the grid, from the longest cartridge currently shown.
   *
   * One scale for every card is the whole point of the grid: it is what makes a .22 Long Rifle
   * beside a .378 Weatherby read as the size difference it is. Deriving it from the *filtered* set
   * rather than from all 532 means filtering to pistol cartridges fills the cards instead of
   * leaving them nearly empty.
   *
   * `DRAWING_WIDTH_PX` is the drawing room inside the narrowest card the grid will lay out -- a
   * 21rem column less its padding -- so the longest cartridge on screen just fits and nothing is
   * clipped. The cap stops a grid of small pistol cases from being drawn at a scale where the
   * outline's own stroke is a visible fraction of the case.
   */
  const DRAWING_WIDTH_PX = 300;
  const MAX_SCALE_PX_PER_MM = 5.2;

  const fitted = $derived.by(() => {
    // The drawing's own extent where there is one: it carries the projectile to L6, which the
    // four-point skeleton does not. Sizing from L3 alone clipped every loaded drawing at the
    // mouth.
    const longest = Math.max(
      ...shown.map((entry) =>
        entry.svg ? entry.svg[0] : entry.shape ? Math.max(...entry.shape.map(([, z]) => z)) : 0
      ),
      1
    );
    return Math.min(MAX_SCALE_PX_PER_MM, DRAWING_WIDTH_PX / longest);
  });

  /**
   * A zoom on top of the fitted scale, chosen from the Size dropdown. Every card still shares
   * one scale -- the zoom multiplies all of them -- so the comparison between cards holds at any
   * size; a drawing larger than its card clips rather than shrinks. Kept per browser.
   */
  const ZOOMS = [50, 75, 100, 125, 150, 200];
  const ZOOM_KEY = 'grid-zoom';
  function storedZoom(): number {
    try {
      const value = Number(localStorage.getItem(ZOOM_KEY) ?? 100);
      return ZOOMS.includes(value) ? value : 100;
    } catch {
      return 100;
    }
  }
  let zoomPercent = $state(storedZoom());
  $effect(() => {
    try {
      localStorage.setItem(ZOOM_KEY, String(zoomPercent));
    } catch {
      // Storage may be unavailable; the choice still applies for this visit.
    }
  });
  const scale = $derived((fitted * zoomPercent) / 100);
  const cardHeight = $derived(Math.round((78 * zoomPercent) / 100));

  function reset() {
    query = '';
    family = '';
    country = '';
    cartridgeVerification = '';
    bulletVerification = '';
  }
</script>

<div class="controls">
  <label class="search">
    <span class="eyebrow">Search</span>
    <input
      type="search"
      bind:value={query}
      placeholder="308, 7.62 x 51, 9 mm Luger…"
      autocomplete="off"
    />
  </label>

  <label>
    <span class="eyebrow">Family</span>
    <select bind:value={family}>
      <option value="">All families</option>
      {#each families as name (name)}
        <option value={name}>{FAMILY_LABELS[name] ?? name}</option>
      {/each}
    </select>
  </label>

  <label>
    <span class="eyebrow">Country</span>
    <select bind:value={country}>
      <option value="">All countries</option>
      {#each countries as code (code)}
        <option value={code}>{code}</option>
      {/each}
    </select>
  </label>

  <label>
    <span class="eyebrow">Cartridge</span>
    <select bind:value={cartridgeVerification}>
      <option value="">Any verification</option>
      <option value="verified">Verified</option>
      <option value="unverified">Unverified</option>
      <option value="implausible">Check</option>
    </select>
  </label>

  <label>
    <span class="eyebrow">Bullet</span>
    <select bind:value={bulletVerification}>
      <option value="">Any verification</option>
      <option value="verified">Verified</option>
      <option value="unverified">Unverified</option>
    </select>
  </label>

  <label>
    <span class="eyebrow">Sort</span>
    <select bind:value={sort}>
      <option value="name">Name</option>
      <option value="family">Family</option>
      <option value="L3">Case length</option>
      <option value="L6">Overall length</option>
      <option value="G1">Bullet diameter</option>
    </select>
  </label>

  <label>
    <span class="eyebrow">Size</span>
    <select bind:value={zoomPercent}>
      {#each ZOOMS as percent (percent)}
        <option value={percent}>{percent}%</option>
      {/each}
    </select>
  </label>

</div>

<div class="summary">
  <div>
    <p class="count">
      <strong class="num">{shown.length}</strong> of {entries.length} cartridges
      {#if shown.length !== entries.length}
        <button class="link" onclick={reset}>clear filters</button>
      {/if}
    </p>
    <p class="actions">
      <a href={addCartridgeUrl()} target="_blank" rel="noopener noreferrer">Add a cartridge</a>
    </p>
  </div>
  <div class="views" role="group" aria-label="View">
    <div class="segmented">
      <button
        type="button"
        class:on={view === 'grid'}
        aria-pressed={view === 'grid'}
        aria-label="Grid view"
        title="Grid view"
        onclick={() => (view = 'grid')}><span aria-hidden="true">▦</span></button
      >
      <button
        type="button"
        class:on={view === 'list'}
        aria-pressed={view === 'list'}
        aria-label="List view"
        title="List view"
        onclick={() => (view = 'list')}><span aria-hidden="true">☷</span></button
      >
    </div>
  </div>
</div>

{#if shown.length === 0}
  <p class="empty">
    Nothing matches. The tables use C.I.P.'s own spelling, <code>308 Win.</code>,
    <code>9 mm Luger</code>, <code>7,62 x 39</code>, and the search also reads the alternative
    names each sheet lists.
  </p>
{:else if view === 'grid'}
  <div class="grid">
    {#each shown as entry (entry.key)}
      <Card {entry} {scale} height={cardHeight} />
    {/each}
  </div>
{:else}
  <div class="scroll-x">
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Family</th>
          <th>Origin</th>
          <th>Verification</th>
        </tr>
      </thead>
      <tbody>
        {#each shown as entry (entry.key)}
          <!--
            The whole row is the link, like the whole card is. Only the first cell can hold the
            anchor -- a row is not allowed to contain one -- so the other cells carry a click that
            follows it. The anchor is what makes the row keyboard-reachable and what a screen reader
            announces; the click handler is a convenience on top of it, which is why the cells are
            not given roles or tab stops of their own and would duplicate it if they were.
          -->
          <tr onclick={() => (location.hash = href.cartridge(entry.key).slice(1))}>
            <td>
              <a href={href.cartridge(entry.key)}>{entry.name}</a>
              {#if entry.alt.length}
                <span class="alt">{entry.alt.join(' · ')}</span>
              {/if}
            </td>
            <td class="muted">{FAMILY_LABELS[entry.family] ?? entry.family}</td>
            <td class="num muted">{entry.country ?? '-'}</td>
            <td>
              <span class="verifications">
                <span
                  class="verification {entry.checks ? 'implausible' : entry.confidence}"
                  title={entry.checks
                    ? `${entry.checks} check${entry.checks === 1 ? '' : 's'} found; see the cartridge page`
                    : entry.confidence === 'verified'
                      ? 'Confirmed by a person'
                      : 'Not yet confirmed by a person'}
                >
                  {#if entry.checks}Cartridge {CONFIDENCE_LABELS.implausible} ({entry.checks})
                  {:else}Cartridge {CONFIDENCE_LABELS[entry.confidence]}{/if}
                </span>
                {#if entry.svg}
                  <span
                    class="verification {entry.bulletVerified ? 'verified' : 'unverified'}"
                    title={entry.bulletVerified
                      ? 'The bullet type has been confirmed against the drawing by a person'
                      : 'The bullet type is a default, not yet confirmed by a person'}
                  >
                    Bullet {entry.bulletVerified ? 'verified' : 'unverified'}
                  </span>
                {/if}
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .controls {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 0.75rem;
    align-items: end;
    margin-bottom: 1.1rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .search {
    grid-column: 1 / -1;
    justify-self: stretch;
  }
  .search input {
    width: 100%;
  }
  .controls > label:not(.search) select {
    width: 100%;
  }
  .views {
    display: flex;
    justify-content: flex-end;
  }
  .segmented {
    display: inline-flex;
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .segmented button {
    flex: 1;
    background: var(--surface);
    border: 0;
    padding: 0.4rem 0.8rem;
    font-size: var(--step-0);
    color: var(--ink-2);
    line-height: 1;
  }
  .segmented button + button {
    border-left: 1px solid var(--rule-strong);
  }
  .segmented button.on {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .count {
    color: var(--ink-2);
    font-size: var(--step-0);
    margin: 0 0 0.25rem;
  }
  .actions {
    margin: 0 0 1rem;
    font-size: var(--step-0);
  }
  .summary {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.25rem;
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    margin-left: 0.5rem;
    color: var(--accent);
    text-decoration: underline;
  }
  .empty {
    color: var(--ink-2);
    max-width: 46ch;
  }
  code {
    font-family: var(--mono);
    font-size: 0.85em;
    background: var(--surface-2);
    padding: 0.05rem 0.25rem;
    border-radius: 3px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(21rem, 1fr));
    gap: 1rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    font-size: var(--step-0);
  }
  th {
    text-align: left;
    font-size: 0.7rem;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--ink-3);
    font-weight: 600;
    padding: 0.5rem 0.7rem;
    border-bottom: 2px solid var(--rule-strong);
    position: sticky;
    top: 0;
    background: var(--surface);
  }
  tbody tr {
    cursor: pointer;
  }
  tbody tr:hover {
    background: var(--accent-soft);
  }
  td {
    padding: 0.5rem 0.7rem;
    border-bottom: 1px solid var(--rule);
    vertical-align: baseline;
  }
  .muted {
    color: var(--ink-2);
  }
  .verifications {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .verification {
    display: inline-block;
    padding: 0.1rem 0.45rem;
    border: 1px solid var(--rule);
    border-radius: 999px;
    font-size: 0.68rem;
    line-height: 1.35;
    white-space: nowrap;
  }
  .verification.verified {
    color: var(--ok);
    border-color: currentColor;
    background: var(--ok-soft);
  }
  .verification.unverified {
    color: var(--ink-3);
    background: var(--surface-2);
  }
  .verification.implausible {
    color: var(--warn);
    background: var(--warn-soft);
    border-color: currentColor;
  }
  .alt {
    display: block;
    font-size: 0.75rem;
    color: var(--ink-3);
  }
</style>
