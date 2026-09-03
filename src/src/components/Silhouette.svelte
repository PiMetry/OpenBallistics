<script lang="ts">
  /**
   * The case drawn from its own published dimensions, lying down.
   *
   * Every card in a grid is given the **same** millimetres-per-pixel, so the drawings are
   * comparable: a .22 Long Rifle beside a .378 Weatherby reads as the size difference it is, which
   * a thumbnail scaled to fit its own box would hide. The scale comes from the parent, computed
   * from the longest cartridge currently shown, so filtering to pistol cartridges fills the cards
   * instead of leaving them mostly empty.
   *
   * What is drawn is only what the sheet dimensions, see `shape` in `scripts/build-index.mjs`.
   * Corner radii and the extractor groove are published and deliberately left out; interpolating
   * between them is a renderer's job, not a card's.
   *
   * It is coloured like the rendered drawings, brass on the case with the darker brass outline,
   * because it stands in for one. It used to take the site's accent blue, and beside 526 brass
   * drawings the handful of blue ones read as broken rather than as a simpler picture of the same
   * kind (TODO item 23). The colours are the renderer's own, `src/core/materials.py`, not tokens:
   * the drawings do not change with the theme, so neither should their stand-in.
   */
  interface Props {
    shape: [number, number][] | null;
    scale: number;
    height: number;
    label?: string;
  }
  let { shape, scale, height, label = 'Case outline' }: Props = $props();

  const geometry = $derived.by(() => {
    if (!shape || shape.length < 2) return null;
    const maxR = Math.max(...shape.map(([r]) => r));
    const maxZ = Math.max(...shape.map(([, z]) => z));
    const mid = height / 2;
    // z runs left to right; the profile is mirrored about the axis to make the silhouette.
    const top = shape.map(([r, z]) => `${(z * scale).toFixed(2)},${(mid - r * scale).toFixed(2)}`);
    const bottom = [...shape]
      .reverse()
      .map(([r, z]) => `${(z * scale).toFixed(2)},${(mid + r * scale).toFixed(2)}`);
    return {
      path: `M${top.join(' L')} L${bottom.join(' L')} Z`,
      width: maxZ * scale,
      maxR
    };
  });
</script>

{#if geometry}
  <svg
    class="silhouette"
    viewBox={`0 0 ${Math.max(geometry.width, 1).toFixed(2)} ${height}`}
    width={geometry.width.toFixed(2)}
    {height}
    role="img"
    aria-label={label}
    preserveAspectRatio="xMinYMid meet"
  >
    <path d={geometry.path} />
  </svg>
{:else}
  <p class="undrawable">
    This cartridge does not have valid dimensions to draw from.
  </p>
{/if}

<style>
  .silhouette {
    display: block;
    overflow: visible;
  }
  .silhouette path {
    /* Brass (CuZn30) and its outline, as `render_card_svgs.py` draws them. */
    fill: #b5a642;
    stroke: #635b24;
    stroke-width: 1;
    stroke-linejoin: round;
  }
  .undrawable {
    margin: 0;
    font-size: 0.75rem;
    color: var(--ink-3);
    max-width: 30ch;
  }
</style>
