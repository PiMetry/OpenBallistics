<script lang="ts">
  import ScaleRuler from '../components/ScaleRuler.svelte';
  import { Label } from '$lib/components/ui/label/index.js';
  import { NativeSelect } from '$lib/components/ui/native-select/index.js';
  import { Button as ShadcnButton } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';

  import PageHeader from '../components/PageHeader.svelte';
  /**
   * The bullet designer.
   *
   * The drawing is the centre of it: a bullet built from the figures in the panel, drawn live by
   * the same geometry the catalogue is drawn with, and laid over a photograph when there is one --
   * scaled by a ruler in the picture and placed on a marked axis - so the figures can be tuned
   * until the outline sits on the bullet. A photograph is optional: without one the panel and the
   * drawing are the whole tool. Tracing the silhouette is optional too, a way to seed the figures
   * rather than the way to get them.
   *
   * The arithmetic is in `lib/designer`, tested against a bullet of known dimensions; the drawing
   * uses the catalogue's `liveBulletDrawing` function, with
   * the tip's form added over it. Nothing here invents: what a picture cannot give - weight,
   * jacket, core - is asked for, and the record names its source and kind.
   */
  import {
    axisFrom,
    buildBullet,
    defaultRadiusCalibres,
    inputsFrom,
    measure,
    mergeEdges,
    noseOf,
    orderCorners,
    proposeTrace,
    recordFromInputs,
    rectificationPlan,
    refitAxis,
    scaleFrom,
    toProfile,
    warpPixels,
    type Axis,
    type Inputs,
    type Px,
    type Ruler
  } from '@lib/designer';
  import { bullets, loadBullet } from '../lib/bullets';
  import { type Profile } from '@lib/geom';
