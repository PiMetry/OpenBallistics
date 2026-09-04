<script lang="ts">
  import Card from '../components/Card.svelte';
  import Flag from '../components/Flag.svelte';
  import { countries, entries, families, search } from '../lib/data';
  import { rememberStyle, storedStyle, STYLE_LABELS, STYLE_NOTES, STYLES } from '../lib/drawings';
  import { href } from '../lib/router';
  import { PX_PER_MM } from '../lib/scale';
  import {
    COUNTRY_NAMES,
    FACETS,
    FACET_LABELS,
    FAMILY_LABELS,
    tally,
    verificationScore,
    verificationState,
    verificationSummary,
    VERIFICATION_LABELS,
    type DrawingStyle,
    type Entry,
    type Facet
  } from '../lib/types';

  let query = $state('');
  let family = $state('');
  let country = $state('');
  /**
   * One filter for how far a record has been checked, where there used to be two.
   *
   * There were two selects, Cartridge and Bullet, one per verification. Five verifications would
   * have made five selects and thirty-odd combinations to hold in your head, most of them empty --
   * and the question a reader actually has is not "which facets" but "how far along is this",
   * which is one question with three answers. So the combinations are named instead of enumerated:
   * everything confirmed, some of it, none of it.
   *
   * Under those sit the two questions that are about a single facet and are worth asking on their
   * own -- one per facet, "this one confirmed" and "this one not" -- and, separately, the
   * plausibility checks, which are not a verification at all: a check is the site doubting a
   * figure, not a person having failed to read it yet. A record can be fully verified and still
   * carry an explained one.
   */
  type Verification =
    | ''
    | 'full'
    | 'partial'
    | 'none'
    | 'checks'
    | 'clean'
    | `is:${Facet}`
    | `not:${Facet}`;
  let verification = $state<Verification>('');

  type Sort = 'name' | 'family' | 'verification' | 'L3' | 'L6' | 'G1';
  let sort = $state<Sort>('name');

  /**
   * Which way round the sort runs.
   *
   * Every sort has a direction that is obviously the useful one to open on -- names from A, and
   * verification from the best-checked record rather than the worst -- so changing the column
   * resets the direction to that column's own default instead of carrying the last one over. The
   * reader can then flip it, which is the case the button is there for: the least-verified records
   * are exactly the worklist somebody maintaining this dataset wants.
   */
  const NATURAL: Record<Sort, 'asc' | 'desc'> = {
    name: 'asc',
    family: 'asc',
    verification: 'desc',
    L3: 'asc',
    L6: 'asc',
    G1: 'asc'
  };
  let direction = $state<'asc' | 'desc'>('asc');
  function setSort(next: Sort) {
    sort = next;
    direction = NATURAL[next];
  }

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

  /** Whether the column being sorted on says nothing about this record. */
  function unpublished(entry: Entry): boolean {
    return sort === 'L3' || sort === 'L6' || sort === 'G1' ? entry[sort] === null : false;
  }

  /** Whether a record answers what the verification filter is asking. */
  function matches(entry: Entry, want: Verification): boolean {
    if (want === 'checks') return entry.warnings > 0;
    if (want === 'clean') return entry.checks === 0;
    if (want.startsWith('is:')) return entry.verified[want.slice(3) as Facet] === true;
    if (want.startsWith('not:')) return entry.verified[want.slice(4) as Facet] === false;
    return verificationState(entry.verified) === want;
  }

  const shown = $derived.by(() => {
    let list = entries;
    if (family) list = list.filter((entry) => entry.family === family);
    // A joint standard answers to either of its countries: filtering for Germany finds the 9 x 18
    // that Germany and Austria published together.
    if (country) list = list.filter((entry) => entry.countries.includes(country));
    if (verification) list = list.filter((entry) => matches(entry, verification));
    list = search(query, list);

    const sorted = [...list];
    // Reversing rather than negating the comparison, so that the tie-break stays a tie-break: two
    // records with the same case length are in name order either way round, and a record the sheet
    // is silent about stays at the bottom instead of being promoted to the top by a flip.
    const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name, 'en');
    if (sort === 'name') {
      sorted.sort(byName);
    } else if (sort === 'family') {
      sorted.sort(
        (a, b) =>
          (FAMILY_LABELS[a.family] ?? a.family).localeCompare(
            FAMILY_LABELS[b.family] ?? b.family,
            'en'
          ) || byName(a, b)
      );
    } else if (sort === 'verification') {
      sorted.sort((a, b) => verificationScore(a) - verificationScore(b) || byName(a, b));
    } else {
      // A record with no published value for the sort column goes last rather than reading as
      // zero: the sheet being silent is not the same as the dimension measuring nothing.
      const column = sort;
      sorted.sort((a, b) => {
        const x: number | null = a[column];
        const y: number | null = b[column];
        if (x === null && y === null) return byName(a, b);
        if (x === null) return 1;
        if (y === null) return -1;
        return x - y || byName(a, b);
      });
    }
    if (direction === 'desc') {
      // The silent records were put last on purpose; they stay last.
      const known = sorted.filter((entry) => !unpublished(entry));
      const silent = sorted.filter((entry) => unpublished(entry));
      return [...known.reverse(), ...silent];
    }
    return sorted;
  });

  /**
   * Pixels per millimetre for the grid: the CSS reference, so 100% is life size.
   *
   * One scale for every card is the whole point of the grid -- it is what makes a .22 Long Rifle
   * beside a .378 Weatherby read as the size difference it is -- and the strongest version of that
   * is a scale tied to nothing on the page at all. Fitting the longest cartridge currently shown
   * into the card, as this did, made the grid comparable *within* one filter and quietly re-scaled
   * the whole page the moment the filter changed. `PX_PER_MM` does not move: a case that measured
   * 30 mm across the card under Pistol still measures 30 mm under everything, and measures it
   * against a ruler.
   *
   * A drawing wider than its card is then the ordinary case rather than the exception, which is
   * what the card's drag-to-pan viewport is for.
   */

  /**
   * A zoom on top of life size, chosen from the Size dropdown. Every card still shares one scale
   * -- the zoom multiplies all of them -- so the comparison between cards holds at any size, and
   * 100% is the cartridge itself; a drawing larger than its card pans rather than shrinks. Kept
   * per browser.
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
  const scale = $derived((PX_PER_MM * zoomPercent) / 100);
  const cardHeight = $derived(Math.round((78 * zoomPercent) / 100));

  /**
   * How each cartridge is drawn: as the object, or as the dimensioned drawing.
   *
   * Both are drawn in millimetres and both are drawn at the one scale the grid shares, so the
   * comparison the grid exists for survives the switch -- a .22 Long Rifle's dimensioned drawing
   * is a smaller sheet than a .50 BMG's, in the same proportion as the rounds. What changes is
   * what the picture answers: how big is it, against where is each of C.I.P.'s symbols measured.
   *
   * The choice is kept with the cartridge page's, under one key, because it is a preference about
   * how somebody reads and not about which page they are on: a reader who sets the grid to
   * dimensioned drawings and clicks a card should land on a dimensioned drawing. See
   * `storedStyle`. Where a cartridge has not been drawn that way its card falls back to the
   * drawing it has, rather than going blank.
   */
  let style = $state<DrawingStyle>(storedStyle());
  function setStyle(next: DrawingStyle) {
    style = next;
    rememberStyle(next);
  }

  /** Whether anything is narrowing the list -- which is what `reset` clears, and nothing else. */
  const filtering = $derived(
    query.trim() !== '' || family !== '' || country !== '' || verification !== ''
  );

  function reset() {
    query = '';
    family = '';
    country = '';
    verification = '';
  }
