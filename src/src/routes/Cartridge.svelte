<script lang="ts">
  import Drawing from '../components/Drawing.svelte';
  import GroupTable from '../components/GroupTable.svelte';
  import { byKey, load } from '../lib/data';
  import { issueUrl, verifyUrl } from '../lib/issue';
  import { href } from '../lib/router';
  import { PX_PER_MM } from '../lib/scale';
  import {
    FACETS,
    FACET_LABELS,
    FACET_NOTES,
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
  const verifyCartridge = $derived(entry ? verifyUrl(entry, 'cartridge') : null);
  const verifyBullet = $derived(entry ? verifyUrl(entry, 'bullet') : null);

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
  const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  const ZOOM_KEY = 'drawing-zoom';
  function storedZoom(): number {
    try {
      const raw = localStorage.getItem(ZOOM_KEY);
      const value = raw === null ? 1 : Number(raw);
      return ZOOM_STEPS.includes(value) ? value : 1;
    } catch {
      return 1;
    }
  }
  let zoom = $state(storedZoom());
  let drawing = $state<HTMLElement>(undefined!);
  let dragging = $state(false);
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;
  let pointerId: number | null = null;

  function startDrag(event: PointerEvent) {
    if ((event.target as HTMLElement).closest('button')) return;
    drawing.setPointerCapture(event.pointerId);
    pointerId = event.pointerId;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startScrollLeft = drawing.scrollLeft;
    startScrollTop = drawing.scrollTop;
  }

  function drag(event: PointerEvent) {
    if (!dragging) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (Math.abs(deltaX) <= 3 && Math.abs(deltaY) <= 3) return;
    event.preventDefault();
    drawing.scrollLeft = startScrollLeft - deltaX;
    drawing.scrollTop = startScrollTop - deltaY;
  }

  function endDrag() {
    dragging = false;
    if (pointerId !== null && drawing.hasPointerCapture(pointerId)) {
      drawing.releasePointerCapture(pointerId);
    }
    pointerId = null;
  }

  function setZoom(value: number) {
    zoom = value;
    try {
      localStorage.setItem(ZOOM_KEY, String(value));
    } catch {
      // Storage may be unavailable; the zoom still applies for this page.
    }
  }
  function zoomBy(direction: 1 | -1) {
    const index = ZOOM_STEPS.indexOf(zoom);
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))];
    setZoom(next ?? 1);
  }
  const scale = $derived(PX_PER_MM * zoom);

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
  const SUBJECTS: DrawingSubject[] = ['cartridge', 'chamber'];
  const STYLES: DrawingStyle[] = ['visual', 'technical'];
  const SUBJECT_LABELS: Record<DrawingSubject, string> = {
    cartridge: 'Cartridge',
    chamber: 'Chamber'
  };
  const STYLE_LABELS: Record<DrawingStyle, string> = {
    visual: 'Visual',
    technical: 'Technical'
  };

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
   * Every drawing this cartridge has.
   *
   * The index carries the list only where there is more than one; where there is not, the
   * cartridge's own `<key>.svg` is the list, so that everything below has one thing to reason
   * about instead of two.
   */
  function plates(entry: Entry | undefined): Plate[] {
    if (entry?.drawings?.length) return entry.drawings;
    if (entry?.svg) {
      return [{ file: `${entry.key}.svg`, svg: entry.svg, subject: 'cartridge', style: 'visual' }];
    }
    return [];
  }

  /** The kinds actually drawn, in a fixed order: what the toggles offer, and nothing more. */
  function offered<T extends DrawingSubject | DrawingStyle>(
    all: T[],
    drawn: Plate[],
    axis: 'subject' | 'style'
  ): T[] {
    return all.filter((value) => drawn.some((plate) => plate[axis] === value));
  }

  /**
   * The drawing a card in the list shows for this cartridge.
   *
   * The build flags it rather than the page working it out: `<key>.svg` is not always the drawing
   * that ends up at its own length -- a drawing filed in the directory at the same length takes
   * its place -- and what the page needs to know is the length, not the file.
   */
  function ownPlate(entry: Entry | undefined): Plate | null {
    if (!entry) return null;
    const drawn = plates(entry);
    return drawn.find((plate) => plate.main) ?? null;
  }

  /**
   * The length the page opens at: the one the cartridge's own drawing is at, so that opening a
   * card does not change the picture the reader just clicked. With no drawing to go by, the
   * longest published length, which is the one the list already sorts and filters this cartridge
   * by.
   */
  function defaultLength(rows: Hull[], entry: Entry | undefined): string {
    const own = ownPlate(entry);
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
   * What goes on paper: one drawing per subject the cartridge has, at the style and length that
   * are on screen.
   *
   * The screen shows one drawing because the reader is looking at one thing and can switch. A
   * printed sheet cannot switch, and it has a shape the screen does not: A4 portrait is tall and
   * narrow, a cartridge and the chamber it is fired in are both long and thin, and stood upright
   * side by side the two of them fill a column that either one alone leaves three-quarters empty.
   * So print takes both, and `Cartridge.svelte`'s print rules stand them on end.
   */
  function forPrint(
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
   * Which subject and style the reader last looked at, kept per browser.
   *
   * Unlike the length these are not about one cartridge: a reader comparing chambers, or reading
   * dimensioned drawings, is doing that across the dataset and should not have to say so on every
   * page. Where a cartridge has not been drawn that way the page falls back to what it has, and
   * the stored preference is left alone for the next cartridge that can honour it.
   */
  const VIEW_KEY = 'drawing-view';
  function storedView(): { subject: DrawingSubject; style: DrawingStyle } {
    const fallback = { subject: 'cartridge' as DrawingSubject, style: 'visual' as DrawingStyle };
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null');
      if (!raw || typeof raw !== 'object') return fallback;
      const held = raw as { subject?: unknown; style?: unknown };
      return {
        subject: SUBJECTS.includes(held.subject as DrawingSubject)
          ? (held.subject as DrawingSubject)
          : fallback.subject,
        style: STYLES.includes(held.style as DrawingStyle)
          ? (held.style as DrawingStyle)
          : fallback.style
      };
    } catch {
      return fallback;
    }
  }
  let view = $state(storedView());
  function setView(next: Partial<{ subject: DrawingSubject; style: DrawingStyle }>) {
    view = { ...view, ...next };
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      // Storage may be unavailable; the choice still applies for this visit.
    }
  }