import { liveBulletDrawing } from '@lib/render2d';
import { type OgiveType, type TipType } from '@lib/shapes2d';
  import { t } from '../lib/i18n.svelte';
  import { href, route } from '../lib/router';
  import { PX_PER_MM } from '@lib/core';

  // ---- The figures ----------------------------------------------------------------------------
  let inputs = $state<Inputs>({
    diameter: 7.82,
    length: 32.7,
    boatTail: 5.66,
    baseDiameter: 6.23,
    bearing: 6.83,
    meplat: 1.27,
    ogiveForm: 'hybrid',
    radiusCalibres: 10.9,
    tipType: 'open_meplat',
    cavityDepth: 2,
    jacket: 'fmj'
  });
  const built = $derived(buildBullet(inputs));
  const nose = $derived(noseOf(inputs));

  const FORMS: OgiveType[] = ['tangent', 'secant', 'hybrid', 'elliptical', 'conical'];
  const TIPS: TipType[] = ['open_meplat', 'hollow_point', 'flat', 'sharp', 'polymer'];
  const JACKETS: Inputs['jacket'][] = ['fmj', 'plated', 'unjacketed'];
  type Dim = 'diameter' | 'length' | 'boatTail' | 'baseDiameter' | 'bearing' | 'meplat' | 'radiusCalibres' | 'cavityDepth';

  function set<K extends keyof Inputs>(key: K, value: Inputs[K]) {
    inputs = { ...inputs, [key]: value };
    if (key === 'ogiveForm' && (value === 'secant' || value === 'hybrid') && inputs.radiusCalibres <= 0) {
      inputs = { ...inputs, radiusCalibres: Number(defaultRadiusCalibres(inputs).toFixed(2)) };
    }
  }
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value);

  // ---- Starting points: the catalogue --------------------------------------------------------
  let startFrom = $state('');
  let sampleOrigin = $state<string | null>(null);
  async function start(key: string) {
    startFrom = key;
    sampleOrigin = null;
    if (!key) return;
    const r = await loadBullet(key);
    sampleOrigin = r.sample ? r.key : null;
    const d = r.derived;
    inputs = {
      diameter: r.diameter,
      length: d.length,
      boatTail: d.boatTail,
      baseDiameter: d.baseDiameter,
      bearing: d.bearing,
      meplat: d.meplat,
      ogiveForm: (r.ogive.form as OgiveType) ?? 'tangent',
      radiusCalibres: d.ogiveRadiusCalibres,
      tipType: (r.tip.type as TipType) ?? 'open_meplat',
      cavityDepth: r.tip.cavity_depth ?? 2,
      jacket: r.construction.jacket === 'unjacketed' ? 'unjacketed' : r.construction.jacket === 'plated' ? 'plated' : 'fmj'
    };
    manufacturer = r.manufacturer;
    line = r.line ?? '';
    model = r.model;
    name = r.name;
    calibre = r.calibre;
    massGrains = Math.round(r.mass / 0.06479891);
  }

  // ---- The drawing ----------------------------------------------------------------------------
  let outline = $state(false);
  let dimensions = $state(true);
  let stageWidth = $state(0);
  const drawing = $derived.by(() => {
    if (!built) return null;
    return liveBulletDrawing(
      { key: 'design', manufacturer: manufacturer || 'Design', name: name || 'bullet', base_to_ogive: null },
      built.bullet,
      { style: outline ? 'technical' : 'visual', dimensions, extras: true, className: outline ? 'technical' : '' }
    );
  });
  /** The drawing's zoom: fit by default, or a factor the reader sets. */
  let drawingZoomOverride = $state<number | null>(null);
  const drawingFit = $derived.by(() => {
    if (!drawing || !stageWidth) return 2;
    return Math.max(1, Math.min(6, (stageWidth - 40) / (drawing.widthMm * PX_PER_MM)));
  });
  const drawingZoom = $derived(drawingZoomOverride ?? drawingFit);

  // ---- The photograph, optional ---------------------------------------------------------------
  type Tool = 'corners' | 'ruler' | 'axis' | 'upper' | 'lower' | 'ogive';
  let src = $state<string | null>(null);
  let photoName = $state('');
  let natural = $state<[number, number]>([0, 0]);
  let img: HTMLImageElement | undefined = $state();
  let showPhoto = $state(false);

  // Also on a hash change while the page is open, which is how "Try the sample" arrives from here.
  $effect(() => {
    void $route;
    const query = location.hash.split('?')[1];
    if (!query || src) return;
    const url = new URLSearchParams(query).get('img');
    if (url) {
      src = url;
      photoName = url.split('/').pop() ?? url;
      showPhoto = true;
    }
  });
  function pick(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    src = URL.createObjectURL(file);
    photoName = file.name;
    showPhoto = true;
    clearMarks();
  }
  function removePhoto() {
    src = null;
    showPhoto = false;
    clearMarks();
  }
  function loaded() {
    if (img) natural = [img.naturalWidth, img.naturalHeight];
  }
  function toImage(event: MouseEvent): Px {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const k = natural[0] / rect.width;
    return [(event.clientX - rect.left) * k, (event.clientY - rect.top) * k];
  }
  /** Zoom of the photograph: 1 fits the stage's width; the picture scrolls inside it beyond that. */
  let photoZoom = $state(1);
  let photoBox: HTMLDivElement | undefined = $state();
  const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8];
  const view = $derived(natural[0] && stageWidth ? (stageWidth * photoZoom) / natural[0] : 1);
  /** Zoom to `next`, keeping the picture point under (clientX, clientY) where it is. */
  function zoomPhoto(next: number, clientX?: number, clientY?: number) {
    const box = photoBox;
    const before = photoZoom;
    next = Math.min(8, Math.max(1, next));
    if (!box || next === before) {
      photoZoom = next;
      return;
    }
    const rect = box.getBoundingClientRect();
    const px = (clientX ?? rect.left + rect.width / 2) - rect.left + box.scrollLeft;
    const py = (clientY ?? rect.top + rect.height / 2) - rect.top + box.scrollTop;
    photoZoom = next;
    requestAnimationFrame(() => {
      const k = next / before;
      box.scrollLeft = px * k - ((clientX ?? rect.left + rect.width / 2) - rect.left);
      box.scrollTop = py * k - ((clientY ?? rect.top + rect.height / 2) - rect.top);
    });
  }
  function wheel(event: WheelEvent) {
    // Ctrl (or the pinch gesture browsers report as it) zooms; a plain wheel scrolls the picture.
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const step = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomPhoto(photoZoom * step, event.clientX, event.clientY);
  }


  let tool = $state<Tool>('ruler');
  let rulers = $state<Ruler[]>([]);
  let pending = $state<Px | null>(null);
  let rulerMm = $state(50);
  let axisClicks = $state<Px[]>([]);
  let upper = $state<Px[]>([]);
  let lower = $state<Px[]>([]);
  let ogiveStart = $state<Px | null>(null);
  /** The four corners of a card of known size, for an oblique photograph; see `rectify`. */
  let corners = $state<Px[]>([]);
  /** The same four as a quadrilateral, which is the shape drawn back and the one rectified. */
  const cornerRing = $derived(orderCorners(corners) ?? corners);
  let cardWidthMm = $state(85.6);
  let cardHeightMm = $state(53.98);
  let rectifying = $state(false);
  const TOOLS: Tool[] = ['corners', 'ruler', 'axis', 'upper', 'lower', 'ogive'];

  function clearMarks() {
    rulers = [];
    pending = null;
    axisClicks = [];
    upper = [];
    lower = [];
    ogiveStart = null;
    corners = [];
    tool = 'ruler';
  }
  /** The picture's pixels, read once through a canvas of its own size. */
  function pixels(): { data: Uint8ClampedArray; width: number; height: number } | null {
    if (!img || !natural[0]) return null;
    const canvas = document.createElement('canvas');
    canvas.width = natural[0];
    canvas.height = natural[1];
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(img, 0, 0);
    try {
      const image = context.getImageData(0, 0, natural[0], natural[1]);
      return { data: image.data, width: image.width, height: image.height };
    } catch {
      return null;
    }
  }
  /**
   * Straighten an oblique photograph around the card whose corners were clicked: the picture is
   * resampled so the card is square-on and at its own size, becomes the picture, and its top edge
   * becomes the ruler. Every other mark is cleared, since none of them survives the warp.
   */
  async function rectify() {
    const plan = rectificationPlan(corners, cardWidthMm, cardHeightMm, natural[0], natural[1]);
    const source = pixels();
    if (!plan || !source) return;
    rectifying = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const [, , outW, outH] = plan.box;
    const warped = warpPixels(source.data, source.width, source.height, plan.homography, outW, outH);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const context = canvas.getContext('2d');
    if (!context) {
      rectifying = false;
      return;
    }
    const image = context.createImageData(outW, outH);
    image.data.set(warped);
    context.putImageData(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      rectifying = false;
      return;
    }
    const ruler = plan.ruler;
    src = URL.createObjectURL(blob);
    photoName = `${photoName.replace(/\.[a-z0-9]+$/i, '')} (rectified).png`;
    clearMarks();
    rulers = [ruler];
    tool = 'axis';
    rectifying = false;
  }
  /** Edges found along the marked axis, as a trace to correct rather than to draw from scratch. */
  function propose() {
    const source = pixels();
    if (!source || !clickedAxis) return;
    const [base, tip] = axisClicks as [Px, Px];
    const found = proposeTrace(source.data, source.width, source.height, clickedAxis, Math.hypot(tip[0] - base[0], tip[1] - base[1]));
    upper = found.upper;
    lower = found.lower;
    if (tool === 'axis') tool = 'upper';
  }
  let pointX = $state(0);
  let pointY = $state(0);
  function click(event: MouseEvent) {
    if (!src || justDragged || dragging) return;
    addPoint(event.detail === 0 ? [pointX, pointY] : toImage(event));
  }
  function addPoint(p: Px) {
    if (!src || !p.every(Number.isFinite) || p[0] < 0 || p[1] < 0 || p[0] > natural[0] || p[1] > natural[1]) return;
    if (tool === 'corners') corners = corners.length >= 4 ? [p] : [...corners, p];
    else if (tool === 'ruler') {
      if (pending) {
        rulers = [...rulers, { a: pending, b: p, mm: rulerMm }];
        pending = null;
      } else pending = p;
    } else if (tool === 'axis') axisClicks = axisClicks.length >= 2 ? [p] : [...axisClicks, p];
    else if (tool === 'upper') upper = [...upper, p];
    else if (tool === 'lower') lower = [...lower, p];
    else ogiveStart = p;
  }
  /** Every mark, addressable: for dragging on the picture and for the coordinate table. */
  type MarkRef = { kind: 'ruler'; index: number; end: 'a' | 'b' } | { kind: 'axis' | 'upper' | 'lower' | 'corner'; index: number } | { kind: 'ogive' };
  function markAt(ref: MarkRef): Px | null {
    if (ref.kind === 'ruler') return rulers[ref.index]?.[ref.end] ?? null;
    if (ref.kind === 'corner') return corners[ref.index] ?? null;
    if (ref.kind === 'axis') return axisClicks[ref.index] ?? null;
    if (ref.kind === 'upper') return upper[ref.index] ?? null;
    if (ref.kind === 'lower') return lower[ref.index] ?? null;
    return ogiveStart;
  }
  function moveMark(ref: MarkRef, to: Px) {
    if (ref.kind === 'ruler') rulers = rulers.map((r, i) => (i === ref.index ? { ...r, [ref.end]: to } : r));
    else if (ref.kind === 'corner') corners = corners.map((q, i) => (i === ref.index ? to : q));
    else if (ref.kind === 'axis') axisClicks = axisClicks.map((q, i) => (i === ref.index ? to : q));
    else if (ref.kind === 'upper') upper = upper.map((q, i) => (i === ref.index ? to : q));
    else if (ref.kind === 'lower') lower = lower.map((q, i) => (i === ref.index ? to : q));
    else ogiveStart = to;
  }
  function removeMark(ref: MarkRef) {
    if (ref.kind === 'ruler') rulers = rulers.filter((_, i) => i !== ref.index);
    else if (ref.kind === 'corner') corners = corners.filter((_, i) => i !== ref.index);
    else if (ref.kind === 'axis') axisClicks = axisClicks.filter((_, i) => i !== ref.index);
    else if (ref.kind === 'upper') upper = upper.filter((_, i) => i !== ref.index);
    else if (ref.kind === 'lower') lower = lower.filter((_, i) => i !== ref.index);
    else ogiveStart = null;
  }
  function setCoord(ref: MarkRef, axisIndex: 0 | 1, value: number) {
    const at = markAt(ref);
    if (!at) return;
    const next: Px = [at[0], at[1]];
    next[axisIndex] = value;
    moveMark(ref, next);
  }

  // Dragging a mark: the pointer is captured on the mark, the position follows in picture pixels,
  // and the click that would otherwise add a new point right after is swallowed.
  let dragging = $state<MarkRef | null>(null);
  let justDragged = false;
  function fromClient(x: number, y: number): Px {
    const rect = img!.getBoundingClientRect();
    const k = natural[0] / rect.width;
    return [(x - rect.left) * k, (y - rect.top) * k];
  }
  function grab(event: PointerEvent, ref: MarkRef) {
    // The ogive starts on the edge, so with that tool a click on a traced point takes the point.
    if (tool === 'ogive' && (ref.kind === 'upper' || ref.kind === 'lower')) {
      ogiveStart = markAt(ref);
      event.stopPropagation();
      return;
    }
    if (event.shiftKey || event.button === 2) {
      event.preventDefault();
      removeMark(ref);
      return;
    }
    dragging = ref;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    event.stopPropagation();
  }
  function drag(event: PointerEvent) {
    if (!dragging || !img) return;
    moveMark(dragging, fromClient(event.clientX, event.clientY));
    justDragged = true;
  }
  function release() {
    dragging = null;
    setTimeout(() => (justDragged = false), 0);
  }
  let showPoints = $state(false);
  /** The picture's marks in order, for the table. */
  const marks = $derived.by((): { ref: MarkRef; label: string; at: Px }[] => {
    const out: { ref: MarkRef; label: string; at: Px }[] = [];
    rulers.forEach((r, i) => {
      out.push({ ref: { kind: 'ruler', index: i, end: 'a' }, label: `${t('designer.tool.ruler')} ${i + 1} A`, at: r.a });
      out.push({ ref: { kind: 'ruler', index: i, end: 'b' }, label: `${t('designer.tool.ruler')} ${i + 1} B`, at: r.b });
    });
    corners.forEach((q, i) => out.push({ ref: { kind: 'corner', index: i }, label: `${t('designer.tool.corners')} ${i + 1}`, at: q }));
    axisClicks.forEach((q, i) => out.push({ ref: { kind: 'axis', index: i }, label: i === 0 ? t('designer.base') : t('designer.tipPoint'), at: q }));
    upper.forEach((q, i) => out.push({ ref: { kind: 'upper', index: i }, label: `${t('designer.tool.upper')} ${i + 1}`, at: q }));
    lower.forEach((q, i) => out.push({ ref: { kind: 'lower', index: i }, label: `${t('designer.tool.lower')} ${i + 1}`, at: q }));
    if (ogiveStart) out.push({ ref: { kind: 'ogive' }, label: t('designer.tool.ogive'), at: ogiveStart });
    return out;
  });
  /** A mark's place along the bullet, in millimetres, where the axis and scale are known. */
  function inMm(at: Px): string {
    if (!axis || !scale) return '';
    const [r, z] = toProfile([at], axis, scale.mmPerPx)[0]!;
    return `z ${z.toFixed(2)} · r ${r.toFixed(2)}`;
  }

  function undo() {
    if (tool === 'corners') corners = corners.slice(0, -1);
    else if (tool === 'ruler') {
      if (pending) pending = null;
      else rulers = rulers.slice(0, -1);
    } else if (tool === 'axis') axisClicks = axisClicks.slice(0, -1);
    else if (tool === 'upper') upper = upper.slice(0, -1);
    else if (tool === 'lower') lower = lower.slice(0, -1);
    else ogiveStart = null;
  }

  const scale = $derived(scaleFrom(rulers));
  const clickedAxis = $derived<Axis | null>(axisClicks.length === 2 ? axisFrom(axisClicks[0]!, axisClicks[1]!) : null);
  const axis = $derived(clickedAxis ? refitAxis(clickedAxis, upper, lower) : null);
  const traced = $derived.by((): Profile | null => {
    if (!axis || !scale || upper.length < 4) return null;
    return mergeEdges(toProfile(upper, axis, scale.mmPerPx), lower.length >= 2 ? toProfile(lower, axis, scale.mmPerPx) : null);
  });
  const ogiveStartZ = $derived(ogiveStart && axis && scale ? toProfile([ogiveStart], axis, scale.mmPerPx)[0]![1] : null);
  const measured = $derived(traced && scale ? measure(traced, scale.mmPerPx, ogiveStartZ) : null);
  function useTrace() {
    if (measured) inputs = inputsFrom(measured, inputs);
  }

  /** The built bullet's outline in picture pixels: base on the axis origin, scaled by the ruler. */
  const overlay = $derived.by(() => {
    if (!built || !axis || !scale) return '';
    const pt = (r: number, z: number): Px => {
      const zz = z / scale.mmPerPx, rr = r / scale.mmPerPx;
      return [axis.origin[0] + axis.dir[0] * zz - axis.dir[1] * rr, axis.origin[1] + axis.dir[1] * zz + axis.dir[0] * rr];
    };
    const up = built.profile.map(([r, z]) => pt(r, z));
    const down = [...built.profile].reverse().map(([r, z]) => pt(-r, z));
    return [...up, ...down].map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + ' Z';
  });

  // ---- The record -----------------------------------------------------------------------------
  let manufacturer = $state('');
  let line = $state('');
  let model = $state('');
  let name = $state('');
  let calibre = $state('');
  let massGrains = $state<number | null>(null);
  let sourcePublisher = $state('');
  let sourceUrl = $state('');
  let sourceKind = $state<'published' | 'measured' | 'quoted'>('measured');

  const enteredRecord = $derived(
    built && manufacturer && model && name
      ? recordFromInputs(
          inputs,
          built,
          { manufacturer, line: line || undefined, model, name, calibre: calibre || `${inputs.diameter.toFixed(2)} mm`, massGrains },
          {
            publisher: sourcePublisher || (src ? 'Measured from a photograph with the OpenBallistics designer' : 'Entered in the OpenBallistics designer'),
            url: sourceUrl || photoName,
            kind: sourceKind,
            note: measured ? `Photograph ${photoName}; pixel size ${measured.uncertainty.toFixed(3)} mm` : 'Figures as entered'
          }
        )
      : null
  );
  const record = $derived(enteredRecord && sampleOrigin
    ? { ...enteredRecord, sample: true, sampleOrigin, sources: [], notes: 'Edited from a synthetic sample; illustrative values, not measured manufacturer specifications.' }
    : enteredRecord);
  const recordJson = $derived(record ? JSON.stringify(record, null, 2) : '');
  const downloadHref = $derived(record ? `data:application/json;charset=utf-8,${encodeURIComponent(recordJson)}` : '#');

  const f2 = (v: number) => v.toFixed(2);
  const word = (s: string) => s.replace(/_/g, ' ');
