<script lang="ts">
  import { rulerInterval } from '../lib/scale-ruler';

  // The preceding drawing supplies the actual SVG transform, including rotation, zoom and print.
  let { widthMm, unitsPerUnit = 1, unit = 'mm' }: {
    widthMm?: number;
    unitsPerUnit?: number;
    unit?: string;
  } = $props();
  let host: HTMLDivElement;
  let pixelsPerUnit = $state(0);
  let available = $state(120);
  const length = $derived(rulerInterval(pixelsPerUnit, available));
  const format = (value: number) => Number(value.toPrecision(5)).toString();

  $effect(() => {
    const physicalWidth = widthMm;
    const ratio = unitsPerUnit;
    const drawing = host?.previousElementSibling;
    if (!drawing) return;
    let svg: SVGSVGElement | null = null;
    const measure = () => {
      const matrix = svg?.getScreenCTM();
      pixelsPerUnit = matrix && svg
        ? Math.hypot(matrix.a, matrix.b) * (physicalWidth ? svg.viewBox.baseVal.width / physicalWidth : ratio)
        : 0;
      available = Math.max(0, Math.min(120, host.clientWidth - 16));
    };
    const resize = new ResizeObserver(measure);
    resize.observe(host);
    const find = () => {
      const next = drawing instanceof SVGSVGElement ? drawing : drawing.querySelector('svg');
      if (next !== svg) {
        if (svg) resize.unobserve(svg);
        svg = next;
        if (svg) resize.observe(svg);
      }
      measure();
    };
    const changes = new MutationObserver(find);
    changes.observe(drawing, { childList: true, subtree: true, attributes: true });
    find();
    window.addEventListener('beforeprint', measure);
    window.addEventListener('afterprint', measure);
    return () => {
      changes.disconnect();
      resize.disconnect();
      window.removeEventListener('beforeprint', measure);
      window.removeEventListener('afterprint', measure);
    };
  });
</script>

<div bind:this={host} class="scale-ruler" aria-label={length ? `0–${format(length)} ${unit}` : undefined}>
  {#if length > 0}
    <div class="ruler-line" style:width={`${length * pixelsPerUnit}px`} data-length={length} data-unit={unit}>
      {#each [0, 1, 2, 3, 4, 5] as tick}
        <span class="ruler-tick" style:left={`${tick * 20}%`}></span>
      {/each}
      <span class="ruler-zero">0</span>
      <span class="ruler-end">{format(length)} {unit}</span>
    </div>
  {/if}
</div>

<style>
  .scale-ruler { display: block; width: 100%; min-width: 0; height: 38px; flex: none; padding: 8px; color: var(--muted-foreground); }
  .ruler-line { position: relative; height: 8px; margin-inline: auto; border-bottom: 1px solid currentColor; }
  .ruler-tick { position: absolute; bottom: -1px; height: 5px; border-left: 1px solid currentColor; }
  .ruler-tick:first-child, .ruler-tick:nth-child(6) { height: 9px; }
  .ruler-zero, .ruler-end { position: absolute; top: 10px; font: 10px/1 var(--mono); white-space: nowrap; }
  .ruler-zero { left: 0; }
  .ruler-end { right: 0; }
</style>
