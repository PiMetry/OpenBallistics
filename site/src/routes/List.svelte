<script module lang="ts">
  // Keep the current search while a detail page is open, for this visit only.
  let previous = { query: '', family: '', country: '', sort: 'name' as import('../lib/data').Sort, direction: 'asc' as 'asc' | 'desc' };
</script>

<script lang="ts">
  import CipBadge from '../components/CipBadge.svelte';
  import { LayoutGrid, List as ListIcon } from "@lucide/svelte";
  import { Label } from '$lib/components/ui/label/index.js';
  import { NativeSelect } from '$lib/components/ui/native-select/index.js';
  import { Button as ShadcnButton } from '$lib/components/ui/button/index.js';

  import SearchPanel from '../components/SearchPanel.svelte';
  import ResultsSummary from '../components/ResultsSummary.svelte';
  import AddAction from '../components/AddAction.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { onDestroy } from 'svelte';
  import Card from '../components/Card.svelte';
  import Flag from '../components/Flag.svelte';
  import { countries, entries, families, search, sortEntries, type Sort } from '../lib/data';
  import { STYLES } from '@lib/core';
import {
  rememberStyle,
  storedStyle,
  styleLabel,
  styleNote
} from '../lib/drawings';
  import { lang, t } from '../lib/i18n.svelte';
  import { href } from '../lib/router';
  import { PX_PER_MM } from '@lib/core';
  import {
  COUNTRY_NAMES,
  type DrawingStyle
} from '@lib/core';
import { familyLabel } from '../lib/labels';

  let query = $state(previous.query);
  let family = $state(previous.family);
  let country = $state(previous.country);


  let sort = $state<Sort>(previous.sort);

  /**
   * Which way round the sort runs.
   *
   * Every sort has a direction that is obviously the useful one to open on - names from A,
   * lengths from the shortest - so changing the column resets the direction to that column's own
   * default instead of carrying the last one over. The reader can then flip it.
   */
  const NATURAL: Record<Sort, 'asc' | 'desc'> = {
    name: 'asc',
    family: 'asc',
    L3: 'asc',
    L6: 'asc',
    G1: 'asc'
  };
  let direction = $state<'asc' | 'desc'>(previous.direction);
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


  const shown = $derived.by(() => {
    let list = entries;
    if (family) list = list.filter((entry) => entry.family === family);
    // A joint standard answers to either of its countries: filtering for Germany finds the 9 x 18
    // that Germany and Austria published together.
    if (country) list = list.filter((entry) => entry.countries.includes(country));
    list = search(query, list);

    return sortEntries(list, sort, direction, familyLabel, lang());
  });

  /**
   * Pixels per millimetre for the grid: the CSS reference, so 100% is life size.
   *
   * One scale for every card is the whole point of the grid - it is what makes a .22 Long Rifle
   * beside a .378 Weatherby read as the size difference it is - and the strongest version of that
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
   * - the zoom multiplies all of them - so the comparison between cards holds at any size, and
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
   * comparison the grid exists for survives the switch - a .22 Long Rifle's dimensioned drawing
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

  /**
   * How much of the match is actually put into the page.
   *
   * All 532 were, in either view, and that is about 4,900 elements the browser has to build,
   * style and lay out before it will answer a tap - a third of a second of blocked main thread on
   * a phone, spent almost entirely on cards nobody has scrolled to. The drawings were already
   * lazy (see `Drawing`), so this is the same idea one level up: the rows themselves wait too.
   *
   * A window of `STEP` is put in first and another `STEP` is added whenever the end of the list
   * comes within a screen or so of the viewport, until the whole match is there. What this costs
   * is the browser's own find-on-page, which cannot see a card that is not in the document yet;
   * the search box above finds all 532 whatever is rendered, and it is the way this list is meant
   * to be searched. The count below says how many matched, which is the honest number either way.
   */
  const STEP = 60;
  let rendered = $state(STEP);

  // A different set of matches is a different list: start it at the top rather than carrying the
  // window from the last one over. Depends on `shown` alone, so growing the window below does not
  // reset it.
  $effect(() => {
    shown;
    rendered = STEP;
  });

  const inPage = $derived(shown.slice(0, rendered));
  const more = $derived(shown.length > rendered);

  /**
   * The end of the list, watched so that reaching it asks for more.
   *
   * The observer is rebuilt on every growth rather than left attached, because an observer that is
   * already intersecting does not fire again for staying that way: on a tall screen the marker can
   * still be in view after 60 more cards, and the list would stop growing until the reader
   * scrolled. Re-observing fires immediately while it is in view, so the window keeps growing
   * until the marker is genuinely below the fold, and stops - the marker is removed once the
   * whole match is rendered.
   */
  let end: HTMLElement | undefined = $state();
  $effect(() => {
    rendered;
    const marker = end;
    if (!marker) return;
    // No observer (a very old browser, or a test): show everything rather than hide it.
    if (typeof IntersectionObserver === 'undefined') {
      rendered = shown.length;
      return;
    }
    const watcher = new IntersectionObserver(
      (found) => {
        if (found.some((one) => one.isIntersecting)) {
          rendered = Math.min(rendered + STEP, shown.length);
        }
      },
      { rootMargin: '800px' }
    );
    watcher.observe(marker);
    return () => watcher.disconnect();
  });

  /** Whether anything is narrowing the list - which is what `reset` clears, and nothing else. */
  const filtering = $derived(
    query.trim() !== '' || family !== '' || country !== ''
  );

  function reset() {
    query = '';
    family = '';
    country = '';
  }
  onDestroy(() => { previous = { query, family, country, sort, direction }; });
