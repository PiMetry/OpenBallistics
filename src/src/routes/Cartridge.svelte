<script lang="ts">
  import Drawing from '../components/Drawing.svelte';
  import GroupTable from '../components/GroupTable.svelte';
  import { byKey, load } from '../lib/data';
  import { issueUrl } from '../lib/issue';
  import { href } from '../lib/router';
  import { FAMILY_LABELS, type Finding } from '../lib/types';

  interface Props {
    key: string;
  }
  let { key }: Props = $props();

  const entry = $derived(byKey(key));
  const record = $derived(load(key));
  const report = $derived(entry ? issueUrl(entry) : null);

  /**
   * Millimetres per pixel for the drawing at the head of the page.
   *
   * Fitted to the cartridge rather than shared with anything, because there is only one of it: a
   * page showing a single cartridge has nothing to compare it against, so the scale that serves the
   * reader is the one that makes it as large as the column allows. The grid does the opposite for
   * the opposite reason.
   */
  const DRAWING_WIDTH_PX = 620;
  const MAX_SCALE_PX_PER_MM = 9;

  const fitted = $derived.by(() => {
    const shape = entry?.shape;
    if (!shape) return 6;
    const length = Math.max(...shape.map(([, z]) => z), 1);
    return Math.min(MAX_SCALE_PX_PER_MM, DRAWING_WIDTH_PX / length);
  });

  /**
   * A zoom on top of the fitted scale, in steps, from the +/- buttons beside the drawing. Kept
   * per browser so the reader who likes it larger finds it larger next time; the fitted scale is
   * still the one the drawing opens at when nothing is stored.
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
    setZoom(next);
  }
  const scale = $derived(fitted * zoom);
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
    <figure class="drawing">
      <Drawing {entry} {scale} height={Math.round(120 * zoom)} />
      <div class="zoom" role="group" aria-label="Drawing size">
        <button type="button" onclick={() => zoomBy(-1)} disabled={zoom === ZOOM_STEPS[0]} aria-label="Smaller">−</button>
        <button type="button" class="reset" onclick={() => setZoom(1)} title="Reset to fit">{Math.round(zoom * 100)}%</button>
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
  <section class="confidence {state}" aria-label="Confidence">
    <p class="confidence-title">
      {#if state === 'verified'}✓ Verified{:else if state === 'implausible'}⚠ Implausible{:else}Unverified{/if}
    </p>
    {#if data.annotations?.defaultBullet}
      <!-- The second verification: the drawn bullet's nose form, apart from the numbers. -->
      <p class="confidence-bullet {data.annotations.defaultBullet.verified ? 'verified' : 'unverified'}">
        {#if data.annotations.defaultBullet.verified}✓ Bullet type verified{:else}Bullet type unverified{/if}
      </p>
    {/if}
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
    justify-content: center;
    overflow-x: auto;
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
    padding: 0.7rem 1rem;
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    font-size: 0.85rem;
    max-width: 70ch;
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
    background: var(--warn-soft);
    border-color: currentColor;
  }
  .confidence p {
    margin: 0;
  }
  .confidence-title {
    font-weight: 600;
  }
  .confidence-bullet {
    margin-top: 0.25rem !important;
    font-weight: 500;
  }
  .confidence-bullet.verified {
    color: var(--ok);
  }
  .confidence-bullet.unverified {
    color: var(--ink-3);
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
</style>
