<script lang="ts">
  import Silhouette from './Silhouette.svelte';
  import { extent } from '@lib/core';
  import { liveFor } from '../lib/live';
  import { t } from '../lib/i18n.svelte';
  import type {
  Drawing,
  DrawingStyle,
  Entry
} from '@lib/core';

  /**
   * The cartridge as a picture, drawn here from its record.
   *
   * The real outline with its corner radii, extractor groove, junction cone fillets and belt,
   * drawn from every figure the sheet publishes rather than from the four points a card could
   * re-derive on its own, and the default projectile standing out of the mouth to the published
   * overall length. `lib/geometry` builds the profiles from the record. Records are fetched
   * lazily when drawings scroll into view, so the grid loads only visible entries.
   *
   * Records with too few dimensions fall back to `Silhouette`, which builds an
   * outline from the dimensions in the index, a skeleton, and honest about being one.
   *
   * A cartridge is more than one drawing: of itself or of the chamber it is fired in, rendered or
   * dimensioned, and - where it is a shot cartridge, which is a family rather than a cartridge --
   * at each published hull length. Pass `drawing` to show one of them; with none passed this is
   * the cartridge's own drawing, which is what a card in the list shows.
   *
   * The box is sized from the extents the index carries in millimetres times the scale, so a grid
   * of them is comparable and the print sheet can size it in millimetres; the drawing made here
   * has the same extents, being the same drawing.
   */
  interface Props {
    entry: Entry;
    scale: number;
    height: number;
    /** Which of the cartridge's drawings to show; unset, the cartridge's own. */
    drawing?: Drawing | null;
    /** Draw straight away rather than when it scrolls into view: the print sheet's copies. */
    eager?: boolean;
    /** Rendered or outlined, and with the dimensions drawn over it or not. */
    style?: DrawingStyle;
    dimensions?: boolean;
  }
  let {
    entry,
    scale,
    height,
    drawing = null,
    eager = false,
    style = 'visual',
    dimensions = false
  }: Props = $props();

  const size = $derived(
    drawing ? extent(drawing, dimensions) : dimensions ? (entry.sheet ?? entry.svg) : entry.svg
  );

  let box: HTMLElement | undefined = $state();
  let visible = $state(false);
  $effect(() => {
    if (eager || visible || !box || typeof IntersectionObserver === 'undefined') {
      if (!visible && box) visible = true;
      return;
    }
    const watcher = new IntersectionObserver(
      (found) => {
        if (found.some((one) => one.isIntersecting)) {
          visible = true;
          watcher.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    watcher.observe(box);
    return () => watcher.disconnect();
  });

  const live = $derived(visible && size ? liveFor(entry, drawing, style, dimensions, scale) : null);
  const alt = $derived(
    [
      entry.name,
      drawing?.marking ? ` in ${drawing.marking}` : '',
      drawing?.subject === 'chamber' ? ' chamber' : '',
      style === 'technical' ? ', technical drawing' : '',
      ', drawn to scale'
    ].join('')
  );
</script>

{#if size}
  <span
    class="drawing-ink"
    bind:this={box}
    role="img"
    aria-label={alt}
    style={`width:${(size[0] * scale).toFixed(1)}px;height:${(size[1] * scale).toFixed(1)}px;--mm-w:${size[0]};--mm-h:${size[1]}`}
  >
    {#if live}
      {#await live then made}
        {#if made}
          {@html made.markup}
        {/if}
      {:catch}
        <span>{t('draw.unavailable')}</span>
      {/await}
    {/if}
  </span>
{:else}
  <Silhouette shape={entry.shape} {scale} {height} label={`${entry.name} case outline`} />
{/if}

<style>
  @layer legacy {
  .drawing-ink {
    display: block;
    flex: 0 0 auto;
    max-width: none;
  }
  .drawing-ink :global(svg) { display: block; width: 100%; height: 100%; max-width: none; }
  }
</style>
