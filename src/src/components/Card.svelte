<script lang="ts">
  import Drawing from './Drawing.svelte';
  import Flag from './Flag.svelte';
  import { card } from '../lib/drawings';
  import { href } from '../lib/router';
  import {
    FAMILY_LABELS,
    tally,
    type Facet,
    verificationState,
    verificationSummary,
    VERIFICATION_LABELS,
    type DrawingStyle,
    type Entry
  } from '../lib/types';

  interface Props {
    entry: Entry;
    scale: number;
    /** Drawing canvas height in pixels; grows with the grid's zoom so a larger drawing has room. */
    height?: number;
    /**
     * Which way the grid is drawing its cartridges: as objects, or as dimensioned drawings. One
     * setting for the whole grid rather than one per card, because the grid is a comparison and a
     * page of cards drawn two different ways is not one.
     */
    style?: DrawingStyle;
  }
  let { entry, scale, height = 78, style = 'visual' }: Props = $props();

  /**
   * Which drawing this card shows. Always of the cartridge and never of its chamber -- a card is a
   * picture of the round -- and in the asked-for style where the cartridge has been drawn that
   * way. See `card`; where it has not, this is the cartridge's own drawing, unchanged.
   */
  const plate = $derived(card(entry, style));
  const dimensioned = $derived(plate?.style === 'technical');

  const counted = $derived(tally(entry.verified));
  // Named `level` rather than `state`: a top-level `state` would turn every `$state`
  // rune in this file into a store read of it.
  const level = $derived(verificationState(entry.verified));
  /** How many facets a reader has read and found wrong; see the chip beside the count. */
  const disputed = $derived(
    Object.entries(entry.votes ?? {}).filter(
      ([facet, tally]) => tally.reject > 0 && !entry.verified[facet as Facet]
    ).length
  );
  let drawing: HTMLSpanElement;
  let dragging = $state(false);
  let dragged = $state(false);
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;
  let pointerId: number | null = null;

  function startDrag(event: PointerEvent) {
    drawing.setPointerCapture(event.pointerId);
    pointerId = event.pointerId;
    dragging = true;
    dragged = false;
    startX = event.clientX;
    startY = event.clientY;
    startScrollLeft = drawing.scrollLeft;
    startScrollTop = drawing.scrollTop;
  }

  function drag(event: PointerEvent) {
    if (!dragging) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) dragged = true;
    if (dragged) {
      event.preventDefault();
      drawing.scrollLeft = startScrollLeft - deltaX;
      drawing.scrollTop = startScrollTop - deltaY;
    }
  }

  function endDrag() {
    dragging = false;
    if (pointerId !== null && drawing.hasPointerCapture(pointerId)) {
      drawing.releasePointerCapture(pointerId);
    }
    pointerId = null;
  }

  function openCard(event: MouseEvent) {
    if (dragged) {
      event.preventDefault();
      dragged = false;
    }
  }
</script>

<!--
  The whole card is the link, not just the name.
  A card that looks like one object and responds in only one small corner of itself is a card that
  gets clicked twice. As a single anchor it is also one tab stop with one accessible name, which is
  what a keyboard reader wants from a grid of 532.
