<script lang="ts">
  import Silhouette from './Silhouette.svelte';
  import { extent, face } from '../lib/drawings';
  import { isDark } from '../lib/theme.svelte';
  import type { Drawing, DrawingStyle, Entry } from '../lib/types';

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
   * A cartridge is more than one drawing: of itself or of the chamber it is fired in, rendered or
   * dimensioned, and -- where it is a shot cartridge, which is a family rather than a cartridge --
   * at each published hull length. Pass `drawing` to show one of them; with none passed this is
   * the cartridge's own drawing, which is what a card in the list shows.
   *
   * The drawing also carries its own extent in millimetres, as `--mm-w` and `--mm-h`, which is
   * what the cartridge page's print rules size it by. On screen a millimetre is a convention;
   * on paper it is a millimetre, so the printed sheet is the one place the drawing is life size
   * for certain -- and it is sized there in `mm` rather than stretched to the column width.
   *
   * Both are sized from the same millimetres-per-pixel, which is what makes a grid of them
   * comparable. The drawing carries its own extent in millimetres on its root element, so the width
   * is that extent times the scale and the height follows the aspect ratio.
   */
  interface Props {
    entry: Entry;
    scale: number;
    height: number;
    /**
     * Which of the cartridge's drawings to show -- the one the cartridge page's toggles resolved
     * to. Left unset everywhere else, and then this is the cartridge's own drawing.
     */
    drawing?: Drawing | null;
    /**
     * Fetch the drawing straight away rather than when it scrolls into view. For the copies the
     * print sheet uses: they are hidden on screen, and a lazy image that is hidden is an image the
     * browser has every right not to have fetched by the time somebody prints.
     */
    eager?: boolean;
    /**
     * Which face of the file: rendered or outlined, and with the dimensions drawn over it or not.
     * One file carries all four (see `Drawing`); the fragment picks, and the extent the picture is
     * laid out at follows the face -- the whole page with dimensions, the object alone without.
     */
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
  /** The same face for paper, which is never dark. */
  const printUrl = $derived(
    `${import.meta.env.BASE_URL}outlines/${entry.family}/${drawing ? drawing.file : `${entry.key}.svg`}${face(style, dimensions)}`
  );
  const url = $derived(
    `${import.meta.env.BASE_URL}outlines/${entry.family}/${drawing ? drawing.file : `${entry.key}.svg`}${face(style, dimensions, isDark())}`
  );
  /** Named for what it shows, so a screen reader is told which of several drawings this is. */
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
  {@const box = `width:${(size[0] * scale).toFixed(1)}px;--mm-w:${size[0]};--mm-h:${size[1]}`}
  <img
    class="drawing"
    class:technical={style === 'technical'}
    class:screen-only={url !== printUrl}
    src={url}
    {alt}
    loading={eager ? 'eager' : 'lazy'}
    decoding="async"
    draggable="false"
    width={size[0] * scale}
    height={size[1] * scale}
    style={box}
  />
  {#if url !== printUrl}
    <!--
      Paper is white whatever the theme, so the dark face would print pale. A stylesheet cannot
      change an image's source, and swapping it on `beforeprint` is a race against the print
      preview; a second image, hidden until print, is not.
    -->
    <img class="drawing print-only" src={printUrl} {alt} loading="lazy" decoding="async"
      draggable="false" width={size[0] * scale} height={size[1] * scale} style={box} />
  {/if}
{:else}
  <Silhouette shape={entry.shape} {scale} {height} label={`${entry.name} case outline`} />
{/if}

<style>
  .drawing {
    display: block;
    height: auto;
    max-width: none;
  }
  /* Line art, made to sit on whatever this theme's background is; see `--line-art` in app.css.
     The rendered drawings are left alone: brass reads on either ground, and the renderer's own
     colours are the point of them. */
  .drawing.technical {
    filter: var(--line-art);
  }
  .print-only {
    display: none !important;
  }
  @media print {
    .print-only {
      display: block !important;
    }
    .screen-only {
      display: none !important;
    }
  }
</style>