</script>
<div data-ui="Designer" class="contents">

<PageHeader title={t('actions.addBullet')} description={t('designer.lede2')} backHref={href.bullets()} backLabel={t('bullets.title')} />

{#if sampleOrigin}<p class="rounded-lg border bg-muted/40 p-4 text-sm text-foreground">{t('bullets.sampleNote')}</p>{/if}

<div class="bench">
  <!-- The stage: the drawing, or the photograph with the drawing laid over it. -->
  <section class="card stage-card" bind:clientWidth={stageWidth}>
    <Label class="start">
    <span>{t('designer.startFrom')}</span>
    <NativeSelect value={startFrom} onchange={(e) => start(e.currentTarget.value)}>
      <option value="">{t('designer.blank')}</option>
      {#each bullets as b (b.key)}
        <option value={b.key}>{b.manufacturer} {b.name}</option>
      {/each}
    </NativeSelect>
  </Label>

    <div class="bar">
      <div class="segment" role="group" aria-label={t('designer.stage')}>
        <ShadcnButton variant={!showPhoto ? 'default' : 'outline'} class={[(!showPhoto) ? "on" : '']} type="button"  aria-pressed={!showPhoto} onclick={() => (showPhoto = false)}>{t('designer.stageDrawing')}</ShadcnButton>
        <ShadcnButton variant={showPhoto ? 'default' : 'outline'} class={[(showPhoto) ? "on" : '']} type="button"  aria-pressed={showPhoto} disabled={!src} onclick={() => (showPhoto = true)}>{t('designer.stagePhoto')}</ShadcnButton>
      </div>
      {#if !showPhoto}
        <div class="segment">
          <ShadcnButton variant={!outline ? 'default' : 'outline'} class={[(!outline) ? "on" : '']} type="button"  aria-pressed={!outline} onclick={() => (outline = false)}>{t('style.visual')}</ShadcnButton>
          <ShadcnButton variant={outline ? 'default' : 'outline'} class={[(outline) ? "on" : '']} type="button"  aria-pressed={outline} onclick={() => (outline = true)}>{t('style.technical')}</ShadcnButton>
        </div>
        <ShadcnButton variant={dimensions ? 'default' : 'outline'} class={["chip", (dimensions) ? "on" : '']} type="button"   aria-pressed={dimensions} onclick={() => (dimensions = !dimensions)}>{t('draw.dimensions')}</ShadcnButton>
      {/if}
      <span class="grow"></span>
      <Label class="chip file"><Input type="file" accept="image/*" onchange={pick} />{src ? t('designer.changePhoto') : t('designer.choose')}</Label>
      {#if !src}<a class="chip" href={href.designerSample()}>{t('designer.sample')}</a>{/if}
      {#if src}<ShadcnButton variant="outline" type="button" class="chip" onclick={removePhoto}>{t('designer.removePhoto')}</ShadcnButton>{/if}
    </div>

    {#if showPhoto && src}
      <div class="steps" role="group" aria-label={t('designer.tools')}>
        {#each TOOLS as option, i (option)}
          <ShadcnButton variant={tool === option ? 'default' : 'outline'} class={["tool", (tool === option) ? "on" : '']} type="button"   aria-pressed={tool === option} onclick={() => (tool = option)}>
            <span class="step">{i + 1}</span>{t(`designer.tool.${option}`)}
          </ShadcnButton>
        {/each}
        {#if tool === 'ruler'}
          <Label class="mm"><Input type="number" aria-label={`${t('designer.tool.ruler')} (mm)`} min="1" step="1" bind:value={rulerMm} /> mm</Label>
        {/if}
        {#if tool === 'corners'}
          <Label class="mm">{t('designer.cardSize')} <Input type="number" min="1" step="0.01" aria-label={`${t('designer.cardSize')}: x (mm)`} bind:value={cardWidthMm} /> x
            <Input type="number" min="1" step="0.01" aria-label={`${t('designer.cardSize')}: y (mm)`} bind:value={cardHeightMm} /> mm</Label>
          <ShadcnButton variant="outline" type="button" class="tool go" disabled={corners.length !== 4 || rectifying} onclick={rectify}>{rectifying ? '…' : t('designer.rectify')}</ShadcnButton>
        {/if}
        <span class="grow"></span>
        <ShadcnButton variant="outline" type="button" class="tool" onclick={undo}>{t('designer.undo')}</ShadcnButton>
        <ShadcnButton variant="outline" type="button" class="tool" onclick={clearMarks}>{t('designer.clear')}</ShadcnButton>
      </div>
      <p class="hint">{t(`designer.hint.${tool}`)}</p>
      <div class="point-entry" role="group" aria-label={t('designer.coordinates')}>
        <Label>x (px)<Input type="number" min="0" max={natural[0]} step="0.5" bind:value={pointX} /></Label>
        <Label>y (px)<Input type="number" min="0" max={natural[1]} step="0.5" bind:value={pointY} /></Label>
        <ShadcnButton variant="outline" type="button" disabled={!Number.isFinite(pointX) || !Number.isFinite(pointY) || pointX < 0 || pointY < 0 || pointX > natural[0] || pointY > natural[1]} onclick={() => { addPoint([pointX, pointY]); showPoints = true; }}>{t('designer.addPoint')}</ShadcnButton>
        <span class="hint">{t('designer.coordinateHint')}</span>
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div class="photo" class:zoomed={photoZoom > 1} bind:this={photoBox} onwheel={wheel}>
        <div class="canvas" style={`width:${(photoZoom * 100).toFixed(2)}%`}>
        <ShadcnButton variant="outline" type="button" class="photo-input" onclick={click} aria-label={t('designer.addPoint')}>
          <img bind:this={img} {src} alt={t('designer.photo')} onload={loaded} draggable="false" />
        </ShadcnButton>
        {#if natural[0]}
          <!--
            Marks in picture pixels over the photograph. Thin lines on a soft white halo, points as a
            white core in a coloured ring: legible on brass, copper and lead, and light enough to
            leave the picture readable. Every mark drags; shift-click or right-click removes it.
          -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <svg class="marks" class:dragging={!!dragging} viewBox={`0 0 ${natural[0]} ${natural[1]}`} preserveAspectRatio="none" aria-hidden="true"
            onpointermove={drag} onpointerup={release} onpointercancel={release} oncontextmenu={(e) => e.preventDefault()}>
            {#if overlay}
              <path d={overlay} class="overlay-fill" />
              <path d={overlay} class="overlay-halo" stroke-width={3 / view} />
              <path d={overlay} class="overlay" stroke-width={1.1 / view} />
            {/if}
            {#if cornerRing.length >= 2}
              <polyline points={cornerRing.map((q) => q.join(',')).join(' ')} class="halo" stroke-width={3 / view} fill="none" />
              <polyline points={cornerRing.map((q) => q.join(',')).join(' ')} class="corner-line" stroke-width={1 / view} fill="none" stroke-dasharray={`${4 / view} ${3 / view}`} />
              {#if cornerRing.length === 4}
                <line x1={cornerRing[3]![0]} y1={cornerRing[3]![1]} x2={cornerRing[0]![0]} y2={cornerRing[0]![1]} class="corner-line" stroke-width={1 / view} stroke-dasharray={`${4 / view} ${3 / view}`} />
              {/if}
            {/if}
            {#each corners as q, i (i)}
              <circle cx={q[0]} cy={q[1]} r={4.5 / view} class="mark corner-mark" stroke-width={1.5 / view} onpointerdown={(e) => grab(e, { kind: 'corner', index: i })} />
            {/each}
            {#each rulers as r, i (i)}
              <line x1={r.a[0]} y1={r.a[1]} x2={r.b[0]} y2={r.b[1]} class="halo" stroke-width={3 / view} />
              <line x1={r.a[0]} y1={r.a[1]} x2={r.b[0]} y2={r.b[1]} class="ruler" stroke-width={1.1 / view} />
              <text x={(r.a[0] + r.b[0]) / 2} y={(r.a[1] + r.b[1]) / 2 - 7 / view} class="label ruler-label" font-size={11 / view}>{r.mm} mm</text>
              <circle cx={r.a[0]} cy={r.a[1]} r={4 / view} class="mark ruler-mark" stroke-width={1.5 / view} onpointerdown={(e) => grab(e, { kind: 'ruler', index: i, end: 'a' })} />
              <circle cx={r.b[0]} cy={r.b[1]} r={4 / view} class="mark ruler-mark" stroke-width={1.5 / view} onpointerdown={(e) => grab(e, { kind: 'ruler', index: i, end: 'b' })} />
            {/each}
            {#if pending}<circle cx={pending[0]} cy={pending[1]} r={4 / view} class="mark ruler-mark pending" stroke-width={1.5 / view} />{/if}
            {#if axisClicks.length === 2}
              <line x1={axisClicks[0]![0]} y1={axisClicks[0]![1]} x2={axisClicks[1]![0]} y2={axisClicks[1]![1]} class="halo" stroke-width={3 / view} />
              <line x1={axisClicks[0]![0]} y1={axisClicks[0]![1]} x2={axisClicks[1]![0]} y2={axisClicks[1]![1]} class="axis-line" stroke-width={1 / view} stroke-dasharray={`${5 / view} ${4 / view}`} />
            {/if}
            {#each axisClicks as q, i (i)}
              <circle cx={q[0]} cy={q[1]} r={4.5 / view} class="mark axis-mark" stroke-width={1.5 / view} onpointerdown={(e) => grab(e, { kind: 'axis', index: i })} />
            {/each}
            {#each upper as q, i (i)}
              <circle cx={q[0]} cy={q[1]} r={3 / view} class="mark upper-mark" stroke-width={1.2 / view} onpointerdown={(e) => grab(e, { kind: 'upper', index: i })} />
            {/each}
            {#each lower as q, i (i)}
              <circle cx={q[0]} cy={q[1]} r={3 / view} class="mark lower-mark" stroke-width={1.2 / view} onpointerdown={(e) => grab(e, { kind: 'lower', index: i })} />
            {/each}
            {#if ogiveStart}
              <circle cx={ogiveStart[0]} cy={ogiveStart[1]} r={6 / view} class="ogive-ring" stroke-width={1.2 / view} />
              <circle cx={ogiveStart[0]} cy={ogiveStart[1]} r={3 / view} class="mark ogive-mark" stroke-width={1.2 / view} onpointerdown={(e) => grab(e, { kind: 'ogive' })} />
            {/if}
          </svg>
        {/if}
        </div>
      </div>
      {#if scale}<ScaleRuler unitsPerUnit={1 / scale.mmPerPx} />{/if}
      <div class="readout">
        <span class="zoom" role="group" aria-label={t('designer.zoom')}>
          <ShadcnButton variant="outline" type="button" class="-ml-px rounded-none first:ml-0 first:rounded-l-md focus-visible:relative focus-visible:z-10" onclick={() => zoomPhoto(ZOOMS.filter((z) => z < photoZoom - 0.01).pop() ?? 1)} aria-label={t('designer.zoomOut')}>-</ShadcnButton>
          <ShadcnButton variant="outline" type="button" class="-ml-px min-w-16 rounded-none font-mono focus-visible:relative focus-visible:z-10" onclick={() => zoomPhoto(1)} title={t('designer.zoomFit')}>{Math.round(photoZoom * 100)} %</ShadcnButton>
          <ShadcnButton variant="outline" type="button" class="-ml-px rounded-none first:ml-0 first:rounded-l-md focus-visible:relative focus-visible:z-10 rounded-r-md" onclick={() => zoomPhoto(ZOOMS.find((z) => z > photoZoom + 0.01) ?? 8)} aria-label={t('designer.zoomIn')}>+</ShadcnButton>
          <span class="muted zoom-hint">{t('designer.zoomHint')}</span>
        </span>
        <span>{t('designer.scale')}: <b class="num">{scale ? `${(1 / scale.mmPerPx).toFixed(1)} px/mm` : '-'}</b>{#if scale && rulers.length > 1} <span class="muted">({t('designer.spread')} {(scale.spread * 100).toFixed(1)} %)</span>{/if}</span>
        <span>{t('designer.points')}: <b class="num">{upper.length} / {lower.length}</b></span>
        {#if clickedAxis}
          <ShadcnButton variant="outline" type="button" class="use-trace" onclick={propose} title={t('designer.proposeHint')}>{t('designer.trace')}</ShadcnButton>
        {/if}
        {#if !axis || !scale}<span class="muted">{t('designer.overlayHint')}</span>{/if}
        {#if measured}
          <ShadcnButton variant="outline" type="button" class="use-trace" onclick={useTrace}>{t('designer.useTrace')}</ShadcnButton>
          <span class="muted">{t('designer.traced', { l: f2(measured.length), d: f2(measured.diameter) })}</span>
        {/if}
        <span class="grow"></span>
        <ShadcnButton variant={showPoints ? 'default' : 'outline'} class={["chip", (showPoints) ? "on" : '']} type="button"   aria-pressed={showPoints} onclick={() => (showPoints = !showPoints)}>{t('designer.points')} ({marks.length})</ShadcnButton>
      </div>
      {#if showPoints && marks.length}
        <p class="hint small">{t('designer.pointsHint')}</p>
        <div class="scroll-x">
          <table class="points">
            <thead><tr><th>{t('designer.mark')}</th><th class="num">x <span class="unit">px</span></th><th class="num">y <span class="unit">px</span></th><th>{t('designer.onAxis')}</th><th></th></tr></thead>
            <tbody>
              {#each marks as m (JSON.stringify(m.ref))}
                <tr class:live={dragging && JSON.stringify(dragging) === JSON.stringify(m.ref)}>
                  <td class="mark-name">{m.label}{#if m.ref.kind === 'ruler'}<span class="muted"> · {rulers[m.ref.index]?.mm} mm</span>{/if}</td>
                  <td class="num"><Input type="number" step="0.5" aria-label={`${m.label}: x (px)`} value={m.at[0].toFixed(1)} onchange={(e) => setCoord(m.ref, 0, Number(e.currentTarget.value))} /></td>
                  <td class="num"><Input type="number" step="0.5" aria-label={`${m.label}: y (px)`} value={m.at[1].toFixed(1)} onchange={(e) => setCoord(m.ref, 1, Number(e.currentTarget.value))} /></td>
                  <td class="num muted">{inMm(m.at)}</td>
                  <td><ShadcnButton variant="outline" type="button" class="remove" aria-label={`${t('designer.remove')}: ${m.label}`} title={t('designer.remove')} onclick={() => removeMark(m.ref)}>x</ShadcnButton></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {:else if drawing}
      <div class="drawing-viewport"><div class="drawing" style={`width:${(drawing.widthMm * PX_PER_MM * drawingZoom).toFixed(0)}px;height:${(drawing.heightMm * PX_PER_MM * drawingZoom).toFixed(0)}px`}>
        {@html drawing.markup}
      </div></div>
      <ScaleRuler widthMm={drawing.widthMm} />
      <p class="scale-note">
        <span class="zoom" role="group" aria-label={t('designer.zoom')}>
          <ShadcnButton variant="outline" type="button" class="-ml-px rounded-none first:ml-0 first:rounded-l-md focus-visible:relative focus-visible:z-10" onclick={() => (drawingZoomOverride = Math.max(0.5, drawingZoom / 1.25))} aria-label={t('designer.zoomOut')}>-</ShadcnButton>
          <ShadcnButton variant="outline" type="button" class="-ml-px min-w-16 rounded-none font-mono focus-visible:relative focus-visible:z-10" onclick={() => (drawingZoomOverride = null)} title={t('designer.zoomFit')}>{drawingZoom.toFixed(1)} : 1</ShadcnButton>
          <ShadcnButton variant="outline" type="button" class="-ml-px rounded-none first:ml-0 first:rounded-l-md focus-visible:relative focus-visible:z-10 rounded-r-md" onclick={() => (drawingZoomOverride = Math.min(12, drawingZoom * 1.25))} aria-label={t('designer.zoomIn')}>+</ShadcnButton>
        </span>
      </p>
    {:else}
      <p class="hint">{t('designer.cannotDraw')}</p>
    {/if}
  </section>

  <!-- The panel: the figures, live. -->
  <section class="card panel">
    <h2>{t('designer.shape')}</h2>
    <Label class="row">
      <span class="label">{t('designer.ogiveForm')}</span>
      <NativeSelect value={inputs.ogiveForm} onchange={(event) => set('ogiveForm', event.currentTarget.value as OgiveType)}>
        {#each FORMS as form (form)}<option value={form}>{form}</option>{/each}
      </NativeSelect>
    </Label>
    <Label class="row">
      <span class="label">{t('designer.tip')}</span>
      <NativeSelect value={inputs.tipType} onchange={(event) => set('tipType', event.currentTarget.value as TipType)}>
        {#each TIPS as tip (tip)}<option value={tip}>{word(tip)}</option>{/each}
      </NativeSelect>
    </Label>
    <Label class="row">
      <span class="label">{t('designer.jacket')}</span>
      <NativeSelect value={inputs.jacket} onchange={(event) => set('jacket', event.currentTarget.value as Inputs['jacket'])}>
        {#each JACKETS as j (j)}<option value={j}>{word(j)}</option>{/each}
      </NativeSelect>
    </Label>

    <h2 class="later">{t('designer.dimensions')}</h2>
    {#snippet slider(key: Dim, symbol: string, label: string, min: number, max: number, step: number, unit: string, disabled: boolean)}
      <Label class={["slider", (disabled) ? "disabled" : '']}  >
        <span class="sym num">{symbol}</span>
        <span class="name">{label}</span>
        <input type="range" {min} {max} {step} value={inputs[key]} {disabled} oninput={(e) => set(key, num(e))} />
        <span class="value">
          <Input type="number" {min} {max} {step} value={inputs[key]} {disabled} onchange={(e) => set(key, num(e))} />
          <span class="unit">{unit}</span>
        </span>
      </Label>
    {/snippet}
    {@render slider('diameter', 'D', t('bullets.diameter'), 3, 15, 0.01, 'mm', false)}
    {@render slider('length', 'L', t('bullets.length'), 5, 80, 0.01, 'mm', false)}
    {@render slider('boatTail', 'Lbt', t('bullets.boatTail'), 0, 15, 0.01, 'mm', false)}
    {@render slider('baseDiameter', 'Db', t('bullets.baseDiameter'), 2, 15, 0.01, 'mm', inputs.boatTail <= 0)}
    {@render slider('bearing', 'Lb', t('bullets.bearing'), 0, 40, 0.01, 'mm', false)}
    {@render slider('meplat', 'Dm', t('bullets.meplat'), 0, 8, 0.01, 'mm', inputs.tipType === 'sharp')}
    {@render slider('radiusCalibres', 'R', t('designer.radius'), 2, 30, 0.1, 'cal', inputs.ogiveForm !== 'secant' && inputs.ogiveForm !== 'hybrid')}
    {#if inputs.tipType === 'hollow_point'}
      {@render slider('cavityDepth', 'Lc', t('designer.cavity'), 0, 10, 0.01, 'mm', false)}
    {:else if inputs.tipType === 'polymer'}
      {@render slider('cavityDepth', 'Lt', t('designer.insert'), 0, 15, 0.01, 'mm', false)}
    {/if}

    <dl class="derived">
      <dt>Ln</dt>
      <dd class="num" class:bad={nose <= 0}>{f2(nose)} mm <span class="muted">{t('bullets.nose')}</span></dd>
      {#if built}
        <dt>R</dt>
        <dd class="num">{built.radiusCalibres.toFixed(2)} cal <span class="muted">{built.bullet.ogive.ogiveType === 'tangent' ? t('designer.radiusFixed') : built.bullet.ogive.ogiveType}</span></dd>
        {#if built.bullet.base.boatTailAngle}
          <dt>β</dt>
          <dd class="num">{built.bullet.base.boatTailAngle.toFixed(1)}° <span class="muted">{t('bullets.boatTailAngle')}</span></dd>
        {/if}
      {/if}
    </dl>
    {#if built && built.notes.length}
      <ul class="notes">
        {#each built.notes as n (n)}<li>{t(`designer.note.${n}`)}</li>{/each}
      </ul>
    {/if}
  </section>
</div>

<section class="card record">
  <h2>{t('designer.record')}</h2>
  <div class="fields">
    <Label><span>{t('bullets.maker')}</span><Input bind:value={manufacturer} placeholder="Hornady" /></Label>
    <Label><span>{t('designer.line')}</span><Input bind:value={line} placeholder="Match" /></Label>
    <Label><span>{t('bullets.partNumber')}</span><Input bind:value={model} placeholder="MY-BULLET-01" /></Label>
    <Label><span>{t('designer.name')}</span><Input bind:value={name} placeholder="30 Cal .308 168 gr BTHP Match" /></Label>
    <Label><span>{t('bullets.calibre')}</span><Input bind:value={calibre} placeholder=".308" /></Label>
    <Label><span>{t('bullets.weight')} (gr)</span><Input type="number" step="0.1" bind:value={massGrains} placeholder="168" /></Label>
    <Label><span>{t('designer.sourcePublisher')}</span><Input bind:value={sourcePublisher} placeholder={t('designer.sourcePublisher')} /></Label>
    <Label><span>{t('designer.sourceUrl')}</span><Input bind:value={sourceUrl} placeholder="https://…" /></Label>
    <Label>
      <span>{t('designer.sourceKind')}</span>
      <NativeSelect bind:value={sourceKind}><option value="published">published</option><option value="measured">measured</option><option value="quoted">quoted</option></NativeSelect>
    </Label>
  </div>
  <div class="actions">
    {#if record}<a class="button primary" href={downloadHref} download={`${record.key}.json`}>{t('designer.download')}</a>{/if}
    {#if !record}<span class="muted">{t('designer.needIdentity')}</span>{/if}
  </div>
  <p class="note">{t('designer.honest2')}</p>
  {#if record}
    <details><summary>{t('designer.json')}</summary><pre class="json">{recordJson}</pre></details>
  {/if}
</section>

<p class="foot"><a href={href.bullets()}>{t('bullets.back')}</a></p>

</div>
<style>
  @layer legacy {
  :global([data-ui="Designer"] .photo-input) { display: block; width: 100%; min-height: 0; padding: 0; border: 0; border-radius: 0; line-height: 0; }
  :global([data-ui="Designer"] .point-entry) { display: flex; align-items: end; flex-wrap: wrap; gap: .5rem; margin: .75rem 0; }
  :global([data-ui="Designer"] .point-entry [data-slot="label"]) { display: grid; gap: .25rem; font-size: var(--step-0); width: 7rem; }
  :global([data-ui="Designer"] .point-entry .hint) { flex: 1 1 15rem; margin: 0; }
  :global([data-ui="Designer"] .start) {
    min-width: 0;
    max-width: 100%;
    margin-bottom: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.72rem;
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  :global([data-ui="Designer"] .start [data-slot="native-select"]) {
    min-width: 0;
    width: 100%;
    text-transform: none;
    letter-spacing: 0;
  }

  :global([data-ui="Designer"] .bench) {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--section-gap);
  }
  @media (min-width: 64rem) {
    :global([data-ui="Designer"] .bench) {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
  }
  :global([data-ui="Designer"] .card) {
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--panel-radius);
    padding: var(--panel-padding);

  }
  :global([data-ui="Designer"] h2) {
    font-size: var(--step-1);
    color: var(--ink);
    margin: 0 0 0.6rem;
  }
  :global([data-ui="Designer"] h2.later) {
    margin-top: 1.2rem;
  }

  :global([data-ui="Designer"] .bar) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  :global([data-ui="Designer"] .grow) {
    flex: 1 1 auto;
  }
  :global([data-ui="Designer"] .segment) {
    display: inline-flex;
    padding: 2px;
    border-radius: var(--radius);
    background: var(--surface-2);
    border: 1px solid var(--rule);
  }
  :global([data-ui="Designer"] .segment [data-slot="button"]) {
    border: 0;
    background: transparent;
    color: var(--ink-2);
    padding: 0.3rem 0.8rem;
    border-radius: var(--radius);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  :global([data-ui="Designer"] .segment [data-slot="button"].on) {
    background: var(--link);
    color: var(--accent-ink);
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
  }
  :global([data-ui="Designer"] .segment [data-slot="button"]:disabled) {
    opacity: 0.4;
    cursor: default;
  }
  :global([data-ui="Designer"] .chip),
:global([data-ui="Designer"] .tool),
:global([data-ui="Designer"] .button),
:global([data-ui="Designer"] .use-trace) {
    display: inline-flex;
    align-items: center;
    min-height: var(--control-height);
    gap: 0.35rem;
    padding: 0.32rem 0.8rem;
    border-radius: var(--radius);
    border: 1px solid var(--rule-strong);
    background: var(--surface);
    color: var(--ink-2);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
    text-decoration: none;
  }
  :global([data-ui="Designer"] .chip:hover),
:global([data-ui="Designer"] .tool:hover),
:global([data-ui="Designer"] .button:hover),
:global([data-ui="Designer"] .use-trace:hover) {
    border-color: var(--link);
    color: var(--link);
    text-decoration: none;
  }
  :global([data-ui="Designer"] .chip.on),
:global([data-ui="Designer"] .tool.on) {
    border-color: var(--link);
    background: var(--accent-soft);
    color: var(--link);
    font-weight: 600;
  }
  :global([data-ui="Designer"] .button.primary),
:global([data-ui="Designer"] .use-trace) {
    background: var(--link);
    border-color: var(--link);
    color: var(--accent-ink);
  }
  :global([data-ui="Designer"] .button.primary:hover),
:global([data-ui="Designer"] .use-trace:hover) {
    color: var(--accent-ink);
    filter: brightness(1.08);
  }
  :global([data-ui="Designer"] .file) {
    position: relative;
  }
  :global([data-ui="Designer"] .file [data-slot="input"]) {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  :global([data-ui="Designer"] .step) {
    display: inline-grid;
    place-items: center;
    width: 1.3em;
    height: 1.3em;
    border-radius: 50%;
    background: var(--surface-2);
    font-size: 0.72em;
    font-weight: 700;
  }
  :global([data-ui="Designer"] .tool.on .step) {
    background: var(--link);
    color: var(--accent-ink);
  }
  :global([data-ui="Designer"] .steps) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }
  :global([data-ui="Designer"] .mm) {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.85rem;
    color: var(--ink-2);
  }
  :global([data-ui="Designer"] .mm [data-slot="input"]) {
    width: 4.5rem;
  }
  :global([data-ui="Designer"] .hint) {
    min-height: 2.6em;
    margin: 0.5rem 0;
    font-size: 0.82rem;
    color: var(--ink-2);
    max-width: 80ch;
  }

  :global([data-ui="Designer"] .drawing-viewport) { max-width: 100%; max-height: 70vh; overflow: auto; }
  :global([data-ui="Designer"] .drawing) { margin: 0.5rem auto; }
  :global([data-ui="Designer"] .drawing svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
  :global([data-ui="Designer"] .scale-note) {
    margin: 0;
    text-align: right;
    font-size: 0.72rem;
    color: var(--ink-3);
  }
  :global([data-ui="Designer"] .photo) {
    border-radius: var(--panel-radius);
    overflow: auto;
    max-height: 70vh;
    background: var(--surface-2);
  }
  :global([data-ui="Designer"] .photo.zoomed) {
    cursor: grab;
  }
  :global([data-ui="Designer"] .canvas) {
    position: relative;
  }
  :global([data-ui="Designer"] .photo img) {
    display: block;
    width: 100%;
    height: auto;
    cursor: crosshair;
    user-select: none;
  }
  :global([data-ui="Designer"] .zoom) { display: inline-flex; align-items: center; isolation: isolate; }
  :global([data-ui="Designer"] .zoom-hint) {
    margin-left: 0.5rem;
    font-size: 0.75rem;
  }
  :global([data-ui="Designer"] .scale-note .zoom) {
    float: right;
  }
  :global([data-ui="Designer"] .marks) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  /* Marks on a photograph of metal: thin, on a soft white halo, in colours that are not brass,
     copper or lead. A point is a white core in a coloured ring; it grows under the pointer. */
  :global([data-ui="Designer"] .marks) {
    --c-ruler: #7c4dff;
    --c-axis: #ff2d95;
    --c-upper: #ffd600;
    --c-lower: #00e676;
    --c-overlay: #00c8ff;
  }
  :global([data-ui="Designer"] .marks.dragging) {
    cursor: grabbing;
  }
  :global([data-ui="Designer"] .halo),
:global([data-ui="Designer"] .overlay-halo) {
    fill: none;
    stroke: rgba(255, 255, 255, 0.75);
    stroke-linecap: round;
  }
  :global([data-ui="Designer"] .ruler) {
    stroke: var(--c-ruler);
    stroke-linecap: round;
  }
  :global([data-ui="Designer"] .label) {
    text-anchor: middle;
    font-family: var(--mono);
    paint-order: stroke;
    stroke: rgba(255, 255, 255, 0.9);
    stroke-width: 2.5px;
  }
  :global([data-ui="Designer"] .ruler-label) {
    fill: var(--c-ruler);
  }
  :global([data-ui="Designer"] .axis-line) {
    fill: none;
    stroke: var(--c-axis);
  }
  :global([data-ui="Designer"] .mark) {
    fill: #fff;
    pointer-events: all;
    cursor: grab;
    transition: r 0.12s ease;
  }
  :global([data-ui="Designer"] .mark:hover) {
    r: 5.5;
  }
  :global([data-ui="Designer"] .ruler-mark) {
    stroke: var(--c-ruler);
  }
  :global([data-ui="Designer"] .pending) {
    stroke-dasharray: 2 2;
  }
  :global([data-ui="Designer"] .axis-mark) {
    stroke: var(--c-axis);
  }
  :global([data-ui="Designer"] .corner-mark) {
    stroke: #d97706;
  }
  :global([data-ui="Designer"] .corner-line) {
    stroke: #d97706;
  }
  :global([data-ui="Designer"] .tool.go:not(:disabled)) {
    color: var(--link);
    border-color: var(--link);
  }
  :global([data-ui="Designer"] .upper-mark) {
    stroke: var(--c-upper);
    fill: rgba(255, 255, 255, 0.95);
  }
  :global([data-ui="Designer"] .lower-mark) {
    stroke: var(--c-lower);
    fill: rgba(255, 255, 255, 0.95);
  }
  :global([data-ui="Designer"] .ogive-mark) {
    stroke: var(--c-axis);
  }
  :global([data-ui="Designer"] .ogive-ring) {
    fill: none;
    stroke: var(--c-axis);
    opacity: 0.5;
  }
  :global([data-ui="Designer"] .overlay-fill) {
    fill: rgba(0, 200, 255, 0.12);
    stroke: none;
  }
  :global([data-ui="Designer"] .overlay) {
    fill: none;
    stroke: var(--c-overlay);
    stroke-linejoin: round;
  }
  :global([data-ui="Designer"] .hint.small) {
    min-height: 0;
    font-size: 0.78rem;
  }
  :global([data-ui="Designer"] .scroll-x) {
    max-height: 22rem;
    overflow: auto;
  }
  :global([data-ui="Designer"] .points) {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    margin-top: 0.4rem;
  }
  :global([data-ui="Designer"] .points th),
:global([data-ui="Designer"] .points td) {
    padding: 0.2rem 0.45rem;
    border-bottom: 1px solid var(--rule);
    text-align: left;
    white-space: nowrap;
  }
  :global([data-ui="Designer"] .points th) {
    color: var(--ink-3);
    font-weight: 500;
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  :global([data-ui="Designer"] .points th.num),
:global([data-ui="Designer"] .points td.num) {
    text-align: right;
  }
  :global([data-ui="Designer"] .points [data-slot="input"]) {
    width: 5.5rem;
    text-align: right;
    font-family: var(--mono);
    padding: 0.15rem 0.35rem;
  }
  :global([data-ui="Designer"] .points tr.live td) {
    background: var(--accent-soft);
  }
  :global([data-ui="Designer"] .remove) {
    border: 0;
    background: transparent;
    color: var(--ink-3);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0 0.3rem;
  }
  :global([data-ui="Designer"] .remove:hover) {
    color: var(--alert);
  }
  :global([data-ui="Designer"] .readout) {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.25rem;
    align-items: center;
    margin-top: 0.6rem;
    font-size: 0.85rem;
    color: var(--ink-2);
  }
  :global([data-ui="Designer"] .muted) {
    color: var(--ink-3);
  }

  :global([data-ui="Designer"] .row) {
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem;
    margin: .75rem 0;
  }
  :global([data-ui="Designer"] .label) {
    font-size: var(--step-0);
    color: var(--ink-3);
  }
  :global([data-ui="Designer"] .slider) {
    display: grid;
    grid-template-columns: 2.4rem minmax(0, 1fr) 7.5rem;
    grid-template-areas:
      'sym name value'
      'sym range value';
    align-items: center;
    column-gap: 0.6rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--rule);
  }
  :global([data-ui="Designer"] .slider.disabled) {
    opacity: 0.5;
  }
  :global([data-ui="Designer"] .slider .sym) {
    grid-area: sym;
    color: var(--ink-2);
    font-weight: 600;
  }
  :global([data-ui="Designer"] .slider .name) {
    grid-area: name;
    font-size: 0.78rem;
    color: var(--ink-3);
  }
  :global([data-ui="Designer"] .slider [data-slot="input"][type='range']) {
    grid-area: range;
    width: 100%;
    accent-color: var(--link);
    margin: 0.2rem 0 0;
  }
  :global([data-ui="Designer"] .slider .value) {
    grid-area: value;
    display: inline-flex;
    align-items: baseline;
    gap: 0.3rem;
    justify-self: end;
  }
  :global([data-ui="Designer"] .slider .value [data-slot="input"]) {
    width: 5.2rem;
    text-align: right;
    font-family: var(--mono);
  }
  :global([data-ui="Designer"] .unit) {
    font-size: 0.75rem;
    color: var(--ink-3);
  }
  :global([data-ui="Designer"] .derived) {
    display: grid;
    grid-template-columns: 2.4rem 1fr;
    gap: 0.25rem 0.6rem;
    margin: 0.9rem 0 0;
    font-size: var(--step-0);
  }
  :global([data-ui="Designer"] .derived dt) {
    color: var(--ink-2);
    font-weight: 600;
  }
  :global([data-ui="Designer"] .derived dd) {
    margin: 0;
  }
  :global([data-ui="Designer"] .bad) {
    color: var(--alert);
  }
  :global([data-ui="Designer"] .notes) {
    margin: 0.6rem 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.82rem;
  }
  :global([data-ui="Designer"] .notes li) {
    padding: 0.35rem 0.6rem;
    border-left: 3px solid var(--warn);
    background: var(--surface-2);
    border-radius: 0 6px 6px 0;
    color: var(--ink-2);
  }

  :global([data-ui="Designer"] .record) {
    margin-top: 1.25rem;
  }
  :global([data-ui="Designer"] .fields) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.6rem 1rem;
  }
  :global([data-ui="Designer"] .fields [data-slot="label"]) {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.78rem;
    color: var(--ink-3);
  }
  :global([data-ui="Designer"] .actions) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    margin: 1rem 0 0.5rem;
  }
  :global([data-ui="Designer"] .note) {
    margin: 0.5rem 0 0;
    font-size: 0.82rem;
    color: var(--ink-2);
    max-width: 80ch;
  }
  :global([data-ui="Designer"] details) {
    margin-top: 0.75rem;
    font-size: 0.85rem;
  }
  :global([data-ui="Designer"] .json) {
    font-size: 0.72rem;
    max-height: 22rem;
    overflow: auto;
    padding: 0.75rem;
    background: var(--surface-2);
    border-radius: var(--panel-radius);
  }
  :global([data-ui="Designer"] .foot) {
    margin-top: 2rem;
    color: var(--ink-2);
    font-size: var(--step-0);
  }
  }
</style>