-->
<a class="card" href={href.cartridge(entry.key)} onclick={openCard} draggable="false">
  <div
    class="drawing"
    bind:this={drawing}
    onpointerdown={startDrag}
    onpointermove={drag}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    onlostpointercapture={endDrag}
    class:dragging
    class:dimensioned
    role="region"
    aria-label={`${entry.name} preview`}
    title="Drag to inspect an oversized preview"
  >
    <Drawing {entry} {scale} {height} drawing={plate} />
  </div>

  <span class="titles">
    <span class="name">{entry.name}</span>
    {#if entry.alt.length}
      <span class="alt">{entry.alt.join(' · ')}</span>
    {/if}
  </span>

  <span class="chips">
    <span class="chip">{FAMILY_LABELS[entry.family] ?? entry.family}</span>
    {#if entry.countries.length}<Flag codes={entry.countries} />{/if}
    <!--
      How far the record can be trusted, said on every card so that the grid never reads as
      uniformly authoritative.

      Five things can be confirmed about a record and the card has room for none of them by name,
      so it shows the count and hands the names to the hover. A count is the honest summary here:
      "3 of 4 verified" says both that somebody has been through this record and that they have not
      finished, which neither a tick nor the word "unverified" manages on its own.
    -->
    <span class="chip confidence {level}" title={verificationSummary(entry.verified, entry.votes)}>
      {#if level === 'full'}✓ {VERIFICATION_LABELS.full}
      {:else if level === 'partial'}{counted.done} of {counted.total} verified
      {:else}{VERIFICATION_LABELS.none}{/if}
    </span>
    <!--
      A reading that found a fault, which the count above cannot show: it counts what is settled,
      and a disputed facet is settled as much as an unread one, which is to say not at all. The
      card says so in a word and the hover names which facet; the cartridge page shows the vote.
    -->
    {#if disputed}
      <span class="chip confidence disputed" title={verificationSummary(entry.verified, entry.votes)}>
        {disputed} disputed
      </span>
    {/if}
    <!--
      Separate from the count, because it is a different kind of statement: not "nobody has checked
      this" but "a rule fired on it and nothing accounts for that". Only the unexplained ones; a
      finding the dataset explains has been dealt with.
    -->
    {#if entry.warnings}
      <span
        class="chip confidence implausible"
        title={`${entry.warnings} plausibility finding${entry.warnings === 1 ? '' : 's'} nothing explains; see the cartridge page`}
      >
        ⚠ {entry.warnings} check{entry.warnings === 1 ? '' : 's'}
      </span>
    {/if}
  </span>
</a>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    padding: 1rem 1.1rem 0.9rem;
    color: inherit;
    text-decoration: none;
    transition: border-color 0.12s ease, box-shadow 0.12s ease, transform 0.12s ease;
  }
  .card:hover {
    text-decoration: none;
    border-color: var(--accent);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.07);
    transform: translateY(-1px);
  }
  .card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* The drawing keeps the shared comparison scale. At high zoom it becomes a small viewport that
     can be inspected by dragging instead of shrinking or making every grid row enormous. */
  .drawing {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    min-height: 78px;
    max-height: 14rem;
    overflow: auto;
    cursor: grab;
    scrollbar-width: thin;
    touch-action: none;
    overscroll-behavior: contain;
    user-select: none;
  }
  .drawing.dragging {
    cursor: grabbing;
  }
  /* A dimensioned drawing is a sheet, not an object: it is four or five times as tall as the
     round it draws, because the dimension lines and their labels stand off it on every side. Given
     the same 78 px as a cartridge lying down it would be a letterbox onto the middle of itself, so
     the box grows to the shape of what it holds and the grid's rows grow with it. */
  .drawing.dimensioned {
    min-height: 11rem;
    max-height: 22rem;
    align-items: flex-start;
  }
  .drawing :global(img),
  .drawing :global(svg) {
    flex: 0 0 auto;
    user-select: none;
    -webkit-user-drag: none;
  }

  .titles {
    display: block;
    margin-top: auto;
    min-width: 0;
  }
  .name {
    display: block;
    font-size: var(--step-1);
    font-weight: 600;
    line-height: 1.25;
  }
  .alt {
    display: block;
    margin-top: 0.15rem;
    font-size: 0.72rem;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
  }
  .chip {
    font-size: 0.68rem;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    white-space: nowrap;
  }
  .chip.quiet {
    background: var(--surface-2);
    color: var(--ink-2);
  }
  .confidence.full {
    color: var(--ok, #2f7a3f);
    border-color: currentColor;
    background: var(--ok-soft);
  }
  /* Partly verified is its own state and reads as one: not the green of finished, not the grey of
     untouched. */
  .confidence.partial {
    color: var(--accent);
    background: var(--accent-soft);
    border-color: currentColor;
  }
  .confidence.none {
    color: var(--ink-3);
    background: var(--surface-2);
    border-color: var(--rule);
  }
  /* A reader has looked and disagreed. Coloured like a plausibility finding rather than like
     an unread facet, because both are positive reason to doubt the record rather than an absence
     of anybody's attention. */
  .confidence.disputed {
    color: var(--alert);
    background: var(--alert-soft);
    border-color: currentColor;
  }
  .confidence.implausible {
    color: var(--warn, #8a5a00);
    background: var(--warn-soft, #fff3d6);
    border-color: currentColor;
  }
</style>
