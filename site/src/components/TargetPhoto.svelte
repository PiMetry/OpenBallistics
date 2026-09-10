<script lang="ts">
  import ScaleRuler from './ScaleRuler.svelte';
  import { Label } from '$lib/components/ui/label/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { NativeSelect } from '$lib/components/ui/native-select/index.js';
  import { Button as ShadcnButton } from '$lib/components/ui/button/index.js';

  import { onDestroy, untrack } from 'svelte';
  import { t } from '../lib/i18n.svelte';
  import { outerDiameterMm, type Shot, type TargetFace } from '@lib/targets';
  import { calibrate, pixelToShot, suggestHoles, type PixelPoint } from '../lib/target-image';
  let { face, diameterMm, onshots }: { face: TargetFace; diameterMm?: number; onshots: (shots: Shot[]) => void } = $props();
  let source = $state(''), error = $state(''), loading = $state(false);
  let width = $state(0), height = $state(0);
  let pixels: Uint8ClampedArray | undefined;
  let centreX = $state<number>(), centreY = $state<number>(), edgeX = $state<number>(), edgeY = $state<number>();
  let ringScore = $state(10);
  const ring = $derived(face.rings.find(r => r.score === ringScore) ?? face.rings[0]!);
  let step = $state<'centre' | 'edge' | 'add'>('centre');
  let confirmed = $state<(PixelPoint & { id: number })[]>([]);
  let suggested = $state<(PixelPoint & { id: number })[]>([]);
  let detected = $state(false), nextId = 0, generation = 0;
  let objectUrl: string | undefined;
  const calibration = $derived(centreX !== undefined && centreY !== undefined && edgeX !== undefined && edgeY !== undefined
    && centreX >= 0 && centreX <= width && centreY >= 0 && centreY <= height && edgeX >= 0 && edgeX <= width && edgeY >= 0 && edgeY <= height
    ? calibrate({ x: centreX, y: centreY }, { x: edgeX, y: edgeY }, ring.diameterMm) : undefined);
  $effect(() => {
    const shots = calibration ? confirmed.map(p => pixelToShot(p, calibration)) : [];
    untrack(() => onshots(shots));
  });
  $effect(() => { diameterMm; calibration; suggested = []; detected = false; });
  $effect(() => { if (calibration) step = 'add'; });
  onDestroy(() => { generation++; if (objectUrl) URL.revokeObjectURL(objectUrl); });
  async function upload(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const version = ++generation;
    source = ''; pixels = undefined; error = ''; confirmed = []; suggested = []; detected = false;
    centreX = centreY = edgeX = edgeY = undefined; step = 'centre'; loading = true;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const url = URL.createObjectURL(file); objectUrl = url;
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('type');
      const image = new Image(); image.src = url; await image.decode();
      if (version !== generation) return;
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('canvas');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      width = canvas.width; height = canvas.height; source = canvas.toDataURL('image/png');
    } catch { if (version === generation) error = t('photo.error'); }
    finally { URL.revokeObjectURL(url); if (version === generation) { objectUrl = undefined; loading = false; } }
  }
  function point(event: MouseEvent) {
    // Keyboard users have explicit numeric calibration and an Add marker button below.
    if (event.detail === 0) return;
    const rect = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : undefined;
    if (!rect) return;
    const x = Math.max(0, Math.min(width, (event.clientX - rect.left) * width / rect.width));
    const y = Math.max(0, Math.min(height, (event.clientY - rect.top) * height / rect.height));
    if (step === 'centre') { centreX = x; centreY = y; step = 'edge'; }
    else if (step === 'edge') { edgeX = x; edgeY = y; if (calibrate({ x: centreX ?? NaN, y: centreY ?? NaN }, { x, y }, ring.diameterMm)) step = 'add'; }
    else if (calibration) confirmed = [...confirmed, { x, y, id: ++nextId }];
  }
  function detect() {
    if (!pixels || !calibration || !diameterMm) return;
    const separation = diameterMm * calibration.pixelsPerMm * .8;
    suggested = suggestHoles(pixels, width, height, calibration, diameterMm, outerDiameterMm(face))
      .filter(p => confirmed.every(c => Math.hypot(c.x - p.x, c.y - p.y) > separation)).map(p => ({ ...p, id: ++nextId }));
    detected = true;
  }
  function accept(id: number) {
    const point = suggested.find(p => p.id === id);
    if (point) confirmed = [...confirmed, point];
    suggested = suggested.filter(p => p.id !== id);
  }
  function editPoint(id: number, axis: 'x' | 'y', field: HTMLInputElement) {
    const number = Number(field.value);
    if (field.value.trim() === '' || !Number.isFinite(number)) {
      field.value = String(confirmed.find(p => p.id === id)?.[axis] ?? 0);
      return;
    }
    const bounded = Math.max(0, Math.min(axis === 'x' ? width : height, number));
    field.value = String(bounded);
    confirmed = confirmed.map(p => p.id === id ? { ...p, [axis]: bounded } : p);
  }
