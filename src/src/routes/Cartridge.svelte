<script lang="ts">
  import Drawing from '../components/Drawing.svelte';
  import GroupTable from '../components/GroupTable.svelte';
  import { byKey, load } from '../lib/data';
  import { issueUrl, verifyUrl } from '../lib/issue';
  import { href } from '../lib/router';
  import { PX_PER_MM } from '../lib/scale';
  import { FAMILY_LABELS, type Finding } from '../lib/types';

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
</script>

{#await record}
  <p class="status">Loading {entry?.name ?? key}…</p>
{:then data}
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
      <Drawing {entry} {scale} height={Math.round(120 * zoom)} />
      <div class="zoom" role="group" aria-label="Drawing size">
        <button type="button" onclick={() => zoomBy(-1)} disabled={zoom === ZOOM_STEPS[0]} aria-label="Smaller">−</button>
        <button type="button" class="reset" onclick={() => setZoom(1)} title="Reset to life size">{Math.round(zoom * 100)}%</button>
        <button type="button" onclick={() => zoomBy(1)} disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]} aria-label="Larger">+</button>
      </div>
    </figure>
  {/if}

  <!--
    How far this record can be trusted, before the numbers: one word from the dataset's own
    annotations -- verified, unverified or implausible -- and under it, where any plausibility
    rule fired, the plausibility check: every finding, the unexplained ones first and the known
    exceptions with their reason, each naming both sides of the value it compares so that two
    columns called L3 are never mistaken for one. One box, no description under the word: the
    word is the message (asked for 2026-09-03).
  -->
  {@const findings = (data.annotations?.implausible ?? []) as Finding[]}
  {@const unexplained = findings.filter((f) => !f.known)}
  {@const explained = findings.filter((f) => f.known)}
  {@const state = data.annotations?.confidence ?? 'unverified'}
  {@const checkCount = findings.length}
  {@const displayState = checkCount ? 'implausible' : state}
  <section class="confidence {displayState}" aria-label="Verification status">
    <div class="confidence-pills">
      <div class="confidence-pill {checkCount ? 'implausible' : state}">
        <p>
          {#if checkCount}⚠ Cartridge check ({checkCount}){:else if state === 'verified'}✓ Cartridge verified{:else}Cartridge unverified{/if}
        </p>
        {#if findings.length}
          <p class="confidence-sub">Plausibility check</p>
          <ul>
            {#each unexplained as f (f.rule + f.fields.join())}
              <li class="flag">{f.message}</li>
            {/each}
            {#each explained as f (f.rule + f.fields.join())}
              <li>{f.message}. <em>{f.why}</em></li>
            {/each}
          </ul>
        {/if}
      </div>
      {#if data.annotations?.defaultBullet}
        <div class="confidence-pill {data.annotations.defaultBullet.verified ? 'verified' : 'unverified'}">
          <p>
            {#if data.annotations.defaultBullet.verified}✓ Bullet verified{:else}Bullet unverified{/if}
          </p>
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
        </div>
      {/if}
    </div>
  </section>

  <div class="tables">
    <GroupTable side="cartridge" heading="Cartridge maxi" groups={data.cartridge} />
    <GroupTable side="chamber" heading="Chamber mini" groups={data.chamber} />
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
  .confidence {
    margin: 0 0 2rem;
    font-size: 0.85rem;
    width: 100%;
  }
  .confidence.verified {
    color: var(--ok);
    border-color: currentColor;
  }
  .confidence.unverified {
    color: var(--ink-2);
  }
  .confidence.implausible {
    color: var(--warn);
  }
  .confidence p {
    margin: 0;
  }
  .confidence-pills {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.4rem;
  }
  .confidence-pill {
    width: 100%;
    padding: 0.7rem 1rem;
    border: 1px solid currentColor;
    border-radius: var(--radius);
    font-weight: 600;
  }
  .confidence-pill.verified {
    color: var(--ok);
    background: var(--ok-soft);
  }
  .confidence-pill.unverified {
    color: var(--ink-3);
    border-color: var(--rule-strong);
    background: var(--surface-2);
  }
  .confidence-pill.implausible {
    color: var(--warn);
    background: var(--warn-soft);
    border-color: currentColor;
  }
  .bullet-data {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.1rem 0.75rem;
    margin: 0.65rem 0 0;
    padding-top: 0.65rem;
    border-top: 1px solid currentColor;
    font-size: 0.78rem;
    font-weight: 400;
  }
  .bullet-data dt {
    color: var(--ink-3);
  }
  .bullet-data dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  @media (max-width: 38rem) {
    .confidence-pills {
      grid-template-columns: 1fr;
    }
  }
  .confidence-sub {
    margin-top: 0.6rem !important;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .confidence ul {
    margin: 0.35rem 0 0;
    padding-left: 1.2rem;
    color: var(--ink-2);
  }
  .confidence li + li {
    margin-top: 0.3rem;
  }
  .confidence .flag {
    color: inherit;
  }
  .confidence em {
    color: var(--ink-3);
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
    .drawing {
      display: block;
      min-height: 0;
      max-height: 42mm;
      margin: 0.5rem 0;
      padding: 0;
      overflow: visible;
      border: 0;
      background: transparent;
    }
    .drawing :global(img),
    .drawing :global(svg) {
      display: block;
      width: 100% !important;
      height: auto !important;
      max-width: 100%;
      margin: 0;
    }
    .confidence {
      display: none !important;
    }
    .tables {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
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
