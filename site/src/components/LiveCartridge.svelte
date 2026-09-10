<script lang="ts">
  import { Label } from '$lib/components/ui/label/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { NativeSelect } from '$lib/components/ui/native-select/index.js';
  import { Button as ShadcnButton } from '$lib/components/ui/button/index.js';

  /**
   * Drag the bullet to redraw the cartridge.
   *
   * The bullet moves as a rigid body - its length and nose are the record's default bullet, and
   * dragging changes where it sits, so the seating depth and the overall length move together.
   * Under it, a charge: entered by weight, turned into a settled volume by the powder's bulk
   * density, and drawn as how far it fills the space the bullet leaves. Every figure here is
   * geometry: the case interior the renderer derives, the bullet's silhouette, a bulk density.
   * **Nothing here is load data**, and the page says so; the thresholds below are documented in
   * `lib/data/powders.ts` with their sources.
   */
  import LiveChamber from './LiveChamber.svelte';
  import LiveDrawing from './LiveDrawing.svelte';
  import { type Profile } from '@lib/geom';
import { profilesFor } from '@lib/geometry';
import {
  caseInnerProfile,
  fillLevel,
  revolvedVolume,
  usableVolume
} from '@lib/measure2d';
import {
  bulletOuterProfile,
  exposedProfile,
  GRAINS_H2O_PER_MM3,
  shiftBullet,
  type CartridgeRecord
} from '@lib/shapes2d';
  import { t } from '../lib/i18n.svelte';
  import { chargeVolumeMm3, FILL, POWDERS, type Powder } from '@lib/data';
  import { PX_PER_MM } from '@lib/core';

  interface Props {
    record: CartridgeRecord;
  }
  let { record }: Props = $props();

  const GRAIN_G = 0.06479891;

  /** The record's default round, built once; the drag moves its bullet. */
  const base = $derived.by(() => {
    try {
      return profilesFor(record);
    } catch {
      return null;
    }
  });
  const inner = $derived.by((): Profile | null => {
    if (!base) return null;
    try {
      return caseInnerProfile(base.case);
    } catch {
      return null;
    }
  });

  let seating = $state<number | null>(null);
  let chargeGrains = $state(0);
  let unit = $state<'gr' | 'g'>('gr');
  let powderIndex = $state(0);
  let panelWidth = $state(0);
  let showChamber = $state(false);
  let showDimensions = $state(false);

  const defaultSeating = $derived(base?.bullet?.seatingDepth ?? null);
  const seatingNow = $derived(seating ?? defaultSeating ?? 0);
  const powder = $derived<Powder>(POWDERS[powderIndex] ?? POWDERS[0]!);

  const bullet = $derived.by(() => {
    if (!base?.bullet || defaultSeating == null) return null;
    return shiftBullet(base.bullet, defaultSeating - seatingNow);
  });
  const bulletProfile = $derived(bullet ? bulletOuterProfile(bullet) : null);
  const exposed = $derived(bullet && base ? exposedProfile(bullet, base.case.mouth.z) : null);
  const mouthZ = $derived(base?.case.mouth.z ?? 0);
  const floorZ = $derived(base?.case.cavityFloorZ ?? 0);
  const calibre = $derived(base?.case.mouth.insideDiameter ?? 1);
  const L6 = $derived(record.cartridge.lengths?.L6 ?? null);

  const capacity = $derived(inner ? revolvedVolume(inner) : 0);
  /** The references' figure the interior is held to, where the record carries one. */
  const published = $derived(record.annotations?.publishedCapacity ?? null);
  const usable = $derived(inner ? usableVolume(inner, bullet, bulletProfile, mouthZ) : 0);
  const chargeVolume = $derived(chargeGrains > 0 ? chargeVolumeMm3(chargeGrains, powder) : 0);
  const fill = $derived(usable > 0 ? (chargeVolume / usable) * 100 : 0);
  const level = $derived(inner && chargeVolume > 0 ? fillLevel(inner, bullet, bulletProfile, mouthZ, chargeVolume) : null);

  /** The drag's bounds: the base may reach the floor and the bullet may all but leave the case. */
  const minSeating = $derived(0.5);
  const maxSeating = $derived(Math.max(1, mouthZ - floorZ - 0.5));

  type Severity = 'error' | 'warning' | 'caution' | 'note';
  const findings = $derived.by((): { severity: Severity; text: string }[] => {
    const out: { severity: Severity; text: string }[] = [];
    if (!base || !bullet) return out;
    const c = base.case;
    const gr = (mm3: number) => (mm3 * GRAINS_H2O_PER_MM3).toFixed(1);
    if (bullet.baseZ <= floorZ) out.push({ severity: 'error', text: t('live.baseOnFloor', { floor: floorZ.toFixed(2) }) });
    // What the case holds is the bearing surface inside it: from the shank's start (above a boat
    // tail or a heel) to the mouth, or to the shank's end if the ogive begins inside the case.
    const held = Math.min(bullet.cylinder.endZ, mouthZ) - Math.max(bullet.cylinder.startZ, floorZ);
    if (held <= 0) out.push({ severity: 'error', text: t('live.noGrip') });
    else if (held < 0.5 * calibre) {
      out.push({ severity: 'caution', text: t('live.littleGrip', { held: held.toFixed(2), calibres: (held / calibre).toFixed(2) }) });
    }
    if (L6 != null && bullet.tipZ > L6 + 0.005) {
      out.push({ severity: 'warning', text: t('live.overLength', { by: (bullet.tipZ - L6).toFixed(2), l6: L6.toFixed(2) }) });
    }
    if (c.shoulder && bullet.baseZ < c.shoulder.startZ) {
      out.push({ severity: 'caution', text: t('live.belowShoulder', { by: (c.shoulder.startZ - bullet.baseZ).toFixed(2) }) });
    }
    if (chargeVolume > 0 && inner) {
      if (chargeVolume > capacity) {
        out.push({ severity: 'error', text: t('live.overflows', { charge: gr(chargeVolume), capacity: gr(capacity) }) });
      } else if (fill > FILL.error) {
        out.push({ severity: 'error', text: t('live.tooCompressed', { fill: fill.toFixed(0), limit: FILL.error }) });
      } else if (fill > FILL.compressed) {
        out.push({ severity: 'warning', text: t('live.compressed', { fill: fill.toFixed(0) }) });
      } else if (fill > 100) {
        out.push({ severity: 'note', text: t('live.lightlyCompressed', { fill: fill.toFixed(0) }) });
      } else if (fill < FILL.veryLow) {
        out.push({ severity: 'warning', text: t('live.veryLowDensity', { fill: fill.toFixed(0) }) });
      } else if (fill < FILL.low) {
        out.push({ severity: 'caution', text: t('live.lowDensity', { fill: fill.toFixed(0), low: FILL.low }) });
      }
    }
    return out;
  });

  // ---- The drag -------------------------------------------------------------------------------

  let dragging = $state(false);
  let startX = 0;
  let startSeating = 0;

  /** Life size, or smaller where the panel is narrower than the round; up to twice life size. */
  const zoom = $derived.by(() => {
    if (!base || !panelWidth) return 1;
    const lengthMm = Math.max(mouthZ, bullet?.tipZ ?? 0) + 2 * 4;
    return Math.max(0.5, Math.min(2, (panelWidth - 24) / (lengthMm * PX_PER_MM)));
  });

  function clamp(value: number): number {
    return Math.min(maxSeating, Math.max(minSeating, value));
  }
  function down(event: PointerEvent) {
    if (!bullet) return;
    dragging = true;
    startX = event.clientX;
    startSeating = seatingNow;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (!dragging) return;
    // Landscape: +x on the page is +z along the round, and a bullet pushed forward is seated less.
    const dzMm = (event.clientX - startX) / (PX_PER_MM * zoom);
    seating = clamp(startSeating - dzMm);
  }
  function up() {
    dragging = false;
  }
  function setCoal(value: number) {
    if (!bullet) return;
    seating = clamp(seatingNow + (bullet.tipZ - value));
  }
  function charge(): number {
    return unit === 'gr' ? chargeGrains : chargeGrains * GRAIN_G;
  }
  function setCharge(value: number) {
    chargeGrains = Math.max(0, unit === 'gr' ? value : value / GRAIN_G);
  }