</script>
<div data-ui="List" class="contents">

<PageHeader title={t('list.title')} description={t('list.lede')} eyebrow="Open Ballistics · C.I.P. TDCC">
  {#snippet actions()}<AddAction label={t('actions.addCartridge')} href={href.newCartridge()} />{/snippet}
</PageHeader>

<SearchPanel bind:query placeholder={t('list.searchHint')}>
  {#snippet filters()}
    <Label>
      <span class="eyebrow">{t('list.family')}</span>
      <NativeSelect class={[(family !== '') ? "on" : '']} bind:value={family} >
        <option value="">{t('list.allFamilies')}</option>
        {#each families as name (name)}
          <option value={name}>{familyLabel(name)}</option>
        {/each}
      </NativeSelect>
    </Label>

    <Label>
      <span class="eyebrow">{t('list.country')}</span>
      <NativeSelect class={[(country !== '') ? "on" : '']} bind:value={country} >
        <option value="">{t('list.all')}</option>
        {#each countries as code (code)}
          <option value={code}>{COUNTRY_NAMES[code] ?? code}</option>
        {/each}
      </NativeSelect>
    </Label>

  {/snippet}
  {#snippet presentation()}
    <Label>
      <span class="eyebrow">{t('list.sort')}</span>
      <span class="sort-row">
        <NativeSelect value={sort} onchange={(event) => setSort(event.currentTarget.value as Sort)}>
          <option value="name">{t('list.sortName')}</option>
          <option value="family">{t('list.sortFamily')}</option>
          <option value="L3">{t('list.sortCaseLength')}</option>
          <option value="L6">{t('list.sortOverallLength')}</option>
          <option value="G1">{t('list.sortBullet')}</option>
        </NativeSelect>
        <ShadcnButton variant="outline"
          type="button"
          class="direction"
          onclick={() => (direction = direction === 'asc' ? 'desc' : 'asc')}
          aria-label={t(direction === 'asc' ? 'list.ascending' : 'list.descending')}
          title={t(direction === 'asc' ? 'list.ascending' : 'list.descending')}
        >
          <span aria-hidden="true">{direction === 'asc' ? '↑' : '↓'}</span>
        </ShadcnButton>
      </span>
    </Label>
  {/snippet}
</SearchPanel>

<ResultsSummary count={t('list.count', { shown: shown.length, total: entries.length })} {filtering} onclear={reset}>
  {#snippet controls()}
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
      <div class="segmented styles" role="group" aria-label={t('list.style')}>
        {#each STYLES as option (option)}
          <ShadcnButton variant={style === option ? 'default' : 'outline'} class="-ml-px rounded-none first:ml-0 first:rounded-l-md last:rounded-r-md focus-visible:relative focus-visible:z-10"
            type="button"

            aria-pressed={style === option}
            title={styleNote(option)}
            onclick={() => setStyle(option)}>{styleLabel(option)}</ShadcnButton
          >
        {/each}
      </div>
      <NativeSelect
        class="size w-24"
        bind:value={zoomPercent}
        aria-label={t('list.scale')}
        title={t('list.scaleNote')}
      >
        {#each ZOOMS as percent (percent)}
          <option value={percent}>{percent}%</option>
        {/each}
      </NativeSelect>
    {/if}
    <div class="segmented" role="group" aria-label={t('list.view')}>
      <ShadcnButton size="icon" variant={view === 'grid' ? 'default' : 'outline'} class="-ml-px rounded-none first:ml-0 first:rounded-l-md last:rounded-r-md focus-visible:relative focus-visible:z-10"
        type="button"

        aria-pressed={view === 'grid'}
        aria-label={t('list.gridView')}
        title={t('list.gridView')}
        onclick={() => (view = 'grid')}><LayoutGrid class="size-4" aria-hidden="true" /></ShadcnButton
      >
      <ShadcnButton size="icon" variant={view === 'list' ? 'default' : 'outline'} class="-ml-px rounded-none first:ml-0 first:rounded-l-md last:rounded-r-md focus-visible:relative focus-visible:z-10"
        type="button"

        aria-pressed={view === 'list'}
        aria-label={t('list.listView')}
        title={t('list.listView')}
        onclick={() => (view = 'list')}><ListIcon class="size-4" aria-hidden="true" /></ShadcnButton
      >
    </div>
  </div>
  {/snippet}
</ResultsSummary>

{#if shown.length === 0}
  <div class="empty">
    <h2>{t('list.emptyLead')}</h2>
    <p>
    {@html t('list.emptyBody', {
      a: '<code>308 Win.</code>',
      b: '<code>9 mm Luger</code>',
      c: '<code>7,62 x 39</code>'
    })}
    </p>
    <ShadcnButton variant="outline" class="reset" onclick={reset}>{t('list.clear')}</ShadcnButton>
  </div>
{:else if view === 'grid'}
  <div class="catalogue-grid">
    {#each inPage as entry (entry.key)}
      <Card {entry} {scale} height={cardHeight} {style} />
    {/each}
  </div>
{:else}
  <div class="scroll-x" role="region" aria-label={t('list.title')}>
    <table>
      <caption class="sr-only">{t('list.title')}</caption>
      <thead>
        <tr>
          <th>{t('list.sortName')}</th>
          <th>{t('list.family')}</th>
          <th>{t('list.country')}</th>
        </tr>
      </thead>
      <tbody>
        {#each inPage as entry (entry.key)}
          <!--
            The whole row is the link, like the whole card is. Only the first cell can hold the
            anchor - a row is not allowed to contain one - so the other cells carry a click that
            follows it. The anchor is what makes the row keyboard-reachable and what a screen reader
            announces; the click handler is a convenience on top of it, which is why the cells are
            not given roles or tab stops of their own and would duplicate it if they were.
          -->
          <tr onclick={(event) => {
            if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || (event.target as Element).closest('a')) return;
            location.hash = href.cartridge(entry.key).slice(1);
          }}>
            <td>
              <div class="flex flex-wrap items-center gap-2"><a href={href.cartridge(entry.key)}>{entry.name}</a><CipBadge /></div>
              {#if entry.alt.length}
                <span class="alt">{entry.alt.join(' · ')}</span>
              {/if}
            </td>
            <td class="muted">{familyLabel(entry.family)}</td>
            <td class="muted"><Flag codes={entry.countries} fallback="-" /></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<!--
  The end of what has been rendered, and the thing that asks for the rest. It says the number
  rather than spinning: a reader who has scrolled to the bottom of 60 of 532 should be told that
  is where they are, and a reader whose scrolling has outrun the rendering should see why.
-->
{#if more}
  <p class="more" bind:this={end} aria-live="polite">
    {@html t('list.more', {
      shown: `<strong class="num">${inPage.length}</strong>`,
      total: `<strong class="num">${shown.length}</strong>`
    })}
    <ShadcnButton variant="outline" class="reset" onclick={() => rendered = Math.min(rendered + STEP, shown.length)}>{t('list.loadMore')}</ShadcnButton>
  </p>
{/if}

</div>
<style>
  @layer legacy {
  :global([data-ui="List"] .scroll-x) { border: 1px solid var(--rule); border-radius: var(--panel-radius); background: var(--surface); }
  :global([data-ui="List"] .sort-row) {
    display: flex;
    gap: 0.3rem;
  }
  :global([data-ui="List"] .sort-row [data-slot="native-select"]) {
    flex: 1;
    min-width: 0;
  }

  :global([data-ui="List"] .direction) {
    flex: 0 0 auto;
    background: var(--surface);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
    color: var(--ink-2);
    padding: 0.4rem 0.6rem;
    line-height: 1;
  }
  :global([data-ui="List"] .direction:hover) {
    border-color: var(--link);
    color: var(--link);
  }
  :global([data-ui="List"] .views) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.4rem;
  }
  :global([data-ui="List"] .segmented) {
    display: inline-flex;
    isolation: isolate;
  }

  :global([data-ui="List"] .empty) {
    color: var(--ink-2);
    padding: clamp(1.25rem, 4vw, 3rem);
    text-align: center;
    border: 1px dashed var(--rule-strong);
    border-radius: var(--panel-radius);
    background: var(--surface);
  }
  :global([data-ui="List"] .empty h2) {
    color: var(--ink);
    font-size: var(--step-2);
  }
  :global([data-ui="List"] .reset) {
    padding: 0.5rem 0.8rem;
    background: var(--accent-soft);
    color: var(--link);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
  }
  :global([data-ui="List"] .more .reset) {
    display: block;
    margin: 0.75rem auto 0;
  }
  :global([data-ui="List"] .empty code) {
    font-family: var(--mono);
    font-size: 0.85em;
    background: var(--surface-2);
    padding: 0.05rem 0.25rem;
    border-radius: 3px;
  }

  :global([data-ui="List"] .more) {
    margin: 1.25rem 0 0;
    padding: 0.9rem 0;
    text-align: center;
    color: var(--ink-3);
    font-size: var(--step-0);
  }

  /* Three cards across at most.

     `auto-fill` on its own puts as many 21rem cards in a row as fit, which on the 92rem page the
     site now uses is four, and a fourth column takes width from the drawing on every card in the
     grid - the drawing being the thing a reader is scanning for. Three is the cap; below the width
     for three the grid still falls to two and then to one on its own. */
  :global([data-ui="List"] .catalogue-grid) {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 21rem), 1fr));
    gap: 1rem;
  }
  @media (min-width: 70rem) {
    :global([data-ui="List"] .catalogue-grid) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  :global([data-ui="List"] table) {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    font-size: var(--step-0);
  }
  :global([data-ui="List"] th) {
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
  :global([data-ui="List"] tbody tr) {
    cursor: pointer;
  }
  :global([data-ui="List"] tbody tr:hover) {
    background: var(--accent-soft);
  }
  :global([data-ui="List"] tbody tr:focus-within) {
    background: var(--accent-soft);
  }
  :global([data-ui="List"] td) {
    padding: 0.5rem 0.7rem;
    border-bottom: 1px solid var(--rule);
    vertical-align: baseline;
  }
  :global([data-ui="List"] .muted) {
    color: var(--ink-2);
  }
  :global([data-ui="List"] .alt) {
    display: block;
    font-size: 0.75rem;
    color: var(--ink-3);
  }
  }
</style>