</script>
<div data-ui="TargetPhoto" class="contents">

<Label class="upload">{t('photo.file')}<Input type="file" accept="image/jpeg,image/png,image/webp" onchange={upload} /></Label>
{#if loading}<p role="status">{t('site.loading')}</p>{/if}
{#if error}<p role="alert">{error}</p>{/if}
{#if source}
  <div class="toolbar">
    <Label>{t('photo.ring')}<NativeSelect bind:value={ringScore}>{#each face.rings as r}<option value={r.score}>{r.score} · Ø {r.diameterMm} mm</option>{/each}</NativeSelect></Label>
    <ShadcnButton variant="outline" type="button" aria-pressed={step === 'centre'} onclick={() => step = 'centre'}>{t('photo.centre')}</ShadcnButton>
    <ShadcnButton variant="outline" type="button" aria-pressed={step === 'edge'} disabled={centreX === undefined || centreY === undefined} onclick={() => step = 'edge'}>{t('photo.edge')}</ShadcnButton>
    <ShadcnButton variant="outline" type="button" aria-pressed={step === 'add'} disabled={!calibration} onclick={() => step = 'add'}>{t('photo.add')}</ShadcnButton>
  </div>
  <p role="status">{t(`photo.step.${step}`)}</p>
  <div class="stage" style={`aspect-ratio: ${width} / ${height}`}>
    <button  class="photo" type="button" onclick={point} aria-label={t('photo.point', { step: t(`photo.step.${step}`) })}><img src={source} alt={t('photo.image')} draggable="false" /></button>
    <svg class="guide" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {#if centreX !== undefined && centreY !== undefined}<path d={`M ${centreX - 10} ${centreY} h 20 M ${centreX} ${centreY - 10} v 20`} />{/if}
      {#if calibration}<circle cx={calibration.centre.x} cy={calibration.centre.y} r={ring.diameterMm / 2 * calibration.pixelsPerMm} />{/if}
    </svg>
    {#each confirmed as p, i (p.id)}<button  type="button" class="marker" style={`left:${p.x / width * 100}%;top:${p.y / height * 100}%`} aria-label={t('photo.mark', { number: i + 1 })} onclick={() => document.getElementById(`hole-x-${p.id}`)?.focus()}>{i + 1}</button>{/each}
    {#each suggested as p (p.id)}<button  type="button" class="marker suggestion" style={`left:${p.x / width * 100}%;top:${p.y / height * 100}%`} aria-label={`${t('photo.accept')} (${p.x}, ${p.y})`} onclick={() => accept(p.id)}>?</button>{/each}
  </div>
  {#if calibration}<ScaleRuler unitsPerUnit={calibration.pixelsPerMm} />{/if}
  <details><summary>{t('photo.calibrate')}</summary><p class="hint">{t('photo.keyboard')}</p>
    <div class="calibration">
      <Label>{t('photo.centreX')}<Input type="number" min="0" max={width} step="any" bind:value={centreX} /></Label>
      <Label>{t('photo.centreY')}<Input type="number" min="0" max={height} step="any" bind:value={centreY} /></Label>
      <Label>{t('photo.edgeX')}<Input type="number" min="0" max={width} step="any" bind:value={edgeX} /></Label>
      <Label>{t('photo.edgeY')}<Input type="number" min="0" max={height} step="any" bind:value={edgeY} /></Label>
    </div>
  </details>
  {#if !calibration}<p>{t('photo.invalidCalibration')}</p>{/if}
  <div class="toolbar">
    <ShadcnButton variant="outline" type="button" disabled={!calibration || !diameterMm} onclick={detect}>{t('photo.detect')}</ShadcnButton>
    <ShadcnButton variant="outline" type="button" disabled={!calibration} onclick={() => { if (calibration) confirmed = [...confirmed, { ...calibration.centre, id: ++nextId }]; }}>{t('photo.addCentre')}</ShadcnButton>
    <ShadcnButton variant="outline" type="button" disabled={!confirmed.length && !suggested.length} onclick={() => { confirmed = []; suggested = []; detected = false; }}>{t('photo.clear')}</ShadcnButton>
  </div>
  {#if detected}<p class="hint" role="status">{suggested.length ? t('photo.pending', { count: suggested.length }) : t('photo.none')}</p>{/if}
  {#if suggested.length}
    <h3>{t('photo.suggestions')}</h3><p class="hint">{t('photo.review')}</p>
    <ul class="markers">{#each suggested as p (p.id)}<li><span>{p.x}, {p.y} px</span><ShadcnButton variant="outline" type="button" onclick={() => accept(p.id)}>{t('photo.accept')}</ShadcnButton><ShadcnButton variant="outline" type="button" onclick={() => suggested = suggested.filter(s => s.id !== p.id)}>{t('photo.remove')}</ShadcnButton></li>{/each}</ul>
  {/if}
  <h3>{t('photo.holes')} ({confirmed.length})</h3>
  {#if !confirmed.length}<p>{t('photo.empty')}</p>{/if}
  <ol class="markers">{#each confirmed as p, i (p.id)}<li>
    <span>{i + 1}</span>
    <Label>x (px)<Input id={`hole-x-${p.id}`} aria-label={`${t('photo.mark', { number: i + 1 })} x (px)`} type="number" min="0" max={width} step="any" value={p.x} onchange={(e) => editPoint(p.id, 'x', e.currentTarget)} /></Label>
    <Label>y (px)<Input aria-label={`${t('photo.mark', { number: i + 1 })} y (px)`} type="number" min="0" max={height} step="any" value={p.y} onchange={(e) => editPoint(p.id, 'y', e.currentTarget)} /></Label>
    <ShadcnButton variant="outline" type="button" onclick={() => confirmed = confirmed.filter(c => c.id !== p.id)}>{t('photo.remove')}</ShadcnButton>
  </li>{/each}</ol>
{/if}

</div>
<style>
  @layer legacy {
  :global([data-ui="TargetPhoto"] [data-slot="button"]:not(.photo):not(.marker)) { color: var(--ink); background: var(--surface); border: 1px solid var(--rule); border-radius: var(--radius); padding: .45rem .7rem; cursor: pointer; min-height: var(--control-height); }
  :global([data-ui="TargetPhoto"] [data-slot="button"]:disabled) { opacity: .5; cursor: default; }
  :global([data-ui="TargetPhoto"] [data-slot="label"]) { display: grid; gap: .25rem; min-width: 0; font-size: .9rem; } :global([data-ui="TargetPhoto"] [data-slot="input"]),
:global([data-ui="TargetPhoto"] [data-slot="native-select"]) { max-width: 100%; min-width: 0; }
  :global([data-ui="TargetPhoto"] .upload) { max-width: 30rem; } :global([data-ui="TargetPhoto"] .toolbar) { display: flex; flex-wrap: wrap; align-items: end; gap: .5rem; margin-block: 1rem; }
  :global([data-ui="TargetPhoto"] .toolbar [data-slot="button"][aria-pressed="true"]) { border-color: var(--link); color: var(--link); }
  :global([data-ui="TargetPhoto"] .stage) { position: relative; max-width: 56rem; background: white; isolation: isolate; }
  :global([data-ui="TargetPhoto"] .photo) { position: absolute; inset: 0; padding: 0; margin: 0; border: 0; border-radius: 0; width: 100%; height: 100%; cursor: crosshair; }
  :global([data-ui="TargetPhoto"] .photo img) { display: block; width: 100%; height: 100%; }
  :global([data-ui="TargetPhoto"] .guide) { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; fill: none; stroke: #00bfff; stroke-width: 2; }
  :global([data-ui="TargetPhoto"] .guide path),
:global([data-ui="TargetPhoto"] .guide circle) { vector-effect: non-scaling-stroke; }
  :global([data-ui="TargetPhoto"] .marker) { position: absolute; transform: translate(-50%,-50%); border: 2px solid white; background: #005b99; color: white; font-size: 12px; border-radius: 50%; min-width: 26px; width: 26px; min-height: 26px; height: 26px; padding: 0; line-height: 1; box-shadow: 0 0 0 1px #005b99; }
  :global([data-ui="TargetPhoto"] .suggestion) { background: #8a4b00; border-style: dashed; box-shadow: 0 0 0 1px #8a4b00; }
  :global([data-ui="TargetPhoto"] details) { margin-top: 1rem; } :global([data-ui="TargetPhoto"] summary) { cursor: pointer; } :global([data-ui="TargetPhoto"] .calibration) { display: grid; grid-template-columns: repeat(auto-fit,minmax(8rem,1fr)); gap: .5rem; max-width: 45rem; }
  :global([data-ui="TargetPhoto"] .hint) { max-width: 75ch; color: var(--ink-2); font-size: .9rem; }
  :global([data-ui="TargetPhoto"] .markers) { list-style: none; padding: 0; max-width: 45rem; } :global([data-ui="TargetPhoto"] .markers li) { display: flex; align-items: end; gap: .6rem; flex-wrap: wrap; padding: .5rem 0; border-bottom: 1px solid var(--rule); }
  :global([data-ui="TargetPhoto"] .markers [data-slot="label"]) { flex: 1 1 6rem; max-width: 12rem; } :global([data-ui="TargetPhoto"] .markers span) { align-self: center; }
  }
</style>
