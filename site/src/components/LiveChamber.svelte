<script lang="ts">
  import ScaleRuler from './ScaleRuler.svelte';
  /**
   * The round in its chamber: as the bullet is dragged in the
   * live cartridge, this shows what the seating means in the published minimum chamber - the
   * headspace datum, the tightest clearance in each region, and the estimated jump from the ogive
   * to the lands. Every figure is from the published minimum; the panel says it is an estimate.
   */
  import { type Profile } from '@lib/geom';
import { type Profiles } from '@lib/geometry';
import {
  bearingOverrun,
  clearances,
  jumpToLands,
  loadedSilhouette,
  tightest,
  type Region
} from '@lib/measure2d';
import { type Bullet, type Chamber } from '@lib/shapes2d';
  import { fitParts, steelBoundary } from '@lib/render2d/render';
  import { svgHeader, viewportFor } from '@lib/geom';
  import { t } from '../lib/i18n.svelte';
  import { PX_PER_MM } from '@lib/core';

  interface Props {
    profiles: Profiles;
    bullet: Bullet;
    bulletProfile: Profile;
    exposed: Profile | null;
    chamber: Chamber;
    bore: Profile;
    zoom: number;
  }
  let { profiles, bullet, bulletProfile, exposed, chamber, bore, zoom }: Props = $props();

  const SCALE = 4;
  const REGIONS: Region[] = ['body', 'junction_cone', 'neck', 'free_bore', 'bore'];

  const measured = $derived(clearances(bore, loadedSilhouette(profiles.outline, bulletProfile), chamber));
  const jump = $derived(jumpToLands(bullet, bulletProfile, chamber));
  const overrun = $derived(bearingOverrun(bullet, chamber));

  const drawn = $derived.by(() => {
    const steel = steelBoundary(bore);
    const shown = [steel, profiles.outline, ...(exposed ? [exposed] : [])];
    const view = viewportFor(shown, { scale: SCALE, frame: 'landscape', marginMm: 4 });
    const contact = jump ? { bulletZ: jump.bulletZ, chamberZ: jump.chamberZ, radius: jump.contactRadius } : null;
    const parts = fitParts(profiles.case, profiles.outline, bullet, exposed, bore, view, contact);
    return {
      markup: [svgHeader(view, `${profiles.case.name} - fit`), ...parts, '</svg>'].join(''),
      widthMm: view.width / SCALE,
      heightMm: view.height / SCALE
    };
  });

  /** Whether a region's interference is the datum's own, which the fit module explains. */
  function designed(region: Region): boolean {
    return (
      (region === 'junction_cone' && chamber.datum === 'shoulder') ||
      (region === 'free_bore' && (profiles.case.family === 'pistol' || profiles.case.category === 'pistol'))
    );
  }
</script>

<div class="fit">
  <p class="lede">{t('fit.lede')}</p>
  <div class="fit-viewport"><div class="fit-ink" style={`width:${(drawn.widthMm * PX_PER_MM * zoom).toFixed(1)}px;height:${(drawn.heightMm * PX_PER_MM * zoom).toFixed(1)}px`}>
    {@html drawn.markup}
  </div></div>
  <ScaleRuler widthMm={drawn.widthMm} />
  <dl class="figures">
    <dt>{t('fit.datum')}</dt>
    <dd>{t(`fit.datum.${chamber.datum}`)}</dd>
    {#if jump}
      <dt>{t('fit.jump')}</dt>
      <dd class="num">{jump.jump.toFixed(2)} mm <span class="muted">({t('fit.jumpNote')})</span></dd>
    {/if}
    {#each REGIONS as region (region)}
      {@const c = tightest(measured, region)}
      {#if c}
        <dt>{t('fit.clearance')} · {t(`fit.region.${region}`)}</dt>
        <dd class="num" class:tight={c.gap < 0}>
          {c.gap >= 0 ? '+' : ''}{c.gap.toFixed(3)} mm
          {#if c.gap < 0}<span class="muted">({t('fit.interference')}{designed(region) ? `, ${t('fit.designed')}` : ''})</span>{/if}
        </dd>
      {/if}
    {/each}
  </dl>
  <ul class="findings">
    {#if !chamber.throat}
      <li class="note">{t('fit.noThroat')}</li>
    {:else if jump}
      {#if jump.jump < -0.005}
        <li class="warning">{t('fit.jammed', { by: (-jump.jump).toFixed(2) })}</li>
      {:else if jump.jump < 0.05}
        <li class="caution">{t('fit.touching')}</li>
      {:else}
        <li class="note">{t('fit.longJump', { jump: jump.jump.toFixed(2) })}</li>
      {/if}
    {/if}
    {#if overrun != null && overrun > 0.005}
      <li class="warning">{t('fit.overrun', { by: overrun.toFixed(2) })}</li>
    {/if}
  </ul>
</div>

<style>
  @layer legacy {
  .fit {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--rule);
  }
  .lede {
    margin: 0 0 0.75rem;
    font-size: 0.82rem;
    color: var(--ink-2);
    max-width: 70ch;
  }
  .fit-viewport { max-width: 100%; overflow: auto; }
  .fit-ink { display: block; }
  .fit-ink :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
  .figures {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.2rem 1rem;
    margin: 0.75rem 0;
    font-size: var(--step-0);
  }
  .figures dt {
    color: var(--ink-3);
  }
  .figures dd {
    margin: 0;
  }
  .tight {
    color: var(--warn);
  }
  .muted {
    color: var(--ink-3);
    font-size: 0.85em;
  }
  .findings {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--step-0);
  }
  .findings li {
    padding: 0.35rem 0.6rem;
    margin: 0.25rem 0;
    border-left: 3px solid var(--rule-strong);
    background: var(--surface-2);
  }
  .findings li.warning {
    border-color: var(--warn);
    color: var(--warn);
  }
  .findings li.caution {
    border-color: var(--link);
  }
  .findings li.note {
    color: var(--ink-2);
  }
  }
</style>