</script>
<div data-ui="LiveCartridge" class="contents">

{#if base && bullet && bulletProfile && defaultSeating != null}
  <section class="live" bind:clientWidth={panelWidth}>
    <h2>{t('live.title')}</h2>
    <p class="lede">{t('live.lede')}</p>

    <div
      class="stage"
      class:dragging
      role="slider"
      tabindex={0}
      aria-label={t('live.seating')}
      aria-valuemin={minSeating}
      aria-valuemax={maxSeating}
      aria-valuenow={seatingNow}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      onkeydown={(e) => {
        if (e.key === 'ArrowLeft') seating = clamp(seatingNow + 0.1);
        if (e.key === 'ArrowRight') seating = clamp(seatingNow - 0.1);
      }}
    >
      <LiveDrawing profiles={base} {bullet} {bulletProfile} {inner} powderLevelZ={level} {zoom} dimensions={showDimensions} />
    </div>

    <div class="controls">
      <Label>
        <span class="eyebrow">{t('live.seating')} <span class="unit">mm</span></span>
        <Input type="number" step="0.05" min={minSeating} max={maxSeating} value={seatingNow.toFixed(2)}
          onchange={(e) => (seating = clamp(Number(e.currentTarget.value)))} />
      </Label>
      <Label>
        <span class="eyebrow">{t('live.overall')} <span class="unit">mm</span></span>
        <Input type="number" step="0.05" value={bullet.tipZ.toFixed(2)} onchange={(e) => setCoal(Number(e.currentTarget.value))} />
      </Label>
      <Label>
        <span class="eyebrow">{t('live.powder')}</span>
        <NativeSelect bind:value={powderIndex}>
          {#each POWDERS as p, i (p.name)}
            <option value={i}>{p.name} · {p.density.toFixed(2)} g/cm³</option>
          {/each}
        </NativeSelect>
      </Label>
      <Label>
        <span class="eyebrow">{t('live.charge')}</span>
        <span class="row">
          <Input type="number" step={unit === 'gr' ? 0.1 : 0.01} min="0" value={charge().toFixed(unit === 'gr' ? 1 : 3)}
            onchange={(e) => setCharge(Number(e.currentTarget.value))} />
          <NativeSelect bind:value={unit}>
            <option value="gr">gr</option>
            <option value="g">g</option>
          </NativeSelect>
        </span>
      </Label>
      <ShadcnButton variant="outline" type="button" class="reset" onclick={() => { seating = null; chargeGrains = 0; }}>{t('live.reset')}</ShadcnButton>
    </div>

    <dl class="figures">
      <dt>{t('live.seating')}</dt>
      <dd class="num">{seatingNow.toFixed(2)} mm <span class="muted">({t('live.default')} {defaultSeating.toFixed(2)})</span></dd>
      <dt>{t('live.overall')}</dt>
      <dd class="num">{bullet.tipZ.toFixed(2)} mm{#if L6 != null} <span class="muted">(L6 {L6.toFixed(2)})</span>{/if}</dd>
      <dt>{t('live.capacity')}</dt>
      <dd class="num">{(capacity * GRAINS_H2O_PER_MM3).toFixed(1)} gr H₂O <span class="muted">({capacity.toFixed(0)} mm³)</span>
        {#if published}<span class="muted"> · {t('live.published', { value: published.grH2O.toFixed(1), source: published.source ?? '' })}</span>{/if}</dd>
      <dt>{t('live.usable')}</dt>
      <dd class="num">{(usable * GRAINS_H2O_PER_MM3).toFixed(1)} gr H₂O <span class="muted">({usable.toFixed(0)} mm³)</span></dd>
      {#if chargeVolume > 0}
        <dt>{t('live.fill')}</dt>
        <dd class="num">{fill.toFixed(0)} % <span class="muted">({chargeVolume.toFixed(0)} mm³ {t('live.of')} {usable.toFixed(0)})</span></dd>
      {/if}
    </dl>

    <Label class="flex flex-row items-center toggle">
      <input type="checkbox" bind:checked={showDimensions} />
      {t('live.dimensions')}
    </Label>
    <Label class="flex flex-row items-center toggle">
      <input type="checkbox" bind:checked={showChamber} />
      {t('fit.show')}
    </Label>
    {#if showChamber}
      {#if base.chamber && base.chamberProfile}
        <LiveChamber profiles={base} {bullet} {bulletProfile} {exposed} chamber={base.chamber} bore={base.chamberProfile} {zoom} />
      {:else}
        <p class="note">{t('fit.noChamber')}</p>
      {/if}
    {/if}

    {#if findings.length}
      <ul class="findings">
        {#each findings as finding (finding.text)}
          <li class={finding.severity}>{finding.text}</li>
        {/each}
      </ul>
    {/if}
    <p class="note">{t('live.disclaimer')}</p>
  </section>
{/if}

</div>
<style>
  @layer legacy {
  :global([data-ui="LiveCartridge"] .live) {
    margin: var(--section-gap) 0 0;
    padding: var(--panel-padding);
    border: 1px solid var(--rule);
    border-radius: var(--panel-radius);
    background: var(--surface);
  }
  :global([data-ui="LiveCartridge"] h2) {
    font-size: var(--step-1);
    margin: 0 0 0.3rem;
  }
  :global([data-ui="LiveCartridge"] .lede),
:global([data-ui="LiveCartridge"] .note) {
    margin: 0 0 1rem;
    font-size: 0.82rem;
    color: var(--ink-2);
    max-width: 70ch;
  }
  :global([data-ui="LiveCartridge"] .stage) {
    overflow-x: auto;
    padding: 0.75rem 0;
    cursor: ew-resize;
    touch-action: pan-y;
    user-select: none;
    border-radius: var(--radius);
  }
  :global([data-ui="LiveCartridge"] .stage:focus-visible) {
    outline: 2px solid var(--link);
  }
  :global([data-ui="LiveCartridge"] .stage.dragging) {
    cursor: grabbing;
  }
  :global([data-ui="LiveCartridge"] .controls) {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    align-items: end;
    margin: 0.5rem 0 1rem;
  }
  :global([data-ui="LiveCartridge"] .controls [data-slot="label"]) {
    display: flex;
    flex-direction: column;
    gap: var(--field-gap);
    flex: 1 1 10rem;
    min-width: 0;
    max-width: 100%;
  }
  :global([data-ui="LiveCartridge"] .controls [data-slot="input"][type='number']) {
    width: 100%;
  }
  :global([data-ui="LiveCartridge"] .row) {
    display: flex;
    gap: 0.3rem;
  }
  :global([data-ui="LiveCartridge"] .row [data-slot="input"]) { flex: 1; }
  :global([data-ui="LiveCartridge"] .row [data-slot="native-select"]) { flex: 0 0 4.5rem; }
  :global([data-ui="LiveCartridge"] .toggle + .toggle) { margin-left: 1rem; }
  :global([data-ui="LiveCartridge"] .unit) {
    text-transform: none;
    letter-spacing: 0;
    color: var(--ink-3);
  }
  :global([data-ui="LiveCartridge"] .reset) {
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink-2);
    font-size: var(--step-0);
  }
  :global([data-ui="LiveCartridge"] .figures) {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.2rem 1rem;
    margin: 0 0 0.75rem;
    font-size: var(--step-0);
  }
  :global([data-ui="LiveCartridge"] .figures dt) {
    color: var(--ink-3);
  }
  :global([data-ui="LiveCartridge"] .figures dd) {
    margin: 0;
  }
  :global([data-ui="LiveCartridge"] .muted) {
    color: var(--ink-3);
    font-size: 0.85em;
  }
  :global([data-ui="LiveCartridge"] .toggle) {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0 0 0.75rem;
    font-size: var(--step-0);
    color: var(--ink-2);
  }
  :global([data-ui="LiveCartridge"] .findings) {
    margin: 0 0 0.75rem;
    padding: 0;
    list-style: none;
    font-size: var(--step-0);
  }
  :global([data-ui="LiveCartridge"] .findings li) {
    padding: 0.35rem 0.6rem;
    margin: 0.25rem 0;
    border-left: 3px solid var(--rule-strong);
    background: var(--surface-2);
  }
  :global([data-ui="LiveCartridge"] .findings li.error) {
    border-color: var(--alert);
    color: var(--alert);
  }
  :global([data-ui="LiveCartridge"] .findings li.warning) {
    border-color: var(--warn);
    color: var(--warn);
  }
  :global([data-ui="LiveCartridge"] .findings li.caution) {
    border-color: var(--link);
  }
  :global([data-ui="LiveCartridge"] .findings li.note) {
    color: var(--ink-2);
  }
  }
</style>
