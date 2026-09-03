<script lang="ts">
  import Drawing from './Drawing.svelte';
  import { href } from '../lib/router';
  import { CONFIDENCE_LABELS, FAMILY_LABELS, type Entry } from '../lib/types';

  interface Props {
    entry: Entry;
    scale: number;
  }
  let { entry, scale }: Props = $props();
</script>

<!--
  The whole card is the link, not just the name.
  A card that looks like one object and responds in only one small corner of itself is a card that
  gets clicked twice. As a single anchor it is also one tab stop with one accessible name, which is
  what a keyboard reader wants from a grid of 532.
-->
<a class="card" href={href.cartridge(entry.key)}>
  <span class="drawing">
    <Drawing {entry} {scale} height={78} />
  </span>

  <span class="titles">
    <span class="name">{entry.name}</span>
    {#if entry.alt.length}
      <span class="alt">{entry.alt.join(' · ')}</span>
    {/if}
  </span>

  <span class="chips">
    <span class="chip">{FAMILY_LABELS[entry.family] ?? entry.family}</span>
    {#if entry.country}<span class="chip quiet num">{entry.country}</span>{/if}
    <!--
      How far the numbers can be trusted, said on every card so that the grid never reads as
      uniformly authoritative: a verified record earns a tick, an unverified one says so quietly,
      and a record with a plausibility finding nothing explains carries a small warning with the
      count. The cartridge page lists what the finding is.
    -->
    <span
      class="chip confidence {entry.confidence}"
      title={entry.confidence === 'implausible'
        ? `${entry.warnings} value${entry.warnings === 1 ? '' : 's'} look wrong; see the cartridge page`
        : entry.confidence === 'verified'
          ? 'Confirmed by a person'
          : 'Not yet confirmed by a person'}
    >
      {#if entry.confidence === 'implausible'}⚠ {CONFIDENCE_LABELS.implausible} ({entry.warnings})
      {:else if entry.confidence === 'verified'}✓ {CONFIDENCE_LABELS.verified}
      {:else}{CONFIDENCE_LABELS.unverified}{/if}
    </span>
    <!-- The second verification, for the drawn bullet's nose form rather than the numbers. -->
    {#if entry.svg}
      <span
        class="chip confidence {entry.bulletVerified ? 'verified' : 'unverified'}"
        title={entry.bulletVerified
          ? 'The bullet type has been confirmed against the drawing by a person'
          : 'The bullet type is a default, not yet confirmed by a person'}
      >
        {#if entry.bulletVerified}✓ Bullet{:else}Bullet unverified{/if}
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

  /* The drawing is at a shared scale, so it is allowed to be wider than the card and clip rather
     than shrink -- a card that rescaled its own drawing would break the comparison between them. */
  .drawing {
    display: flex;
    align-items: center;
    min-height: 78px;
    overflow: hidden;
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
  .confidence.verified {
    color: var(--ok, #2f7a3f);
    border-color: currentColor;
    background: transparent;
  }
  .confidence.unverified {
    color: var(--ink-3);
    background: transparent;
    border-color: var(--rule);
  }
  .confidence.implausible {
    color: var(--warn, #8a5a00);
    background: var(--warn-soft, #fff3d6);
    border-color: currentColor;
  }
</style>