</script>

{#await record}
  <p class="status">Loading {entry?.name ?? key}…</p>
{:then data}
  {@const drawn = plates(entry)}
  {@const subjects = offered(SUBJECTS, drawn, 'subject')}
  {@const styles = offered(STYLES, drawn, 'style')}
  {@const subject = subjects.includes(view.subject) ? view.subject : (subjects[0] ?? 'cartridge')}
  {@const style = styles.includes(view.style) ? view.style : (styles[0] ?? 'visual')}
  {@const hulls = hullLengths(data)}
  {@const selected = hulls
    ? (chosen?.key === key ? chosen.length : defaultLength(hulls, entry))
    : null}
  {@const want = hulls?.find((row) => tag(row) === selected)?.l ?? null}
  {@const shown = resolve(drawn, subject, style, selected, want)}
  {@const missed =
    shown !== null &&
    (shown.subject !== subject ||
      shown.style !== style ||
      (selected !== null && tag(shown) !== null && tag(shown) !== selected))}
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
      <span class="facets">
        {#each FACETS.filter((facet) => facet in verified) as facet (facet)}
          <span class="facet" class:yes={verified[facet]} title={FACET_NOTES[facet]}>
            <span class="facet-mark" aria-hidden="true">{verified[facet] ? '✓' : '·'}</span>
            {FACET_LABELS[facet]}
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
        {#if data.country}· {data.country}{/if}
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

  {#if entry}
    <figure
      class="drawing"
      bind:this={drawing}
      onpointerdown={startDrag}
      onpointermove={drag}
      onpointerup={endDrag}
      onpointercancel={endDrag}
      onlostpointercapture={endDrag}
      class:dragging
      role="region"
      aria-label={`${data.name} drawing`}
      title="Drag to inspect an oversized drawing"
    >
      <Drawing {entry} {scale} height={Math.round(120 * zoom)} drawing={shown} />
      <div class="zoom" role="group" aria-label="Drawing size">
        <button type="button" onclick={() => zoomBy(-1)} disabled={zoom === ZOOM_STEPS[0]} aria-label="Smaller">−</button>
        <button type="button" class="reset" onclick={() => setZoom(1)} title="Reset to life size">{Math.round(zoom * 100)}%</button>
        <button type="button" onclick={() => zoomBy(1)} disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]} aria-label="Larger">+</button>
      </div>
    </figure>

    <!--
      The same drawings again, for paper only: every subject this cartridge has, upright and side
      by side. See `forPrint`. Hidden on screen, and fetched eagerly because a hidden lazy image
      is one the browser is entitled not to have when somebody hits print.
    -->
    {@const printed = forPrint(drawn, style, selected, want)}
    {#if printed.length}
      <div class="plates" aria-hidden="true">
        {#each printed as plate (plate.file)}
          <figure class="plate">
            <div class="plate-box" style={`--mm-w:${plate.svg[0]};--mm-h:${plate.svg[1]}`}>
              <Drawing {entry} scale={PX_PER_MM} height={120} drawing={plate} eager />
            </div>
            <figcaption>
              {SUBJECT_LABELS[plate.subject]}{#if tag(plate)} · {tag(plate)}{/if}
            </figcaption>
          </figure>
        {/each}
      </div>
    {/if}
  {/if}

  <!--
    What the picture is, where there is more than one picture to be. Each control appears only
    where the dataset has something to switch to, so the bar is empty for a cartridge drawn once
    and the page reads as it always did.
  -->
  {#if subjects.length > 1 || styles.length > 1 || hulls}
    <div class="views">
      {#if subjects.length > 1}
        <div class="view subject">
          <span class="eyebrow view-label">Show</span>
          <div class="options" role="group" aria-label="Drawing subject">
            {#each subjects as option (option)}
              <button
                type="button"
                class="option"
                class:on={option === subject}
                aria-pressed={option === subject}
                onclick={() => setView({ subject: option })}
              >
                <span class="option-name">{SUBJECT_LABELS[option]}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

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
                onclick={() => setView({ style: option })}
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
        Said out loud where the picture and the pick have come apart, rather than letting a drawing
        of one kind or one length stand in for another in silence. It disappears as the missing
        drawings arrive.
      -->
      {#if missed && shown}
        <p class="view-note">{missingNote(subject, style, selected, shown)}</p>
      {/if}
    </div>
  {/if}

  <div class="tables">
    <div class="column">
      <GroupTable side="cartridge" heading="Cartridge maxi" groups={data.cartridge} {selected} />
      <!--
        The bullet the drawing puts in the case mouth, under the cartridge's own dimensions, which
        is what it is a property of. It used to sit inside the verification box, where it read as
        evidence for a claim about verification rather than as five more values about the round.
      -->
      {#if data.annotations?.defaultBullet}
        <section class="bullet">
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
    </div>
    <GroupTable side="chamber" heading="Chamber mini" groups={data.chamber} {selected} />
  </div>

  <p class="foot">
    <a href={href.list()}>Back to all cartridges</a>
    {#if report}
      · <a href={report} target="_blank" rel="noopener noreferrer">Something look wrong?</a>
    {/if}
    {#if verifyCartridge}
      · <a href={verifyCartridge} target="_blank" rel="noopener noreferrer">Verify cartridge</a>
    {/if}
    {#if verifyBullet && entry?.svg}
      · <a href={verifyBullet} target="_blank" rel="noopener noreferrer">Verify bullet</a>
    {/if}
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

  .zoom {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
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
    margin: 1.5rem 0 1.25rem;
    padding: 1.5rem 1.25rem;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    display: flex;
    align-items: center;
    justify-content: flex-start;
    overflow-x: auto;
    overflow-y: auto;
    cursor: grab;
    scrollbar-width: thin;
    overscroll-behavior: contain;
    touch-action: none;
    user-select: none;
  }
  .drawing.dragging {
    cursor: grabbing;
  }
  .drawing :global(img),
  .drawing :global(svg) {
    flex: 0 0 auto;
    margin-inline: auto;
    user-select: none;
    -webkit-user-drag: none;
  }

  /* What the picture is, under the drawing it changes and above the tables it marks. Every choice
     is a button rather than a menu, so the range a gauge covers is readable at a glance -- nine
     lengths for a 12 gauge -- instead of being a list to open. */
  .views {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 1.4rem;
    margin: -0.5rem 0 1.75rem;
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

  .tables {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr));
    gap: 2.5rem;
  }
  .status {
    color: var(--ink-2);
  }
  .error {
    color: var(--ink);
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
  .facet.yes {
    color: var(--ok);
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

  /* The bullet, with the cartridge dimensions it belongs to. */
  .column {
    min-width: 0;
  }
  .bullet {
    margin-top: 1.1rem;
  }
  .bullet h3 {
    font-size: var(--step-0);
    margin-bottom: 0.3rem;
  }
  .bullet-data {
    display: grid;
    grid-template-columns: 5.5rem 1fr;
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

  /* Paper only; see the print rules and `forPrint`. */
  .plates {
    display: none;
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
    :global(main) {
      max-width: none;
      padding: 0;
    }

    /* The drawings stand up, and there are as many of them as the cartridge has subjects.

       On screen a drawing lies down: the page is a wide column and a cartridge is three to five
       times longer than it is wide, so lying down is what fits. Paper is the other way round. A4
       portrait gives 180 mm across and 267 mm down at these margins, and a cartridge printed
       lengthways uses a sixth of that -- one thin band across a tall empty sheet. Stood on end,
       and stood beside the chamber it is fired in, the two of them use the height the sheet
       actually has, and the pair can be read against each other the way the two tables below them
       are.

       Sizes are in `mm`, which on paper is a millimetre rather than the CSS convention a screen
       settles for, so the printed sheet holds up against a ruler. The box is the drawing's extent
       with its sides swapped, since the drawing is turned a quarter turn inside it; both are
       capped at `--upright-cap` and scale together, so a drawing longer than the sheet shrinks in
       proportion instead of running off it. */
    .drawing,
    .view.subject {
      display: none !important;
    }
    .plates {
      --upright-cap: 120mm;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 12mm;
      margin: 0.5rem 0 0.75rem;
    }
    .plate {
      margin: 0;
      text-align: center;
      break-inside: avoid;
    }
    .plate-box {
      /* The length as printed, and the width in proportion to it. */
      --up: min(calc(var(--mm-w) * 1mm), var(--upright-cap));
      --across: calc(var(--mm-h) / var(--mm-w) * var(--up));
      position: relative;
      width: var(--across);
      height: var(--up);
    }
    /* Turned head-down, so the bullet points up the page the way a cartridge stands. The image's
       own width runs up the sheet once it is turned, which is why the two are swapped here. */
    .plate-box :global(img),
    .plate-box :global(svg) {
      position: absolute;
      top: 50%;
      left: 50%;
      width: var(--up) !important;
      height: var(--across) !important;
      max-width: none;
      transform: translate(-50%, -50%) rotate(-90deg);
    }
    .plate figcaption {
      margin-top: 1.5mm;
      font-size: 0.65rem;
      color: #000000;
    }

    /* Off the sheet. It is a caveat about who has read the page, which belongs beside the page
       while you are reading it and not on the paper you carry to the machine. */
    .verified {
      display: none !important;
    }

    /* The remaining picks read as a caption -- the style and the length this sheet is of. */
    .views {
      margin: 0 0 0.5rem;
      justify-content: center;
      gap: 0.2rem 0.9rem;
      font-size: 0.7rem;
    }
    .option:not(.on),
    .view-note {
      display: none;
    }
    /* The chosen option is a word in a caption here, not a pressed button: `.option.on` is what
       paints it on screen, so the print rule has to be at least as specific to undo it. */
    .option,
    .option.on {
      flex-direction: row;
      gap: 0.35rem;
      border: 0;
      padding: 0;
      background: transparent;
      color: #000000;
      font-weight: 700;
    }
    .option-sub {
      color: inherit;
      font-size: inherit;
      font-weight: 400;
    }

    .tables {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
    }
    .bullet {
      margin-top: 0.5rem;
      break-inside: avoid;
    }
    .bullet h3 {
      font-size: 0.7rem;
      margin-bottom: 0.15rem;
    }
    .bullet-data {
      grid-template-columns: 4rem 1fr;
      gap: 0.03rem 0.4rem;
      font-size: 0.65rem;
    }
    :global(.tables h2) {
      font-size: 0.8rem;
      padding-bottom: 0.2rem;
      margin-bottom: 0.4rem;
    }
    :global(.tables .group + .group) {
      margin-top: 0.45rem;
    }
    :global(.tables h3) {
      font-size: 0.7rem;
      margin-bottom: 0.15rem;
    }
    :global(.tables dl) {
      grid-template-columns: 4rem 1fr;
      gap: 0.03rem 0.4rem;
    }
    :global(.tables dt),
    :global(.tables table) {
      font-size: 0.65rem;
    }
    :global(.tables th),
    :global(.tables td) {
      padding: 0.1rem 0.25rem 0.1rem 0;
    }
    :global(.tables .side),
    :global(.tables .group) {
      break-inside: avoid;
    }
    h1,
    :global(h2),
    :global(h3) {
      break-after: avoid;
    }
  }
</style>
