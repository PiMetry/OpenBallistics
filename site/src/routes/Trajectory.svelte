<script lang="ts">
  import ScaleRuler from '../components/ScaleRuler.svelte';
  import { Label } from '$lib/components/ui/label/index.js';
  import { NativeSelect } from '$lib/components/ui/native-select/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Button as ShadcnButton } from '$lib/components/ui/button/index.js';

  import PageHeader from '../components/PageHeader.svelte';
  /**
   * The come-up table: the page Phase B was written for.
   *
   * It computes nothing itself. `@lib/ballistics` flies the shot, `@lib/optics` turns the drop
   * into clicks, and everything here is about making the inputs honest and the output readable.
   *
   * Input and output handling:
   *
   * - **A solver that refuses is not a broken one.** No ballistic coefficient, a range the bullet
   *   cannot reach, a transonic anchor - each throws, and each message is written for the user.
   *   They are shown as answers, not as errors.
   * - **Nothing here is dialled without its conditions.** The air, the drag model and where the
   *   muzzle velocity came from are stated under the table, because a come-up table without them
   *   is a number with no claim attached.
   * - **The transonic band is marked on the row that has it**, rather than the table quietly
   *   ending or quietly continuing.
   */
  import { bullets, type BulletEntry } from '../lib/bullets';
  import { t } from '../lib/i18n.svelte';
  import { href } from '../lib/router';
  import * as rifles from '../lib/records.svelte';
  import {
    GEE_TOLERANCE_M,
    STANDARD_METRO,
    STANDARD_SEA_LEVEL,
    millerStability,
    pointBlankZero,
    solve,
    type Atmosphere,
    type Shot
  } from '@lib/ballistics';
  import {
    PATTERNS,
    comeUpTable,
    reticleSvg,
    toAngularUnit,
    type Mark,
    type PatternName,
    type Reticle,
    type Turret
  } from '@lib/optics';
  import { newId, type StoredReticle } from '@lib/userdata';
  import { readNumberPref, readPref, writePref } from '../lib/prefs';

  /** Only bullets the solver can actually use: a record without a coefficient is not solvable. */
  const solvable = bullets.filter((b) => b.g7 !== null || b.g1 !== null);

  let rifleId = $state('');
  let bulletKey = $state(solvable[0]?.key ?? '');
  let preferG7 = $state(true);
  let muzzleVelocity = $state('');
  let air = $state<'metro' | 'icao' | 'custom'>('metro');
  let temperatureC = $state('15');
  let pressureHpa = $state('1013');
  let humidityPct = $state('50');
  let windMps = $state('0');
  let windDeg = $state('90');
  let lookAngleDeg = $state('0');
  // Never assume a latitude, so an empty box means the
  // Coriolis term is left out rather than computed for somewhere the shooter is not.
  let latitudeDeg = $state('');
  let azimuthDeg = $state('');
  let maxRangeM = $state('800');
  let stepM = $state('100');
  // Preferences, not records: per-device settings that make the page come back as it was left.
  // localStorage for these, IndexedDB for anything that goes in the
  // export. A blocked browser simply gets the defaults.
  const PATTERN_NAMES = ['crosshair', 'duplex', 'dotGrid', 'hashGrid'] as const;

  let geeToleranceCm = $state(String(readNumberPref('gee.tolerance', GEE_TOLERANCE_M * 100, 0.1, 50)));
  let pattern = $state<PatternName>(readPref('reticle.pattern', PATTERN_NAMES, 'dotGrid'));
  let focalPlane = $state<'FFP' | 'SFP'>(readPref('reticle.plane', ['FFP', 'SFP'] as const, 'FFP'));
  let ratedMagnification = $state('20');
  let magnification = $state('20');
  let reticleReach = $state('6');
  let reticleName = $state('');
  /** The marks on screen: a generic pattern, or a saved reticle's own geometry. */
  let ownMarks = $state<Mark[] | null>(null);

  $effect(() => writePref('reticle.pattern', pattern));
  $effect(() => writePref('reticle.plane', focalPlane));
  $effect(() => {
    const value = num(geeToleranceCm);
    if (value !== undefined) writePref('gee.tolerance', value);
  });

  const rifle = $derived(rifles.state.rifles.find((r) => r.id === rifleId));
  const bullet = $derived<BulletEntry | undefined>(solvable.find((b) => b.key === bulletKey));

  // G7 where the record has one and the user has not asked otherwise:
  // a G7 coefficient holds far better across the velocity range for a modern boat-tail, and the
  // two are never converted into one another.
  const model = $derived<'G1' | 'G7'>(preferG7 && bullet?.g7 != null ? 'G7' : 'G1');
  const bcValue = $derived(model === 'G7' ? bullet?.g7 : bullet?.g1);

  const num = (s: string): number | undefined => {
    const v = Number(s);
    return s.trim() !== '' && Number.isFinite(v) ? v : undefined;
  };

  const atmosphere = $derived<Atmosphere>(
    air === 'metro'
      ? STANDARD_METRO
      : air === 'icao'
        ? STANDARD_SEA_LEVEL
        : {
            temperatureC: num(temperatureC) ?? 15,
            pressurePa: (num(pressureHpa) ?? 1013) * 100,
            humidity: (num(humidityPct) ?? 0) / 100
          }
  );

  const turret = $derived<Turret>({
    unit: rifle?.scope?.clickUnit ?? 'mrad',
    clickValue: rifle?.scope?.clickValue ?? 0.1
  });

  /** The velocity the solve will use, and whether it was measured or merely typed here. */
  const velocity = $derived(num(muzzleVelocity) ?? rifle?.muzzleVelocity?.value);
  const velocityMeasured = $derived(
    num(muzzleVelocity) === undefined && rifle?.muzzleVelocity?.source.kind === 'measured'
  );

  const ranges = $derived.by(() => {
    const max = num(maxRangeM) ?? 0;
    const step = num(stepM) ?? 100;
    if (!(max > 0 && step > 0)) return [];
    const out: number[] = [];
    for (let r = step; r <= max + 1e-9; r += step) out.push(Math.round(r));
    return out;
  });

  /**
   * The stability factor, if the rifle records enough to compute one.
   *
   * Without a twist, a twist direction and a bullet length there is no stability number, and the
   * come-up table then omits spin drift and says which input was missing. Nothing is assumed.
   */
  const stability = $derived.by(() => {
    if (!rifle?.barrel.twistMm || !bullet?.length || !velocity) return undefined;
    try {
      return millerStability({
        massKg: bullet.mass / 1000,
        diameterM: bullet.diameter / 1000,
        lengthM: bullet.length / 1000,
        barrel: { twistM: rifle.barrel.twistMm / 1000, hand: rifle.barrel.twistHand ?? 'right' },
        muzzleVelocity: velocity,
        temperatureC: atmosphere.temperatureC,
        pressurePa: atmosphere.pressurePa
      });
    } catch {
      return undefined;
    }
  });

  const crosswind = $derived.by(() => {
    const speed = num(windMps) ?? 0;
    const deg = num(windDeg) ?? 0;
    return speed * Math.sin((deg * Math.PI) / 180);
  });

  type Result =
    | {
        ok: true;
        table: ReturnType<typeof comeUpTable>;
        model: string;
        /** What the *solver* left out, as distinct from what the come-up table left out. */
        omitted: readonly string[];
      }
    | { ok: false; message: string };

  /** One shot, built once: the table and the GEE must not be able to disagree about the inputs. */
  const shot = $derived.by((): Shot | undefined => {
    if (!rifle || !bullet || bcValue == null || !velocity) return undefined;
    return {
      bullet: {
        massKg: bullet.mass / 1000,
        diameterM: bullet.diameter / 1000,
        lengthM: bullet.length ? bullet.length / 1000 : undefined,
        bc: { value: bcValue, model }
      },
      muzzleVelocity: velocity,
      sightHeightM: (rifle.scope?.heightOverBoreMm ?? 38) / 1000,
      zeroDistanceM: rifle.scope?.zeroDistanceM ?? 100,
      air: atmosphere,
      wind: { speedMps: num(windMps) ?? 0, directionDeg: num(windDeg) ?? 0 },
      lookAngleDeg: num(lookAngleDeg) ?? 0,
      latitudeDeg: num(latitudeDeg),
      azimuthDeg: num(azimuthDeg)
    };
  });

  /**
   * The most favourable zero, which is a different question from the come-up table above it.
   *
   * The table answers "what do I dial for this rifle as it is zeroed now"; this answers "where
   * should it be zeroed at all". It re-solves with its own zero, so it deliberately ignores the
   * rifle's recorded one - that is the point of it.
   */
  const gee = $derived.by(() => {
    const s = shot;
    if (!s) return undefined;
    const tolerance = (num(geeToleranceCm) ?? 4) / 100;
    try {
      return { ok: true as const, band: pointBlankZero(s, tolerance) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
    }
  });

  const result = $derived.by((): Result | undefined => {
    if (!shot || !ranges.length) return undefined;
    try {
      const solved = solve(shot, ranges);
      return {
        ok: true,
        model: solved.model,
        omitted: solved.omitted,
        table: comeUpTable(solved.points, {
          turret,
          stability,
          twistHand: rifle?.barrel.twistHand,
          bulletLengthM: bullet?.length ? bullet.length / 1000 : undefined,
          crosswindMps: crosswind
        })
      };
    } catch (error) {
      // A refusal is the answer, and its message was written for this user to read.
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  });

  /**
   * The reticle the holds are drawn on.
   *
   * Its unit is the rifle's turret unit rather than a choice of its own: a reticle marked in one
   * unit over turrets in another is a real configuration, but showing holds in a unit the user
   * cannot dial would be inventing a third one.
   */
  const reticle = $derived<Reticle>({
    id: 'preview',
    name: t(`reticle.${pattern}`),
    focalPlane,
    ratedMagnification: focalPlane === 'SFP' ? (num(ratedMagnification) ?? 20) : undefined,
    unit: turret.unit
  });

  /** How much more angle each mark covers than it says. 1 on an FFP scope, and at rated power. */
  const sfpFactor = $derived.by(() => {
    if (focalPlane !== 'SFP') return 1;
    const rated = num(ratedMagnification) ?? 20;
    const using = num(magnification) ?? rated;
    return using > 0 ? rated / using : 1;
  });

  const reticlePicture = $derived.by(() => {
    if (!result?.ok) return undefined;
    const reach = num(reticleReach) ?? 6;
    // A saved reticle brings its own marks; otherwise a generic pattern. A mark spacing of one
    // unit is the classic grid, and the turret unit decides what "one" is.
    const marks = ownMarks ?? PATTERNS[pattern]({ reach, spacing: turret.unit === 'moa' ? 2 : 1 });
    try {
      return reticleSvg(reticle, marks, {
        sizePx: 460,
        reach,
        magnification: focalPlane === 'SFP' ? (num(magnification) ?? undefined) : undefined,
        holds: result.table.rows.map((row) => ({
          rangeM: row.rangeM,
          elevationRad: row.elevationRad,
          windageRad: row.windRad + (row.spinDriftRad ?? 0)
        }))
      });
    } catch (error) {
      // A refusal here is the SFP one, and it is worth reading rather than swallowing.
      return error instanceof Error ? error.message : String(error);
    }
  });

  async function saveReticle() {
    const reach = num(reticleReach) ?? 6;
    const marks = ownMarks ?? PATTERNS[pattern]({ reach, spacing: turret.unit === 'moa' ? 2 : 1 });
    const now = new Date().toISOString();
    const stored: StoredReticle = {
      id: newId('ret'),
      name: reticleName.trim() || t(`reticle.${pattern}`),
      focalPlane,
      ratedMagnification: focalPlane === 'SFP' ? (num(ratedMagnification) ?? 20) : undefined,
      unit: turret.unit,
      marks: marks as unknown[],
      // The user's own reading of their own glass. Never `published`: B.3 again.
      origin: 'measured',
      created: now,
      updated: now
    };
    await rifles.saveReticle(stored);
    reticleName = '';
  }

  function useReticle(saved: StoredReticle) {
    ownMarks = saved.marks as Mark[];
    focalPlane = saved.focalPlane;
    if (saved.ratedMagnification) ratedMagnification = String(saved.ratedMagnification);
    reticleName = saved.name;
  }

  const unitLabel = $derived(turret.unit === 'moa' ? 'MOA' : 'MRAD');
  const fixed = (value: number, places: number) => value.toFixed(places);
</script>
<div data-ui="Trajectory" class="contents">

<PageHeader description={t('trajectory.lede')} title={t('trajectory.title')} backHref={href.preview()} backLabel={t('preview.back')} eyebrow={t('preview.badge')} />
<p class="notice">{t('preview.trajectoryNote')}</p>

{#if !rifles.state.rifles.length}
  <p class="notice">
    {t('trajectory.needRifle')}
    <a href={href.rifles()}>{t('rifles.nav')}</a>
  </p>
{:else}
  <form class="inputs" onsubmit={(e) => e.preventDefault()}>
    <Label>
      {t('trajectory.rifle')}
      <NativeSelect bind:value={rifleId}>
        <option value="">-</option>
        {#each rifles.state.rifles as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
      </NativeSelect>
    </Label>

    <Label>
      {t('trajectory.bullet')}
      <NativeSelect bind:value={bulletKey}>
        {#each solvable as b (b.key)}<option value={b.key}>{b.manufacturer} {b.name}</option>{/each}
      </NativeSelect>
    </Label>

    <Label class="flex flex-row items-center check">
      <input type="checkbox" bind:checked={preferG7} disabled={bullet?.g7 == null} />
      {t('trajectory.preferG7')}
    </Label>

    <Label>
      {t('trajectory.muzzleVelocity')} (m/s)
      <Input
        bind:value={muzzleVelocity}
        inputmode="decimal"
        placeholder={rifle?.muzzleVelocity ? String(rifle.muzzleVelocity.value) : ''}
      />
    </Label>

    <Label>
      {t('trajectory.air')}
      <NativeSelect bind:value={air}>
        <option value="metro">{t('trajectory.airMetro')}</option>
        <option value="icao">{t('trajectory.airIcao')}</option>
        <option value="custom">{t('trajectory.airCustom')}</option>
      </NativeSelect>
    </Label>

    {#if air === 'custom'}
      <Label>{t('trajectory.temperature')} (°C)<Input bind:value={temperatureC} inputmode="decimal" /></Label>
      <Label>{t('trajectory.pressure')} (hPa)<Input bind:value={pressureHpa} inputmode="decimal" /></Label>
      <Label>{t('trajectory.humidity')} (%)<Input bind:value={humidityPct} inputmode="decimal" /></Label>
    {/if}

    <Label>{t('trajectory.wind')} (m/s)<Input bind:value={windMps} inputmode="decimal" /></Label>
    <Label>{t('trajectory.windDirection')} (°)<Input bind:value={windDeg} inputmode="decimal" /></Label>
    <Label>{t('trajectory.lookAngle')} (°)<Input bind:value={lookAngleDeg} inputmode="decimal" /></Label>
    <Label>{t('trajectory.latitude')}<Input bind:value={latitudeDeg} inputmode="decimal" /></Label>
    <Label>{t('trajectory.azimuth')}<Input bind:value={azimuthDeg} inputmode="decimal" /></Label>
    <Label>{t('trajectory.maxRange')} (m)<Input bind:value={maxRangeM} inputmode="decimal" /></Label>
    <Label>{t('trajectory.step')} (m)<Input bind:value={stepM} inputmode="decimal" /></Label>
  </form>
  {#if bullet?.sample}<p class="notice">{t('bullets.sampleNote')}</p>{/if}

  <!--
    The reticle's unit is not recorded anywhere yet - that is Phase B.3 - so this cannot be the
    real mismatch check that `unitsMatch` in `@lib/optics` exists for. Until a reticle is a record,
    the honest version is conditional and aimed at the configuration where the mistake happens: MOA
    turrets, which is where a mil hold read off the glass gets dialled as if it were minutes.
  -->
  {#if rifle && turret.unit === 'moa'}
    <p class="notice loud">{t('trajectory.unitMismatch')}</p>
  {/if}

  {#if gee}
    <section class="gee">
      <h2>{t('gee.title')}</h2>
      <p class="lede">{t('gee.lede')}</p>
      <Label class="tolerance">
        {t('gee.tolerance')}
        <Input bind:value={geeToleranceCm} inputmode="decimal" size={4} />
      </Label>
      {#if !gee.ok}
        <p class="notice">{gee.message}</p>
      {:else}
        <dl class="band">
          <dt>{t('gee.zeroAt')}</dt>
          <dd class="big">{fixed(gee.band.zeroDistanceM, 0)} m</dd>
          <dt>{t('gee.far')}</dt>
          <dd class="big">{fixed(gee.band.farDistanceM, 0)} m</dd>
          <dt>{t('gee.at100')}</dt>
          <dd class="big">+{fixed(gee.band.heightAt100M * 100, 1)} cm</dd>
          <dt>{t('gee.near')}</dt>
          <dd>
            {gee.band.nearDistanceM === 0
              ? t('gee.fromMuzzle')
              : `${fixed(gee.band.nearDistanceM, 0)} m`}
          </dd>
          <dt>{t('gee.apex')}</dt>
          <dd>+{fixed(gee.band.apexHeightM * 100, 1)} cm @ {fixed(gee.band.apexM, 0)} m</dd>
        </dl>
        <p class="hint">{t('gee.at100Note')}</p>
        {#if gee.band.transonic}
          <p class="notice">{t('gee.transonic')}</p>
        {/if}
        <p class="hint">{t('gee.caveat')}</p>
      {/if}
    </section>
  {/if}

  {#if !result}
    <p class="empty">{t('trajectory.incomplete')}</p>
  {:else if !result.ok}
    <p class="notice loud">{result.message}</p>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to pan the result table.) -->
    <div class="scroll" role="region" aria-label={t('trajectory.title')} tabindex={0}>
      <table>
        <thead>
          <tr>
            <th>{t('trajectory.range')}</th>
            <th>{t('trajectory.velocity')}</th>
            <th>{t('trajectory.mach')}</th>
            <th>{t('trajectory.energy')}</th>
            <th>{t('trajectory.drop')}</th>
            <th>{t('trajectory.elevation')} ({unitLabel})</th>
            <th>{t('trajectory.clicks')}</th>
            <th>{t('trajectory.residual')}</th>
            <th>{t('trajectory.windage')} ({unitLabel})</th>
            <th>{t('trajectory.windClicks')}</th>
          </tr>
        </thead>
        <tbody>
          {#each result.table.rows as row (row.rangeM)}
            <tr class:transonic={row.transonic}>
              <td>{row.rangeM}</td>
              <td>{fixed(row.velocityMps, 0)}</td>
              <td>{fixed(row.mach, 2)}</td>
              <td>{fixed(row.energyJ, 0)}</td>
              <td>{fixed(row.dropM * 100, 1)}</td>
              <td>{fixed(toAngularUnit(row.elevationRad, turret.unit), 2)}</td>
              <td class="clicks">{row.elevation.clicks}</td>
              <td>{fixed(row.elevationResidualM * 100, 1)}</td>
              <td>{fixed(toAngularUnit(row.windRad + (row.spinDriftRad ?? 0), turret.unit), 2)}</td>
              <td class="clicks">{row.windage.clicks}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <section class="reticle">
      <h2>{t('reticle.title')}</h2>
      <p class="lede">{t('reticle.lede')}</p>
      <div class="controls">
        <Label>
          {t('reticle.pattern')}
          <NativeSelect bind:value={pattern}>
            <option value="crosshair">{t('reticle.crosshair')}</option>
            <option value="duplex">{t('reticle.duplex')}</option>
            <option value="dotGrid">{t('reticle.dotGrid')}</option>
            <option value="hashGrid">{t('reticle.hashGrid')}</option>
          </NativeSelect>
        </Label>
        <Label>
          {t('reticle.focalPlane')}
          <NativeSelect bind:value={focalPlane}>
            <option value="FFP">{t('reticle.ffp')}</option>
            <option value="SFP">{t('reticle.sfp')}</option>
          </NativeSelect>
        </Label>
        {#if focalPlane === 'SFP'}
          <Label>{t('reticle.rated')}<Input bind:value={ratedMagnification} inputmode="decimal" size={4} /></Label>
          <Label>{t('reticle.magnification')}<Input bind:value={magnification} inputmode="decimal" size={4} /></Label>
        {/if}
        <Label>{t('reticle.reach')} ({unitLabel})<Input bind:value={reticleReach} inputmode="decimal" size={4} /></Label>
      </div>

      <div class="controls">
        <Label class="grow">
          {t('reticle.nameIt')}
          <Input bind:value={reticleName} placeholder={t('reticle.namePlaceholder')} />
        </Label>
        <ShadcnButton variant="outline" type="button" onclick={saveReticle}>{t('reticle.save')}</ShadcnButton>
      </div>
      <p class="hint">{t('reticle.savedNote')}</p>

      {#if rifles.state.reticles.length}
        <h3>{t('reticle.saved')}</h3>
        <ul class="saved">
          {#each rifles.state.reticles as saved (saved.id)}
            <li>
              <span class="grow">
                {saved.name}
                <span class="quiet">
                  {saved.unit === 'moa' ? 'MOA' : 'MRAD'}, {saved.focalPlane}{saved.ratedMagnification
                    ? ` @ ${saved.ratedMagnification}x`
                    : ''}
                </span>
              </span>
              <ShadcnButton variant="outline" type="button" onclick={() => useReticle(saved)}>{t('reticle.use')}</ShadcnButton>
              <ShadcnButton variant="outline" type="button" onclick={() => rifles.removeReticle(saved.id)}
                >{t('reticle.remove')}</ShadcnButton
              >
            </li>
          {/each}
        </ul>
      {/if}

      {#if focalPlane === 'SFP' && Math.abs(sfpFactor - 1) > 0.001}
        <p class="notice loud">
          {t('reticle.sfpWarning').replace('{factor}', String(Math.round(sfpFactor * 100) / 100))}
        </p>
      {/if}

      {#if typeof reticlePicture === 'string' && reticlePicture.startsWith('<svg')}
        <!--
          `@html` is safe here and only here: the markup comes from `reticleSvg`, which builds it
          from numbers it rounds itself and escapes the one string it takes. Nothing a user types
          reaches it unescaped, and no fetched content reaches it at all.
        -->
        <div class="glass">{@html reticlePicture}</div>
        <ScaleRuler unitsPerUnit={460 / (2 * (num(reticleReach) ?? 6) * sfpFactor)} unit={unitLabel} />
        <p class="hint">{t('reticle.unitNote')}</p>
      {:else if reticlePicture}
        <p class="notice loud">{reticlePicture}</p>
      {/if}
    </section>

    <dl class="conditions">
      <dt>{t('trajectory.dragModel')}</dt>
      <dd>{result.model}, BC {bcValue}</dd>
      <dt>{t('trajectory.airUsed')}</dt>
      <dd>
        {fixed(atmosphere.temperatureC, 1)} °C, {fixed(atmosphere.pressurePa / 100, 0)} hPa,
        {fixed(atmosphere.humidity * 100, 0)} % RH
      </dd>
      <dt>{t('trajectory.velocitySource')}</dt>
      <dd>{velocityMeasured ? t('trajectory.velocityMeasured') : t('trajectory.velocityEntered')}</dd>
      {#if stability !== undefined}
        <dt>{t('trajectory.stability')}</dt>
        <dd>
          {fixed(stability, 2)}
          {#if stability < 1.4}<strong>{t('trajectory.marginal')}</strong>{/if}
        </dd>
      {/if}
    </dl>

    {#if result.table.rows.some((r) => r.transonic)}
      <p class="notice">{t('trajectory.transonicNote')}</p>
    {/if}

    {#if result.omitted.length || result.table.omitted.length}
      <p class="omitted">
        {t('trajectory.omitted')}
        <span>{[...result.omitted, ...result.table.omitted].join('; ')}</span>
      </p>
    {/if}
  {/if}
{/if}

</div>
<style>
  @layer legacy {
  :global([data-ui="Trajectory"] [data-slot="label"]),
:global([data-ui="Trajectory"] [data-slot="native-select"]),
:global([data-ui="Trajectory"] [data-slot="input"]) { min-width: 0; max-width: 100%; }
  :global([data-ui="Trajectory"] .lede) {
    max-width: 70ch;
  }
  :global([data-ui="Trajectory"] .notice) {
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
    padding: 0.6rem 0.8rem;
    font-size: 0.9rem;
  }
  :global([data-ui="Trajectory"] .notice.loud) {
    border-color: var(--alert);
    font-weight: 600;
  }
  :global([data-ui="Trajectory"] .inputs) {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--field-gap) var(--space-5);
    margin: var(--section-gap) 0;
    padding: var(--panel-padding);
    border: 1px solid var(--rule);
    border-radius: var(--panel-radius);
    background: var(--surface);
  }
  :global([data-ui="Trajectory"] .inputs [data-slot="label"]) {
    display: grid;
    grid-template-rows: subgrid;
    grid-row: span 2;
    gap: var(--field-gap);
    margin-bottom: var(--space-4);
    font-size: var(--step-0);
  }
  :global([data-ui="Trajectory"] .inputs [data-slot="label"].check) {
    align-self: end;
    min-height: var(--control-height);
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  /* Wide tables scroll inside their own box; the page never scrolls sideways. */
  :global([data-ui="Trajectory"] .scroll) {
    border: 1px solid var(--rule);
    border-radius: var(--panel-radius);
    background: var(--surface);
    overflow-x: auto;
    margin: 1rem 0;
  }
  :global([data-ui="Trajectory"] table) {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
    font-size: 0.9rem;
    white-space: nowrap;
  }
  :global([data-ui="Trajectory"] th),
:global([data-ui="Trajectory"] td) {
    padding: .625rem .75rem;
    text-align: right;
    border-bottom: 1px solid var(--rule-strong);
  }
  :global([data-ui="Trajectory"] th) {
    font-weight: 600;
    font-size: 0.8rem;
  }
  :global([data-ui="Trajectory"] .clicks) {
    font-weight: 600;
  }
  :global([data-ui="Trajectory"] tr.transonic td) {
    color: var(--warn);
  }
  :global([data-ui="Trajectory"] .conditions) {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.2rem 0.8rem;
    font-size: 0.85rem;
    max-width: 40rem;
  }
  :global([data-ui="Trajectory"] .conditions dt) {
    color: var(--ink-2);
  }
  :global([data-ui="Trajectory"] .conditions dd) {
    margin: 0;
  }
  :global([data-ui="Trajectory"] .omitted) {
    font-size: 0.85rem;
    color: var(--ink-2);
    max-width: 70ch;
  }
  :global([data-ui="Trajectory"] .empty) {
    color: var(--ink-2);
  }
  :global([data-ui="Trajectory"] .gee) {
    width: 100%;
    border: 1px solid var(--rule);
    border-radius: var(--panel-radius);
    background: var(--surface);
    padding: var(--panel-padding);
    margin: var(--section-gap) 0;
  }
  :global([data-ui="Trajectory"] .gee h2) {
    margin: 0 0 0.3rem;
    font-size: 1.05rem;
  }
  :global([data-ui="Trajectory"] .gee .lede) {
    font-size: 0.85rem;
    color: var(--ink-2);
  }
  :global([data-ui="Trajectory"] .tolerance) {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    margin-bottom: 0.6rem;
  }
  :global([data-ui="Trajectory"] .band) {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.2rem 0.8rem;
    margin: 0 0 0.6rem;
    font-variant-numeric: tabular-nums;
  }
  :global([data-ui="Trajectory"] .band dt) {
    color: var(--ink-2);
    font-size: 0.85rem;
    align-self: baseline;
  }
  :global([data-ui="Trajectory"] .band dd) {
    margin: 0;
  }
  :global([data-ui="Trajectory"] .band dd.big) {
    font-size: 1.1rem;
    font-weight: 600;
  }
  :global([data-ui="Trajectory"] .reticle) {
    width: 100%;
    border: 1px solid var(--rule);
    border-radius: var(--panel-radius);
    background: var(--surface);
    padding: var(--panel-padding);
    margin: var(--section-gap) 0;
  }
  :global([data-ui="Trajectory"] .reticle h2) {
    margin: 0 0 0.3rem;
    font-size: 1.05rem;
  }
  :global([data-ui="Trajectory"] .reticle .lede) {
    font-size: 0.85rem;
    color: var(--ink-2);
  }
  :global([data-ui="Trajectory"] .gee .lede),
:global([data-ui="Trajectory"] .reticle .lede) { max-width: 70ch; }
  :global([data-ui="Trajectory"] .controls) {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: end;
    margin-bottom: 0.6rem;
  }
  :global([data-ui="Trajectory"] .controls [data-slot="label"]) {
    display: grid;
    gap: 0.2rem;
    font-size: 0.85rem;
  }
  :global([data-ui="Trajectory"] .controls .grow) {
    flex: 1;
    min-width: 10rem;
  }
  :global([data-ui="Trajectory"] .reticle h3) {
    font-size: 0.9rem;
    margin: 0.8rem 0 0.3rem;
  }
  :global([data-ui="Trajectory"] .saved) {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.3rem;
    font-size: 0.85rem;
  }
  :global([data-ui="Trajectory"] .saved li) {
    display: flex;
    gap: 0.4rem;
    align-items: baseline;
  }
  :global([data-ui="Trajectory"] .saved .grow) {
    flex: 1;
  }
  :global([data-ui="Trajectory"] .quiet) {
    color: var(--ink-2);
    font-size: 0.8rem;
  }
  :global([data-ui="Trajectory"] .glass) {
    max-width: 30rem;
    margin-inline: auto;
  }
  :global([data-ui="Trajectory"] .glass svg) {
    width: 100%;
    height: auto;
    border-radius: var(--radius);
  }
  :global([data-ui="Trajectory"] .hint) {
    font-size: 0.8rem;
    color: var(--ink-2);
    margin: 0.3rem 0;
  }
  @media (max-width: 56rem) { :global([data-ui="Trajectory"] .inputs) { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 40rem) { :global([data-ui="Trajectory"] .inputs) { grid-template-columns: minmax(0, 1fr); } }
  }
</style>
