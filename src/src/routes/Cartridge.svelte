<script lang="ts">
  import Drawing from '../components/Drawing.svelte';
  import Flag from '../components/Flag.svelte';
  import GroupTable from '../components/GroupTable.svelte';
  import { byKey, load } from '../lib/data';
  import {
    main,
    offered,
    plates,
    rememberStyle,
    storedStyle,
    STYLE_LABELS,
    STYLE_NOTES,
    STYLES,
    SUBJECTS
  } from '../lib/drawings';
  import { issueUrl, verifyUrl } from '../lib/issue';
  import { href } from '../lib/router';
  import { PX_PER_MM } from '../lib/scale';
  import {
    FACETS,
    FACET_LABELS,
    FACET_NOTES,
    facetState,
    facetSummary,
    net,
    VERIFY_THRESHOLD,
    FAMILY_LABELS,
    tally,
    verificationState,
    VERIFICATION_LABELS,
    type Drawing as Plate,
    type DrawingStyle,
    type DrawingSubject,
    type Entry,
    type Finding,
    type Record_
  } from '../lib/types';

  interface Props {
    key: string;
  }
  let { key }: Props = $props();

  const entry = $derived(byKey(key));
  const record = $derived(load(key));
  const report = $derived(entry ? issueUrl(entry) : null);
  /**
   * One "verify this" link per facet the record actually has, in the order the strip at the top
   * names them. A facet that cannot apply gets no link, for the same reason it gets no pill: there
   * is no bullet on a record that dimensions none, and nothing to confirm about it.
   */
  const verifiable = $derived(
    entry ? FACETS.filter((facet) => facet in entry.verified).map((facet) => ({
      facet,
      href: verifyUrl(entry, facet)
    })) : []
  );

  /**
   * Pixels per millimetre for the drawing at the head of the page: the CSS reference, so 100% is
   * life size.
   *
   * The page used to fit the drawing to its column, which made every cartridge arrive the same
   * width on screen and told the reader nothing about how big it is -- a .22 Long Rifle and a
   * 12.7x108 both filled the column. At `PX_PER_MM` the drawing opens as the object: a 9x19 is a
   * couple of inches of screen and a .50 BMG is most of a column, and the two pages compare with
   * each other as directly as two cards in the grid do. Anything longer than the column pans; see
   * `PX_PER_MM` for what a monitor can and cannot promise about "life size".
   */

  /**
   * A zoom on top of life size, in steps, from the +/- buttons beside the drawing. Kept per
   * browser so the reader who likes it larger finds it larger next time; 100% -- the cartridge at
   * its own size -- is where it opens when nothing is stored.
   */
  const ZOOM_STEPS: Zoom[] = ['fit', 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  /**
   * How big the drawing is: a multiple of life size, or `fit`, which fills the column it is in.
   *
   * Life size is the site's own measure and stays the default for a rendered drawing -- 100% means
   * a cartridge the size of the cartridge, held against a ruler. It is the wrong default for a
   * dimensioned one. Those are drawn at the size of the object too, but what a reader wants from
   * them is the writing, and C.I.P.'s symbols are 1.6 mm high at that size: legible on paper at
   * arm's length and not on a screen. So the two styles keep their own zoom, and a dimensioned
   * drawing opens filling its column.
   *
   * `fit` is a word rather than a percentage because it is not one: it depends on how wide the
   * window is. Both panels still share it, computed from the wider of the two, so the cartridge
   * and the chamber stay at one scale and stay comparable -- filling each column independently
   * would show them at two different scales and quietly break the only comparison worth making.
   */
  type Zoom = number | 'fit';

  function zoomKey(style: DrawingStyle): string {
    return style === 'technical' ? 'drawing-zoom-technical' : 'drawing-zoom';
  }
  function storedZoom(style: DrawingStyle): Zoom {
    const fallback: Zoom = style === 'technical' ? 'fit' : 1;
    try {
      const raw = localStorage.getItem(zoomKey(style));
      if (raw === null) return fallback;
      const value: Zoom = raw === 'fit' ? 'fit' : Number(raw);
      return ZOOM_STEPS.includes(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }
  let zoom = $state<Zoom>(storedZoom(storedStyle()));
  let drawing = $state<HTMLElement>(undefined!);
  let dragging = $state(false);
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;
  let pointerId: number | null = null;

  /**
   * What a drag pans.
   *
   * Side by side, each panel scrolls inside its own column, so a drag in the chamber must move the
   * chamber and leave the cartridge where it is. On its own, the drawing pans the whole box, the
   * way it did before there were two of them. Whichever of the two actually overflows is the one
   * that can be panned, so that is what is asked.
   */
  function scroller(from: EventTarget | null): HTMLElement {
    const plate = (from as HTMLElement | null)?.closest?.('.plate') as HTMLElement | null;
    return plate && plate.scrollWidth > plate.clientWidth ? plate : drawing;
  }
  let panning: HTMLElement | null = null;

  function startDrag(event: PointerEvent) {
    if ((event.target as HTMLElement).closest('button')) return;
    panning = scroller(event.target);
    panning.setPointerCapture(event.pointerId);
    pointerId = event.pointerId;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startScrollLeft = panning.scrollLeft;
    startScrollTop = panning.scrollTop;
  }

  function drag(event: PointerEvent) {
    if (!dragging || !panning) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (Math.abs(deltaX) <= 3 && Math.abs(deltaY) <= 3) return;
    event.preventDefault();
    panning.scrollLeft = startScrollLeft - deltaX;
    panning.scrollTop = startScrollTop - deltaY;
  }

  function endDrag() {
    dragging = false;
    if (panning && pointerId !== null && panning.hasPointerCapture(pointerId)) {
      panning.releasePointerCapture(pointerId);
    }
    panning = null;
    pointerId = null;
  }

  function setZoom(value: Zoom) {
    zoom = value;
    try {
      localStorage.setItem(zoomKey(wanted), String(value));
    } catch {
      // Storage may be unavailable; the zoom still applies for this page.
    }
  }
  function zoomBy(direction: 1 | -1) {
    const index = ZOOM_STEPS.indexOf(zoom);
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))];
    setZoom(next ?? 1);
  }

  /**
   * How wide one panel is, which is all `fit` needs to know.
   *
   * The panels are equal grid tracks, so every one of them reports the same number and they can
   * all write to it. Zero until the first measurement, and `fit` falls back to life size until
   * then, so the first frame is never a drawing of no width.
   */
  let panelWidth = $state(0);
  /**
   * How tall the window is, which is what bounds a drawing standing up.
   *
   * Lying down, a drawing was bounded by the column it sat in and `fit` meant the column's width.
   * Upright it is three to five times taller than it is wide, so filling the column's width would
   * make a cartridge eleven hundred pixels tall and the page a thing to scroll rather than read.
   * So `fit` is whichever binds first, the width of the column or a little under two thirds of the
   * window, and the pair still shares one scale.
   */
  let viewportHeight = $state(900);
  function fitScale(widest: number, tallest: number): number {
    if (!panelWidth) return PX_PER_MM;
    return Math.min(panelWidth / tallest, (viewportHeight * 0.62) / widest);
  }

  /**
   * One standard, several drawings.
   *
   * A cartridge is drawn along three axes and the page lets the reader move along each of them:
   *
   * - **Subject.** The cartridge, or the chamber it is fired in. The tables have shown both sides
   *   since the beginning -- Cartridge maxi and Chamber mini -- while the picture showed one.
   * - **Style.** The rendered object, or the dimensioned drawing: the same geometry answering
   *   "what is it" and "what are its numbers", which are two different questions a reader has.
   * - **Length.** A shot cartridge is a family, not a cartridge. A 12 gauge is published at nine
   *   hull lengths, from 12/35 to 12/89 -- 54 mm between the ends of that range, each with its own
   *   chamber and its own pressures -- and the sheet names each one, `12/70`.
   *
   * A control appears only where the dataset has more than one thing to show on that axis, so a
   * cartridge with one drawing looks exactly as it always did. Nothing is hidden by picking:
   * both tables still list every published length, and the selection marks one of them.
   */
  type Hull = { l: number; marking: string | null };

  function hullLengths(data: Record_): Hull[] | null {
    const lengths = data.cartridge?.lengths;
    if (!Array.isArray(lengths)) return null;
    const rows = lengths
      .map((row) => ({
        l: Number(row.l),
        marking: typeof row.marking === 'string' ? row.marking : null
      }))
      .filter((row) => Number.isFinite(row.l));
    // One length is not a choice; a cartridge published at one is drawn and tabulated as one.
    return rows.length > 1 ? rows : null;
  }

  /** What names a length on this page: the marking the sheet prints, or the length itself. */
  function tag(row: { l?: number; marking?: string | null }): string | null {
    if (row.marking) return row.marking;
    return row.l === undefined ? null : `${row.l}`;
  }

  /**
   * The length the page opens at: the one the cartridge's own drawing is at, so that opening a
   * card does not change the picture the reader just clicked. With no drawing to go by, the
   * longest published length, which is the one the list already sorts and filters this cartridge
   * by.
   */
  function defaultLength(rows: Hull[], entry: Entry | undefined): string {
    const own = main(entry);
    return (own && tag(own)) ?? tag(rows.reduce((a, b) => (b.l > a.l ? b : a)))!;
  }

  /**
   * The drawing to show for what the reader asked for -- which is not always what they asked for,
   * because a kind may be drawn at some lengths and not at others.
   *
   * Preference runs subject first: a reader looking at chambers wants a chamber, and a cartridge
   * is not a near miss for one. Then the length, then the style. Where the asked-for length is
   * undrawn the nearest drawn one wins, which on a shot cartridge is the closest thing to the
   * cartridge in hand. Whatever comes back, `Cartridge.svelte` says out loud when it is not what
   * was asked for rather than letting one drawing stand in for another in silence.
   */
  function resolve(
    drawn: Plate[],
    subject: DrawingSubject,
    style: DrawingStyle,
    length: string | null,
    want: number | null
  ): Plate | null {
    if (!drawn.length) return null;
    const miss = (plate: Plate) =>
      (plate.subject === subject ? 0 : 100) +
      (length !== null && tag(plate) !== null && tag(plate) !== length ? 10 : 0) +
      (plate.style === style ? 0 : 1);
    const distance = (plate: Plate) =>
      want !== null && plate.l !== undefined ? Math.abs(plate.l - want) : 0;
    return [...drawn].sort((a, b) => miss(a) - miss(b) || distance(a) - distance(b))[0] ?? null;
  }

  /** How a drawing is named in a sentence: "technical chamber at 12/70". */
  function describe(plate: Plate): string {
    const at = tag(plate);
    return `${STYLE_LABELS[plate.style].toLowerCase()} ${plate.subject}${at ? ` at ${at}` : ''}`;
  }



  /**
   * What is on screen, where it is not what was asked for.
   *
   * Written here rather than in the markup so that the sentence is one string: a `{#if}` around a
   * clause is a place for a space to go missing, and this one is read as prose.
   */
  function missingNote(
    subject: DrawingSubject,
    style: DrawingStyle,
    length: string | null,
    plate: Plate
  ): string {
    const asked = `${STYLE_LABELS[style].toLowerCase()} ${subject} drawing`;
    return `No ${asked}${length ? ` at ${length}` : ''}; showing the ${describe(plate)}.`;
  }

  /**
   * What to show: one panel per subject the cartridge has, at the style and length asked for.
   *
   * Both at once rather than one with a switch between them. A cartridge and the chamber it is
   * fired in are the two halves of one standard -- the tables have always shown both, Cartridge
   * maxi beside Chamber mini -- and the interesting thing about them is the difference: the
   * chamber is a tenth of a millimetre wider here and a tenth longer there, and that is the whole
   * subject of the sheet. A toggle between them shows each on its own and hides exactly the
   * comparison a reader came for.
   *
   * They are drawn at one scale and hung from one left edge, which is what makes the comparison
   * work, and they pan together for the same reason.
   */
  function panels(
    drawn: Plate[],
    style: DrawingStyle,
    length: string | null,
    want: number | null
  ): Plate[] {
    const out: Plate[] = [];
    for (const subject of SUBJECTS) {
      if (!drawn.some((plate) => plate.subject === subject)) continue;
      const plate = resolve(drawn, subject, style, length, want);
      if (plate) out.push(plate);
    }
    return out;
  }

  /**
   * The length the reader picked, and the cartridge it was picked on.
   *
   * Both, because a marking is only meaningful on the cartridge it was picked on: 12/70 means
   * nothing on a 20 gauge, and following a link from one shot cartridge to another must not carry
   * one page's choice onto another page's list.
   */
  let chosen = $state<{ key: string; length: string } | null>(null);

  /**
   * Which style the reader last looked at, shared with the grid; see `storedStyle`.
   *
   * Unlike the length this is not about one cartridge, which is why it is not kept per cartridge
   * and not kept per page: a reader working from dimensioned drawings is doing that across the
   * dataset and should not have to say so twice. Where a cartridge has not been drawn that way the
   * page falls back to what it has, and the stored preference is left alone for the next cartridge
   * that can honour it.
   *
   * The subject used to be kept here too, back when the page showed one drawing and switched. It
   * shows both now, so there is nothing to remember.
   */
  let wanted = $state(storedStyle());
  function setStyle(next: DrawingStyle) {
    wanted = next;
    // Each style keeps its own size, so switching to the dimensioned drawing does not leave it at
    // a life size nobody can read, nor the rendered one blown up to fill a column.
    zoom = storedZoom(next);
    rememberStyle(next);
  }
