<script lang="ts">
  import Silhouette from './Silhouette.svelte';
  import type { Entry } from '../lib/types';

  /**
   * The cartridge as a picture.
   *
   * Where a drawing has been rendered for this cartridge, that is what is shown: the real outline
   * with its corner radii, extractor groove, junction cone fillets and belt, drawn from every
   * figure the sheet publishes rather than from the four points a card could re-derive on its own,
   * and the default projectile standing out of the mouth to the published overall length. Its
   * exposed length and mouth diameter are the sheet's; its nose form is a default chosen per
   * cartridge from the sheet's own drawing.
   * It is loaded lazily, so a grid of 532 fetches only what is scrolled into view.
   *
   * Six records publish too little to draw. Those fall back to `Silhouette`, which builds an
   * outline from the dimensions in the index, a skeleton, and honest about being one.
   *
   * Both are sized from the same millimetres-per-pixel, which is what makes a grid of them
   * comparable. The drawing carries its own extent in millimetres on its root element, so the width
   * is that extent times the scale and the height follows the aspect ratio.
   */
  interface Props {
    entry: Entry;
    scale: number;
    height: number;
  }
  let { entry, scale, height }: Props = $props();

  const url = $derived(`${import.meta.env.BASE_URL}outlines/${entry.family}/${entry.key}.svg`);
</script>

{#if entry.svg}
  <img
    class="drawing"
    src={url}
    alt={`${entry.name}, drawn to scale`}
    loading="lazy"
    decoding="async"
    draggable="false"
    width={entry.svg[0] * scale}
    height={entry.svg[1] * scale}
    style={`width:${(entry.svg[0] * scale).toFixed(1)}px`}
  />
{:else}
  <Silhouette shape={entry.shape} {scale} {height} label={`${entry.name} case outline`} />
{/if}

<style>
  .drawing {
    display: block;
    height: auto;
    max-width: none;
  }
</style>