</script>

<!--
  Two kinds of control, and the bar says which is which by where it puts them.

  On the left, what is shown: family, country, verification. On the right, how it is shown: the
  order, the size of a drawing, and -- in the row below -- grid or list. They used to sit in one
  row of five equal columns, which made Size as wide as Verification and read as though picking
  100% narrowed the results. Only the left-hand three change what comes back, and only those are
  what "clear filters" clears.

  A control holding something other than its default is marked, because with the filters spread
  across a bar the reason a list is short should never be somewhere you have to go looking.
-->
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

  <div class="cluster">
    <label class="wide">
      <span class="eyebrow">Family</span>
      <select bind:value={family} class:on={family !== ''}>
        <option value="">All families</option>
        {#each families as name (name)}
          <option value={name}>{FAMILY_LABELS[name] ?? name}</option>
        {/each}
      </select>
    </label>

    <label class="wide">
      <span class="eyebrow">Country</span>
      <select bind:value={country} class:on={country !== ''}>
        <option value="">All</option>
        {#each countries as code (code)}
          <option value={code}>{COUNTRY_NAMES[code] ?? code}</option>
        {/each}
      </select>
    </label>

    <!--
      Every option names itself in full -- "Cartridge drawing verified", not "Cartridge drawing" --
      because a closed select shows the option and not the group it came from, and "Cartridge"
      sitting under a heading that says Verification could be read as a family.
    -->
    <label class="widest">
      <span class="eyebrow">Verification</span>
      <select bind:value={verification} class:on={verification !== ''}>
        <option value="">Any</option>
        <optgroup label="How far along">
          <option value="full">{VERIFICATION_LABELS.full}</option>
          <option value="partial">{VERIFICATION_LABELS.partial}</option>
          <option value="none">{VERIFICATION_LABELS.none}</option>
        </optgroup>
        <optgroup label="Confirmed">
          {#each FACETS as facet (facet)}
            <option value={`is:${facet}`}>{FACET_LABELS[facet]} verified</option>
          {/each}
        </optgroup>
        <optgroup label="Still to confirm">
          {#each FACETS as facet (facet)}
            <option value={`not:${facet}`}>{FACET_LABELS[facet]} unverified</option>
          {/each}
        </optgroup>
        <optgroup label="Plausibility">
          <option value="checks">Has open checks</option>
          <option value="clean">No checks at all</option>
        </optgroup>
      </select>
    </label>
  </div>

  <div class="cluster presentation">
    <label class="wide">
      <span class="eyebrow">Sort</span>
      <span class="sort-row">
        <select value={sort} onchange={(event) => setSort(event.currentTarget.value as Sort)}>
          <option value="name">Name</option>
          <option value="family">Family</option>
          <option value="verification">Verification</option>
          <option value="L3">Case length</option>
          <option value="L6">Overall length</option>
          <option value="G1">Bullet diameter</option>
        </select>
        <button
          type="button"
          class="direction"
          onclick={() => (direction = direction === 'asc' ? 'desc' : 'asc')}
          aria-label={direction === 'asc' ? 'Sorted ascending' : 'Sorted descending'}
          title={direction === 'asc'
            ? 'Ascending - click for descending'
            : 'Descending - click for ascending'}
        >
          <span aria-hidden="true">{direction === 'asc' ? '↑' : '↓'}</span>
        </button>
      </span>
    </label>
  </div>
</div>

<div class="summary">
  <div>
    <p class="count">
      <strong class="num">{shown.length}</strong> of {entries.length} cartridges
      <!--
        Offered whenever a filter is set, not whenever the count has changed. A search that happens
        to match everything is still a search somebody has to clear, and it used to hide its own
        way out.
      -->
      {#if filtering}
        <button class="link" onclick={reset}>clear filters</button>
      {/if}
    </p>
  </div>
  <div class="views">
    <!--
      How big the drawings are, beside the control that decides whether there are any. It sat in
      the filter bar, where it was one of five look-alike selects and read as though it narrowed
      the results; here it is plainly part of the view, and it goes away in the list view, which
      has no drawings for it to size. No label: the percentages say what it is, and the row it is
      in is about the view already.
    -->
    {#if view === 'grid'}
      <!--
        Which drawing, beside how big. Two words rather than an icon: "visual" and "technical" are
        what the drawings are called everywhere else on the site and in the file names they are
        shipped under, and a pictogram for "dimensioned" would be a puzzle. It goes away in the
        list view along with the size, for the same reason: there are no drawings there to be of.
      -->
      <div class="segmented styles" role="group" aria-label="Drawing style">
        {#each STYLES as option (option)}
          <button
            type="button"
            class:on={style === option}
            aria-pressed={style === option}
            title={STYLE_NOTES[option]}
            onclick={() => setStyle(option)}>{STYLE_LABELS[option]}</button
          >
        {/each}
      </div>
      <select
        class="size"
        bind:value={zoomPercent}
        aria-label="Drawing size"
        title="Drawing size, where 100% is the cartridge at life size"
      >
        {#each ZOOMS as percent (percent)}
          <option value={percent}>{percent}%</option>
        {/each}
      </select>
    {/if}
    <div class="segmented" role="group" aria-label="View">
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
      <Card {entry} {scale} height={cardHeight} {style} />
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
          {@const counted = tally(entry.verified)}
          {@const level = verificationState(entry.verified)}
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
            <td class="muted"><Flag codes={entry.countries} fallback="-" /></td>
            <td>
              <span class="verifications">
                <!--
                  The count and, beside it, one dot per facet in a fixed order, so a column of rows
                  can be read down: the same dot is the chamber drawing on every row. The names are
                  on the hover and spelled out on the cartridge page.
                -->
                <span class="verification {level}" title={verificationSummary(entry.verified)}>
                  {counted.done} of {counted.total}
                </span>
                <span class="facets" title={verificationSummary(entry.verified)}>
                  {#each FACETS as facet (facet)}
                    <span
                      class="facet"
                      class:on={entry.verified[facet]}
                      class:off={entry.verified[facet] === false}
                      aria-hidden="true"
                    ></span>
                  {/each}
                </span>
                {#if entry.warnings}
                  <span
                    class="verification implausible"
                    title={`${entry.warnings} plausibility finding${entry.warnings === 1 ? '' : 's'} nothing explains`}
                  >
                    ⚠ {entry.warnings}
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
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.75rem 2.25rem;
    margin-bottom: 1.1rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .search {
    flex: 1 1 100%;
  }
  .search input {
    width: 100%;
  }

  /* Each control is as wide as what it has to hold. Equal columns made Size, which never says more
     than "100%", as wide as Verification, whose longest option is four words. They still grow to
     share a wide bar and collapse to one per row on a narrow one. */
  .cluster {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.6rem;
    min-width: 0;
  }
  /* The sort sits at the far right of the bar, against the edge the count and the view controls
     line up on below it, so the page has one axis: what is shown on the left, how it is shown on
     the right. Below the width where the two clusters share a line it goes back to the left --
     pushed right on a line of its own it hangs in mid-air. */
  .cluster.presentation {
    margin-left: auto;
  }
  @media (max-width: 56rem) {
    .cluster.presentation {
      margin-left: 0;
    }
  }
  .cluster label {
    flex: 1 1 auto;
    min-width: 0;
  }
  .cluster select {
    width: 100%;
  }
  .wide {
    flex-basis: 10.5rem;
  }
  .widest {
    flex-basis: 13rem;
  }
  /* A control holding something other than its default, so that a short list always shows why. */
  .cluster select.on {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  .sort-row {
    display: flex;
    gap: 0.3rem;
  }
  .sort-row select {
    flex: 1;
    min-width: 0;
  }

  .direction {
    flex: 0 0 auto;
    background: var(--surface);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
    color: var(--ink-2);
    padding: 0.4rem 0.6rem;
    line-height: 1;
  }
  .direction:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .views {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.4rem;
  }
  /* Words rather than the two glyphs beside it, so its buttons are sized by what they say. */
  .styles button {
    flex: 0 0 auto;
    padding: 0.4rem 0.7rem;
    white-space: nowrap;
  }
  .size {
    padding: 0.25rem 0.4rem;
    font-size: var(--step-0);
    color: var(--ink-2);
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
    margin: 0 0 1rem;
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
  .verification.full {
    color: var(--ok);
    border-color: currentColor;
    background: var(--ok-soft);
  }
  .verification.partial {
    color: var(--accent);
    border-color: currentColor;
    background: var(--accent-soft);
  }
  .verification.none {
    color: var(--ink-3);
    background: var(--surface-2);
  }
  /* One dot per facet, always in the same order and always all five wide, so the column reads
     down: a gap means the facet does not apply to that record, not that it failed. */
  .facets {
    display: inline-flex;
    gap: 0.15rem;
    align-items: center;
  }
  .facet {
    width: 0.42rem;
    height: 0.42rem;
    border-radius: 50%;
    /* A facet that does not apply keeps its place and draws nothing: the slot holds the column in
       register without saying that anything is owed there. */
    background: transparent;
    border: 1px solid transparent;
  }
  .facet.off {
    background: var(--surface-2);
    border-color: var(--rule-strong);
  }
  .facet.on {
    background: var(--ok);
    border-color: var(--ok);
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
