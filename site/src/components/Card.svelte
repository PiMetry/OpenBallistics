<script lang="ts">
  import CipBadge from './CipBadge.svelte';
  import ScaleRuler from './ScaleRuler.svelte';
  import * as UiCard from "$lib/components/ui/card/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import Drawing from './Drawing.svelte';
  import Flag from './Flag.svelte';
  import { card, extent } from '@lib/core';
  import { t } from '../lib/i18n.svelte';
  import { href } from '../lib/router';
  import { type DrawingStyle, type Entry } from '@lib/core';
import { familyLabel } from '../lib/labels';

  interface Props {
    entry: Entry;
    scale: number;
    /** Drawing canvas height in pixels; grows with the grid's zoom so a larger drawing has room. */
    height?: number;
    /**
     * Which way the grid is drawing its cartridges: as objects, or as outlines. One
     * setting for the whole grid rather than one per card, because the grid is a comparison and a
     * page of cards drawn two different ways is not one.
     */
    style?: DrawingStyle;
  }
  let { entry, scale, height = 78, style = 'visual' }: Props = $props();

  /**
   * Which drawing this card shows: the cartridge's own, never its chamber - a card is a picture of
   * the round. The style is a face of that one file (see `Drawing`), so the grid's setting is passed
   * down rather than choosing a different drawing.
   */
  const plate = $derived(card(entry));

  let drawing: HTMLAnchorElement;
  let dragging = $state(false);
  let dragged = $state(false);
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;
  let pointerId: number | null = null;

  function startDrag(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) return;
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
    if (dragged && event.detail !== 0) {
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
  The preview is a focusable link so arrow keys can pan an oversized drawing.
  The title link covers the rest of the card without nesting interactive elements.
-->
<article class="card">
<UiCard.Root class="h-full gap-0 py-0">
  <a
    class="drawing shrink-0 bg-muted/30 px-4 py-4"
    style:height={`${Math.min(height + 32, 224)}px`}
    href={href.cartridge(entry.key)}
    onclick={openCard}
    draggable="false"
    bind:this={drawing}
    onpointerdown={startDrag}
    onpointermove={drag}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    onlostpointercapture={endDrag}
    class:dragging
    aria-label={t('list.preview', { name: entry.name })}
    title={t('list.panHint')}
  >
    <!--
      Never with the dimensions. At card size C.I.P.'s symbols are a millimetre high and read as
      noise over the outline, which is the one thing a reader scanning a grid is looking at; the page
      shows the same file with the layer on. Asked for 2026-09-05.
    -->
    <Drawing {entry} {scale} {height} drawing={plate} {style} dimensions={false} />
  </a>
  <ScaleRuler widthMm={plate ? extent(plate, false)[0] : undefined} unitsPerUnit={scale} />

  <UiCard.Content class="flex flex-1 flex-col gap-3 p-4">
  <a class="titles" href={href.cartridge(entry.key)}>
    <span class="name">{entry.name}</span>
    {#if entry.alt.length}
      <span class="alt">{entry.alt.join(' · ')}</span>
    {/if}
  </a>

  <span class="chips">
    <CipBadge />
    <Badge variant="secondary" class="text-xs font-normal">{familyLabel(entry.family)}</Badge>
    {#if entry.countries.length}<Flag codes={entry.countries} />{/if}
  </span>
</UiCard.Content>
</UiCard.Root>
</article>

<style>
  @layer legacy {
  .card { position: relative; min-width: 0; }
  .card:focus-within { outline: 2px solid var(--ring); outline-offset: 3px; border-radius: var(--panel-radius); }
  .titles { color: inherit; text-decoration: none; }
  .titles::after { content: ''; position: absolute; inset: 0; border-radius: inherit; }
  .titles:focus-visible { outline: none; }

  /* The drawing keeps the shared comparison scale. At high zoom it becomes a small viewport that
     can be inspected by dragging instead of shrinking or making every grid row enormous. */
  .drawing {
    position: relative;
    z-index: 1;
    color: inherit;
    text-decoration: none;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    min-height: 78px;
    max-height: 14rem;
    overflow: auto;
    cursor: grab;
    scrollbar-width: thin;
    touch-action: pan-y pinch-zoom;
    overscroll-behavior-x: contain;
    user-select: none;
  }
  .drawing:focus-visible { outline-offset: -2px; }
  .drawing.dragging {
    cursor: grabbing;
  }
  .drawing :global(img),
  .drawing :global(svg) {
    flex: 0 0 auto;
    user-select: none;
    -webkit-user-drag: none;
  }

  .titles {
    display: block;
    margin-top: 0;
    min-width: 0;
  }
  .name {
    overflow-wrap: anywhere;
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
    margin-top: auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
  }

  }
</style>
