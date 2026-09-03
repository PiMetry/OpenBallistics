<script lang="ts">
  import Card from '../components/Card.svelte';
  import { countries, entries, families, search } from '../lib/data';
  import { href } from '../lib/router';
  import { FAMILY_LABELS } from '../lib/types';

  let query = $state('');
  let family = $state('');
  let country = $state('');
  let sort = $state<'name' | 'L3' | 'G1'>('name');

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
    list = search(query, list);

    const sorted = [...list];
    if (sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'en'));
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

  const scale = $derived.by(() => {
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

  function reset() {
    query = '';
    family = '';
    country = '';
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
    <span class="eyebrow">Sort</span>
    <select bind:value={sort}>
      <option value="name">Name</option>
      <option value="L3">Case length</option>
      <option value="G1">Bullet diameter</option>
    </select>
  </label>

  <div class="views" role="group" aria-label="View">
    <span class="eyebrow">View</span>
    <div class="segmented">
      <button
        type="button"
        class:on={view === 'grid'}
        aria-pressed={view === 'grid'}
        onclick={() => (view = 'grid')}>Grid</button
      >
      <button
        type="button"
        class:on={view === 'list'}
        aria-pressed={view === 'list'}
        onclick={() => (view = 'list')}>List</button
      >
    </div>
  </div>
</div>

<p class="count">
  <strong class="num">{shown.length}</strong> of {entries.length} cartridges
  {#if shown.length !== entries.length}
    <button class="link" onclick={reset}>clear filters</button>
  {/if}
</p>

{#if shown.length === 0}
  <p class="empty">
    Nothing matches. The tables use C.I.P.'s own spelling, <code>308 Win.</code>,
    <code>9 mm Luger</code>, <code>7,62 x 39</code>, and the search also reads the alternative
    names each sheet lists.
  </p>
{:else if view === 'grid'}
  <div class="grid">
    {#each shown as entry (entry.key)}
      <Card {entry} {scale} />
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
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
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
    flex: 1 1 18rem;
  }
  .search input {
    width: 100%;
  }
  .views {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .segmented {
    display: inline-flex;
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .segmented button {
    background: var(--surface);
    border: 0;
    padding: 0.4rem 0.8rem;
    font-size: var(--step-0);
    color: var(--ink-2);
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
    margin: 0 0 1rem;
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
  .alt {
    display: block;
    font-size: 0.75rem;
    color: var(--ink-3);
  }
</style>