</script>

<svelte:window bind:innerHeight={viewportHeight} />

{#await record}
  <p class="status">Loading {entry?.name ?? key}…</p>
{:then data}
  {@const drawn = plates(entry)}
  {@const styles = offered(STYLES, drawn, 'style')}
  {@const style = styles.includes(wanted) ? wanted : (styles[0] ?? 'visual')}
  {@const hulls = hullLengths(data)}
  {@const selected = hulls
    ? (chosen?.key === key ? chosen.length : defaultLength(hulls, entry))
    : null}
  {@const want = hulls?.find((row) => tag(row) === selected)?.l ?? null}
  {@const shown = panels(drawn, style, selected, want)}
  <!--
    One scale for every drawing on the page, from the widest and the tallest of them. The point of
    showing a cartridge and the chamber it is fired in is the tenth of a millimetre between them,
    and sizing each to its own row would show them at two scales and quietly destroy it.
  -->
  {@const widest = shown.length ? Math.max(...shown.map((plate) => plate.svg[0])) : 1}
  {@const tallest = shown.length ? Math.max(...shown.map((plate) => plate.svg[1])) : 1}
  {@const drawScale = zoom === 'fit' ? fitScale(widest, tallest) : PX_PER_MM * zoom}
  <!--
    How far this record can be trusted, said before the record rather than after it.

    It sat under the drawing in a filled box, which put the loudest thing on the page between the
    picture and the numbers and made an unverified record look alarming. Up here it is a masthead:
    the first thing read, in the smallest voice on the page, because what it says is a caveat and
    not a headline.

    Five different things can be confirmed about a record and they are confirmed separately, by
    different readings at different times: the cartridge's published numbers, the chamber's, the
    drawing of each, and the nose form of the bullet. One word over all five would claim more than
    anybody checked, so each is named and answered on its own.

    Under them, where any plausibility rule fired, the check: every finding, the unexplained ones
    first and the known exceptions with their reason, each naming both sides of the value it
    compares so that two columns called L3 are never mistaken for one. A record can be fully
    verified and still carry an explained finding -- that is what explaining it was for.
  -->
  {@const findings = (data.annotations?.implausible ?? []) as Finding[]}
  {@const unexplained = findings.filter((f) => !f.known)}
  {@const explained = findings.filter((f) => f.known)}
  {@const verified = entry?.verified ?? {}}
  {@const votes = entry?.votes ?? {}}
  {@const counted = tally(verified)}
  {@const level = verificationState(verified)}
  <section class="verified" aria-label="Verification status">
    <p class="verified-line">
      <span class="verified-count {level}">
        {#if level === 'full'}✓ {VERIFICATION_LABELS.full}
        {:else if level === 'partial'}{counted.done} of {counted.total} verified
        {:else}{VERIFICATION_LABELS.none}{/if}
      </span>
      <span class="verified-what">- verified means a person did proofread the data</span>
      <!--
        Each facet with how its vote stands, which is what a count could never say. Three readings
        in agreement settle a facet; a reader who finds a fault costs it one, so `2 of 3 agreed`
        and `disputed` are different states and neither is "unverified". The mark carries the
        state for a glance, the number is only printed where there is a number to print, and the
        hover says what the facet means and what the tally is.
      -->
      <span class="facets">
        {#each FACETS.filter((facet) => facet in verified) as facet (facet)}
          {@const settled = verified[facet] === true}
          {@const cast = votes[facet]}
          {@const state = facetState(settled, cast)}
          <span
            class="facet {state}"
            title={`${FACET_NOTES[facet]} - ${facetSummary(settled, cast)}`}
          >
            <span class="facet-mark" aria-hidden="true"
              >{state === 'verified' ? '✓' : state === 'disputed' ? '!' : '·'}</span
            >
            {FACET_LABELS[facet]}
            {#if !settled && net(cast) > 0}
              <span class="facet-vote num">{net(cast)}/{VERIFY_THRESHOLD}</span>
            {:else if cast && cast.reject > 0}
              <span class="facet-vote num">{cast.approve}-{cast.reject}</span>
            {/if}
          </span>
        {/each}
      </span>
    </p>

    {#if findings.length}
      <div class="checks" class:open={unexplained.length}>
        <p class="checks-head">
          Plausibility check{#if unexplained.length} - {unexplained.length} unexplained{/if}
        </p>
        <ul>
          {#each unexplained as f (f.rule + f.fields.join())}
            <li class="flag">{f.message}</li>
          {/each}
          {#each explained as f (f.rule + f.fields.join())}
            <li>{f.message}. <em>{f.why}</em></li>
          {/each}
        </ul>
      </div>
    {/if}
  </section>

  <header class="head">
    <div>
      <p class="eyebrow">
        {FAMILY_LABELS[data.family] ?? data.family}
        {#if entry?.countries.length}
          <span class="origin">·</span>
          <Flag codes={entry.countries} />
        {/if}
      </p>
      <h1>{data.name}</h1>
      {#if data.alternativeNames?.length}
        <p class="alt">Also published as {data.alternativeNames.join(', ')}</p>
      {/if}
    </div>
    <dl class="meta">
      {#if data.pressureMethod}
        <dt>Method</dt>
        <dd>{data.pressureMethod}</dd>
      {/if}
      {#if data.published}
        <dt>Published</dt>
        <dd class="num">{data.published}</dd>
      {/if}
      {#if data.revised}
        <dt>Revised</dt>
        <dd class="num">{data.revised}</dd>
      {/if}
      <dt>Key</dt>
      <dd class="num">{data.key}</dd>
    </dl>
  </header>

  <!--
    What the picture is, where there is more than one picture to be. Each control appears only
    where the dataset has something to switch to, so the bar is empty for a cartridge drawn once
    and the page reads as it always did.

    Above the drawing rather than under it. It used to sit below, where it read as a caption, which
    is fair enough for the length -- 12/70 names what you are looking at -- but wrong for the
    style, which is a question the reader answers before looking rather than after. Paper keeps it
    a caption either way: printed it is a title line saying which of the drawings this sheet is.
  -->
  {#if styles.length > 1 || hulls || shown.length}
    <div class="views">
      {#if styles.length > 1}
        <div class="view">
          <span class="eyebrow view-label">Style</span>
          <div class="options" role="group" aria-label="Drawing style">
            {#each styles as option (option)}
              <button
                type="button"
                class="option"
                class:on={option === style}
                aria-pressed={option === style}
                title={STYLE_NOTES[option]}
                onclick={() => setStyle(option)}
              >
                <span class="option-name">{STYLE_LABELS[option]}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if hulls}
        <div class="view">
          <span class="eyebrow view-label">Length</span>
          <div class="options" role="group" aria-label="Published hull length">
            {#each hulls as row (tag(row))}
              {@const on = tag(row) === selected}
              <button
                type="button"
                class="option"
                class:on
                aria-pressed={on}
                onclick={() => (chosen = { key, length: tag(row)! })}
              >
                <span class="option-name">{row.marking ?? 'Published'}</span>
                <span class="option-sub num">{row.l} mm</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!--
        How large, beside what and which length: the picks all read together above the sheet. The
        size used to be pinned inside the figure, which was fair while there was one figure; there
        are two now, one per subject, and a control that sizes both of them cannot live in half of
        them.
      -->
      {#if shown.length}
        <div class="view">
          <span class="eyebrow view-label">Size</span>
          <div class="zoom" role="group" aria-label="Drawing size">
            <button
              type="button"
              onclick={() => zoomBy(-1)}
              disabled={zoom === ZOOM_STEPS[0]}
              aria-label="Smaller">−</button
            >
            <button type="button" class="reset" onclick={() => setZoom(1)} title="Reset to life size"
              >{zoom === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`}</button
            >
            <button
              type="button"
              onclick={() => zoomBy(1)}
              disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
              aria-label="Larger">+</button
            >
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!--
    The sheet: each drawing beside the numbers it is a drawing of, the way the standard's own pages
    are laid out. Asked for 2026-09-04, for the printed sheet and for the page alike.

    A cartridge is three to five times longer than it is wide and so is its chamber, so a drawing of
    one lying down is a wide, short picture that wastes most of a column and leaves the numbers to
    fill the width underneath. Stood upright it is a tall narrow thing, which is exactly the shape
    of the space beside a table of figures -- and the taller a drawing is allowed to be, the larger
    it is drawn.

    Two rows, one per subject: the cartridge over the chamber, each with its own side of the sheet
    beside it. The pair used to be stacked together in one column, which put the chamber drawing
    beside Cartridge maxi and asked the reader to look in two directions at once.

    `drawn` because six records publish too little to draw at all, and an empty column is not a
    layout: without a drawing the numbers take the whole width.
  -->
  {#snippet panel(plate: Plate | undefined, label: string)}
    <!--
      One drawing, in the row of the thing it draws. Every one is at the same
      millimetres-per-pixel, so the chamber is the size of the chamber beside the round that goes
      into it, and a dimensioned drawing puts its case at the size of the case. What varies between
      the two styles is how much paper the drawing needs around the object, not how big the object
      is; see `unitsPerMm` in the build for the four-to-one the renderer draws the dimensioned ones
      at, and undoing it is what makes the two comparable at all.
    -->
    {#if plate && entry}
      {@const off =
        plate.style !== style ||
        (selected !== null && tag(plate) !== null && tag(plate) !== selected)}
      <figure
        class="drawing"
        onpointerdown={startDrag}
        onpointermove={drag}
        onpointerup={endDrag}
        onpointercancel={endDrag}
        onlostpointercapture={endDrag}
        class:dragging
        role="region"
        aria-label={`${data.name}, ${label}`}
        title="Drag to inspect an oversized drawing"
      >
        <div class="plate" bind:clientWidth={panelWidth}>
          <div
            class="plate-box"
            style={`--mm-w:${plate.svg[0]};--mm-h:${plate.svg[1]};--px:${drawScale}`}
          >
            <!--
              Fetched at once rather than when it scrolls into view. There are two drawings on this
              page and the second is often below the fold, and a lazy image that has not been
              scrolled to is one the browser has every right not to have fetched when somebody hits
              print -- which would print the sheet with the chamber missing. The grid is the place
              for lazy loading, where there are 526 of them.
            -->
            <Drawing
              {entry}
              scale={drawScale}
              height={Math.round(drawScale * 32)}
              drawing={plate}
              eager
            />
          </div>
        </div>
        <!--
          Per drawing, because the two of them can miss in different ways: a chamber drawn only at
          12/70 stands in for 12/89 while the cartridge beside it does not.
        -->
        {#if off}
          <p class="plate-note">{missingNote(plate.subject, style, selected, plate)}</p>
        {/if}
      </figure>
    {:else}
      <div class="undrawn"></div>
    {/if}
  {/snippet}
  <div
    class="sheet"
    class:drawn={!!entry && shown.length > 0}
    style={`--mm-widest:${widest};--mm-tallest:${tallest}`}
  >
    {#if entry && shown.length}
      {@render panel(shown.find((plate) => plate.subject === 'cartridge'), 'cartridge drawing')}
    {/if}
    <GroupTable side="cartridge" heading="Cartridge maxi" groups={data.cartridge} {selected}>
      <!--
        The bullet the drawing puts in the case mouth, among the cartridge's own dimensions, which
        is what it is a property of. It used to sit inside the verification box, where it read as
        evidence for a claim about verification rather than as five more values about the round,
        and then under the whole side, where it hung off the bottom of a column of groups.
      -->
      {#if data.annotations?.defaultBullet}
        <section class="group bullet">
          <h3>Bullet as drawn</h3>
          <dl class="bullet-data">
            {#if data.annotations.defaultBulletShape}
              <dt>Shape</dt>
              <dd>{data.annotations.defaultBulletShape}</dd>
            {/if}
            <dt>Category</dt>
            <dd>{data.annotations.defaultBullet.category}</dd>
            <dt>Ogive</dt>
            <dd>{data.annotations.defaultBullet.ogive}</dd>
            <dt>Base</dt>
            <dd>{data.annotations.defaultBullet.base}</dd>
            <dt>Tip</dt>
            <dd>{data.annotations.defaultBullet.tip}</dd>
          </dl>
        </section>
      {/if}
    </GroupTable>

    {#if entry && shown.length}
      {@render panel(shown.find((plate) => plate.subject === 'chamber'), 'chamber drawing')}
    {/if}
    <GroupTable side="chamber" heading="Chamber mini" groups={data.chamber} {selected} />
  </div>

  <p class="foot">
    <a href={href.list()}>Back to all cartridges</a>
    {#if report}
      · <a href={report} target="_blank" rel="noopener noreferrer">Something look wrong?</a>
    {/if}
    <!--
      The separator is an element with its own spacing rather than a character between two tags:
      inside an `{#each}` the whitespace at the end of a block is trimmed, and the dot ended up
      welded to the link before it.
    -->
    {#each verifiable as { facet, href } (facet)}
      <span class="sep" aria-hidden="true">·</span><a
        {href}
        target="_blank"
        rel="noopener noreferrer">Verify {FACET_LABELS[facet].toLowerCase()}</a
      >
    {/each}
  </p>
{:catch error}
  <p class="status error">{error.message} <a href={href.list()}>Back to all cartridges</a></p>
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
  .eyebrow {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .origin {
    color: var(--ink-3);
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

  /* In the bar with the other picks now, not pinned inside a figure: there are two figures and
     one size. */
  .zoom {
    display: inline-flex;
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--surface);
  }
  .zoom button {
    border: 0;
    background: transparent;
    color: var(--ink-2);
    font-size: var(--step-0);
    padding: 0.25rem 0.6rem;
    cursor: pointer;
    font-family: var(--mono);
  }
  .zoom button + button {
    border-left: 1px solid var(--rule-strong);
  }
  .zoom button:disabled {
    color: var(--ink-3);
    cursor: default;
  }
  .zoom .reset {
    min-width: 3.6rem;
  }
  .drawing {
    position: relative;
    margin: 0.75rem 0 1.25rem;
    padding: 1.5rem 1.25rem;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow: hidden;
    cursor: grab;
    /* `pan-y` and not `none`: a finger dragged sideways pans the drawing, and a finger dragged up
       the screen scrolls the page, which is what a reader on a phone is nearly always doing. */
    touch-action: pan-y;
    user-select: none;
  }
  .drawing.dragging {
    cursor: grabbing;
  }
  /* The window on to one drawing. It fills the width of its column, which is what `fit` measures,
     and the drawing sits centred in it. */
  .plate {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    /* Hidden rather than `auto`: a drawing larger than its column is explored by dragging it, and
       a scrollable box under the pointer swallows the wheel and stops the page moving, which is
       the one thing a reader does over a picture they are not interacting with. Dragging still
       works -- the drag sets `scrollLeft` itself, which `hidden` allows and only the scrollbars
       and the wheel are given up. */
    overflow: hidden;
  }
  .plate-note {
    margin: 0.3rem 0 0;
    font-size: 0.72rem;
    color: var(--warn);
  }
  .drawing :global(img),
  .drawing :global(svg) {
    flex: 0 0 auto;
    user-select: none;
    -webkit-user-drag: none;
  }
  /* Standing the drawing up.
  
     The picture is rendered lying down -- every drawing is, because that is how the object is
     drawn -- and turned a quarter turn here rather than in the renderer, so that one file serves
     the card lying down and the sheet standing up. The box is sized to the turned extents, in
     pixels here and in millimetres on paper (`--px` is the scale the page computed, in pixels per
     millimetre), and the picture is pinned to the middle of it and rotated about its own centre,
     which is the one transform that does not move it off the box. */
  .plate-box {
    position: relative;
    width: calc(var(--mm-h) * var(--px) * 1px);
    height: calc(var(--mm-w) * var(--px) * 1px);
  }
  .plate-box :global(img),
  .plate-box :global(svg) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-90deg);
  }
  .drawing:not(.paired) :global(img),
  .drawing:not(.paired) :global(svg) {
    margin-inline: auto;
  }
  .drawing.paired :global(img),
  .drawing.paired :global(svg) {
    margin-inline: 0;
  }

  /* What the picture is, above the picture it decides. Every choice is a button rather than a
     menu, so the range a gauge covers is readable at a glance -- nine lengths for a 12 gauge --
     instead of being a list to open. */
  .views {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 1.4rem;
    margin: 1.5rem 0 0;
  }
  /* Under the figure, where a caption goes: it is about what was just shown, not a control. */
  .figure-note {
    margin: -0.75rem 0 1.5rem;
    max-width: 62ch;
    font-size: 0.78rem;
    color: var(--ink-2);
  }
  .view {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.6rem;
  }
  .view-label {
    margin: 0;
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .option {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    padding: 0.2rem 0.55rem;
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink-2);
    line-height: 1.2;
  }
  .option:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .option.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  .option-name {
    font-size: var(--step-0);
  }
  .option-sub {
    font-size: 0.68rem;
    color: var(--ink-3);
  }
  .option.on .option-sub {
    color: inherit;
  }
  .view-note {
    flex-basis: 100%;
    margin: 0;
    font-size: 0.72rem;
    color: var(--warn);
  }

  /* The sheet: a drawing beside the numbers it draws, a row per subject.
  
     Narrow, it is one column and the source order carries it -- cartridge drawing, Cartridge maxi,
     chamber drawing, Chamber mini -- so a phone reads each drawing immediately above its own
     figures rather than meeting both pictures and then both tables. Wide, the rows are real: the
     left column takes the narrower share, because an upright cartridge is a tall sliver and a
     table of dimensions is not. */
  .sheet {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
    align-items: start;
  }
  @media (min-width: 58rem) {
    .sheet.drawn {
      grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
      column-gap: 2.5rem;
      row-gap: 3rem;
    }
  }
  .status {
    color: var(--ink-2);
  }
  .error {
    color: var(--ink);
  }
  .sep {
    padding: 0 0.35rem;
    color: var(--ink-3);
  }
  .foot {
    margin-top: 2.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--rule);
    color: var(--ink-2);
    font-size: var(--step-0);
  }
  /* A masthead, not a banner. It is the first thing on the page and the quietest: what it says is
     a caveat about everything below it, and a filled box saying "Unverified" over a page of
     C.I.P. figures read as an error message rather than as a note about who has checked them. */
  .verified {
    margin: 0 0 1.25rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--rule);
    font-size: 0.74rem;
    color: var(--ink-3);
  }
  .verified p {
    margin: 0;
  }
  .verified-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.7rem;
  }
  .verified-count {
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .verified-count.full {
    color: var(--ok);
  }
  .verified-count.partial {
    color: var(--accent);
  }
  .verified-what {
    color: var(--ink-3);
  }

  /* The five, named. Muted by default and picked out only where the answer is yes, so the eye
     lands on what has been done rather than on what has not. */
  .facets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem 0.75rem;
    margin-left: auto;
  }
  .facet {
    display: inline-flex;
    align-items: baseline;
    gap: 0.25rem;
    white-space: nowrap;
  }
  .facet.verified {
    color: var(--ok);
  }
  /* A reading that found a fault is not a facet nobody has read: it is the one state on the strip
     that asks the reader for something, so it is the one that is allowed to be loud. */
  .facet.disputed {
    color: var(--alert);
  }
  /* Part way there. Coloured like a link rather than like a verdict, because it is neither. */
  .facet.reading {
    color: var(--accent);
  }
  .facet-vote {
    font-size: 0.9em;
    opacity: 0.85;
  }
  .facet-mark {
    font-weight: 700;
  }

  .checks {
    margin-top: 0.5rem;
  }
  .checks-head {
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .checks.open .checks-head,
  .checks.open .flag {
    color: var(--warn);
  }
  .checks ul {
    margin: 0.25rem 0 0;
    padding-left: 1.1rem;
    color: var(--ink-2);
  }
  .checks li + li {
    margin-top: 0.25rem;
  }
  .checks em {
    color: var(--ink-3);
  }

  /* The bullet, among the cartridge dimensions it belongs to; see the snippet passed to the
     cartridge's own table. */
  .bullet h3 {
    font-size: var(--step-0);
    margin-bottom: 0.3rem;
  }
  .bullet-data {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr);
    gap: 0.15rem 0.75rem;
    margin: 0;
    font-size: var(--step-0);
  }
  .bullet-data dt {
    color: var(--ink-2);
  }
  .bullet-data dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  /* A phone has no room for a wide frame around the drawing, and every rem of it came off the
     drawing. */
  @media (max-width: 40rem) {
    .drawing {
      padding: 1rem 0.75rem;
    }
    .zoom button {
      padding: 0.25rem 0.5rem;
    }
    .zoom .reset {
      min-width: 3rem;
    }
  }

  @media print {
    @page {
      size: A4 portrait;
      margin: 1.5cm;
    }
    :global(body) {
      background: #ffffff;
      color: #000000;
      font-size: 8pt;
      line-height: 1.25;
    }
    :global(.bar),
    :global(.alert),
    :global(footer),
    .zoom,
    .foot {
      display: none !important;
    }
    /* The sheet: the drawings down the left, the numbers down the right.

       Which is how the standard's own pages read, and it is the arrangement the page itself now
       uses; the screen rules above carry the reasoning. On paper it earns its keep twice over.
       A drawing lying across the sheet could only be as tall as the tables could spare -- about a
       fifth of the page each, and the taller the record's tables the smaller its drawings, which
       is precisely backwards. Standing them in a column of their own takes the tables out of the
       argument: both columns are as tall as the page, and each is sized by what it holds.

       72 mm of the 180 across the sheet, because a cartridge stood on its base is a narrow thing
       and the numbers beside it are not. Each drawing may be half of what is left down the page
       once the masthead and the captions are paid for; whichever of the two binds first is the
       scale, and both panels take it from the wider and the taller of the pair (`--mm-widest`,
       `--mm-tallest`) so that the chamber and the round that goes into it stay comparable. The
       tenth of a millimetre between those two is the whole subject of the sheet, and two scales
       would quietly destroy it.

       Arithmetic in millimetres, not a share of what is left over: laying the page out as a flex
       column and handing the figure the slack is the obvious way to fill a sheet and it does work
       in the browser's own print preview -- and not in the pipeline that renders the PDF, where
       the flex height stays indefinite, every drawing falls back to its natural size and the
       second one prints across the tables. */
    .sheet,
    .sheet.drawn {
      /* 72 mm of the 180 across the sheet for the drawings, because a cartridge stood on its base
         is a narrow thing and the numbers beside it are not. */
      --col: 72mm;
      /* What one drawing may have down the page. Measured rather than reasoned: at 113 mm a 308
         Win laid 273 mm of content into a 267 mm page and printed a second sheet carrying the tail
         of a drawing, and a millimetre here costs about two down the page because the two rows
         share one scale. */
      --row: 100mm;
      --scale: min(calc(var(--col) / var(--mm-tallest)), calc(var(--row) / var(--mm-widest)));
      display: grid;
      grid-template-columns: var(--col) minmax(0, 1fr);
      column-gap: 6mm;
      row-gap: 4mm;
      align-items: start;
      margin-top: 3mm;
    }
    .drawing {
      display: block;
      min-height: 0;
      max-height: none;
      margin: 0;
      padding: 0;
      overflow: visible;
      border: 0;
      background: transparent;
    }
    .plate {
      display: block;
      width: auto;
      margin: 0;
      break-inside: avoid;
      /* On screen a drawing larger than its column is dragged about inside it; on paper there is
         nothing to drag with, and a clipped drawing would just be a drawing with its end cut off. */
      overflow: visible;
    }
    .plate-note,
    .figure-note {
      display: none;
    }
    .plate-box {
      position: relative;
      width: calc(var(--mm-h) * var(--scale));
      height: calc(var(--mm-w) * var(--scale));
    }
    .plate-box :global(img),
    .plate-box :global(svg) {
      position: absolute;
      top: 50%;
      left: 50%;
      width: calc(var(--mm-w) * var(--scale)) !important;
      height: calc(var(--mm-h) * var(--scale)) !important;
      max-width: none;
      transform: translate(-50%, -50%) rotate(-90deg);
    }
    /* Off the sheet. It is a caveat about who has read the page, which belongs beside the page
       while you are reading it and not on the paper you carry to the machine. */
    .verified {
      display: none !important;
    }

    /* The controls are for choosing, and on paper there is nothing to choose: the sheet is of
       the drawing it shows, and each drawing's caption names it and its length. */
    .views {
      display: none !important;
    }

    .head {
      gap: 0.5rem 2rem;
      margin-top: 0;
    }
    h1 {
      font-size: 1.4rem;
    }
    .alt,
    .meta {
      font-size: 0.7rem;
    }
    .meta {
      gap: 0 0.7rem;
    }

    .bullet h3 {
      font-size: 0.7rem;
      margin-bottom: 0.15rem;
    }
    /* The same label column as the dimension rows beside it, which is also what keeps
       `pistol_round_nose` on one line in a 42 mm sub-column. */
    .bullet-data {
      grid-template-columns: 3.1rem minmax(0, 1fr);
      gap: 0.03rem 0.35rem;
      font-size: 0.65rem;
    }
    :global(.side h2) {
      font-size: 0.8rem;
      padding-bottom: 0.2rem;
      margin-bottom: 0.4rem;
    }
    :global(.side .group) {
      margin-bottom: 0.45rem;
    }
    :global(.side h3) {
      font-size: 0.7rem;
      margin-bottom: 0.15rem;
    }
    /* A row is one line where it can be. Each side is two sub-columns of about 42 mm on paper, and
       a label column of 4rem left "39.62 mm" and its "-0.2" nothing to do but wrap; the labels are
       seven characters at most, so the value keeps its tolerance beside it.

       The value track is `minmax(0, 1fr)` rather than `1fr`, whose floor is the widest line it
       holds: a row too long for the sub-column would otherwise push the whole list over the
       column's edge and print across the rows beside it. */
    :global(.side dl) {
      grid-template-columns: 3.1rem minmax(0, 1fr);
      gap: 0.03rem 0.35rem;
    }
    :global(.side dt),
    :global(.side dd),
    :global(.side table) {
      font-size: 0.65rem;
    }
    :global(.side th),
    :global(.side td) {
      padding: 0.1rem 0.25rem 0.1rem 0;
    }
    /* A group stays whole; a side may break, or a long record's tables would jump to a second
       sheet together and leave the first one two-thirds empty. */
    :global(.side .group) {
      break-inside: avoid;
    }
    h1,
    :global(h2),
    :global(h3) {
      break-after: avoid;
    }
  }
</style>
