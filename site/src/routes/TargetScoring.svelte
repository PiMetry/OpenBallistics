<script lang="ts">
  import ScaleRuler from '../components/ScaleRuler.svelte';
  import { Label } from '$lib/components/ui/label/index.js';
  import { NativeSelect } from '$lib/components/ui/native-select/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';

  import PageHeader from '../components/PageHeader.svelte';
  import { t } from '../lib/i18n.svelte';
  import { href } from '../lib/router';
  import { entries } from '../lib/data';
  import * as records from '../lib/records.svelte';
  import { TARGET_FACES, asTargetFace } from '../lib/target-catalogue';
  import { parseShots } from '../lib/shot-input';
  import { scoreGroup, targetSvg, type Shot } from '@lib/targets';
  import TargetPhoto from '../components/TargetPhoto.svelte';
  let { targetId }: { targetId?: string } = $props();
  let faceId = $state('');
  $effect(() => { faceId = targetId ?? TARGET_FACES[0]!.id; });
  const faces = $derived([...TARGET_FACES, ...records.state.targetFaces.map(f => asTargetFace(f, t('targets.noRulebook')))]);
  const face = $derived(faces.find(f => f.id === faceId));
  const cartridges = entries.filter(e => e.family !== 'shotshell' && e.G1 !== null && e.G1 > 0);
  let cartridgeKey = $state('');
  const cartridge = $derived(cartridges.find(e => e.key === cartridgeKey));
  const diameter = $derived(cartridge?.G1 ?? undefined);
  let mode = $state<'photo' | 'coordinates'>('photo');
  let text = $state('');
  let photoShots = $state<Shot[]>([]);
  const parsed = $derived(parseShots(text));
  const shots = $derived(mode === 'photo' ? photoShots : parsed.invalidLines.length ? [] : parsed.shots);
  const stats = $derived(face && diameter && shots.length ? scoreGroup(face, shots, diameter) : undefined);
  const picture = $derived(face ? targetSvg(face, { extent: 'rings', shots: diameter ? shots : [], calibreMm: diameter ?? 1 }) : '');
</script>
<div data-ui="TargetScoring" class="contents">

<PageHeader title={t('photo.title')} description={t('photo.lede')} backHref={href.targets()} backLabel={t('photo.back')} eyebrow={t('preview.badge')} />
<div class="inputs">
  <Label>{t('targets.face')}<NativeSelect data-report-context="Target" bind:value={faceId}><option value="" disabled>{t('targets.face')}</option>{#each faces as f}<option value={f.id}>{f.name}</option>{/each}</NativeSelect></Label>
  <Label>{t('rifles.cartridge')}<NativeSelect data-report-context="Cartridge" bind:value={cartridgeKey}><option value="">{t('targets.chooseCartridge')}</option>{#each cartridges as c}<option value={c.key}>{c.name}</option>{/each}</NativeSelect></Label>
  <Label>{t('photo.mode')}<NativeSelect bind:value={mode}><option value="photo">{t('photo.image')}</option><option value="coordinates">{t('photo.coordinates')}</option></NativeSelect></Label>
</div>
{#if diameter}<p class="hint">{t('targets.diameterNote', { diameter })}</p>{/if}
<details class="limits"><summary>{t('photo.limits')}</summary><p>{t('targets.scorePreview')}</p>{#if mode === 'photo'}<p>{t('photo.limit')}</p>{/if}</details>
{#if face}
<div class="scoring-workspace">
<div class="input-panel ui-panel">
  <h2>{t(mode === 'photo' ? 'photo.image' : 'photo.coordinates')}</h2>
  <p class="hint">{t('targets.scoringMethod')}: {t(face.scoringMethod === 'centre' ? 'targets.scoreCentre' : 'targets.scoreEdge')}</p>
  {#if mode === 'photo'}
    {#key face.id}<TargetPhoto {face} diameterMm={diameter} onshots={(value) => photoShots = value} />{/key}
  {:else}
    <p>{t('targets.scoreLede')}</p>
    <Label class="coordinates">{t('targets.shots')}<Textarea bind:value={text} rows={6} placeholder={'0, 0\n12.5, -4\n-3, 8'}></Textarea></Label>
    {#if parsed.invalidLines.length}<p role="alert">{t('targets.invalidLines', { lines: parsed.invalidLines.join(', ') })}</p>{/if}
  {/if}
  {#if !diameter}<p>{t('targets.chooseCartridge')}</p>{/if}
  </div>
  <section class="results ui-panel" aria-live="polite">
    <h2>{face.name}</h2>
    {#if stats}
      <div><h2>{t('targets.total')}: {stats.total} / {stats.count * 10}</h2>
        <dl><dt>{t('targets.shotCount')}</dt><dd>{stats.count}</dd><dt>{t('targets.innerTens')}</dt><dd>{stats.innerTens}</dd><dt>{t('targets.misses')}</dt><dd>{stats.misses}</dd><dt>{t('targets.extremeSpread')}</dt><dd>{stats.extremeSpreadMm.toFixed(1)} mm</dd><dt>{t('targets.meanRadius')}</dt><dd>{stats.meanRadiusMm.toFixed(1)} mm</dd></dl>
        <p class="hint">{t('targets.meanRadiusNote')}</p>
        <ol>{#each stats.shots as shot}<li>{shot.score} · {shot.xMm.toFixed(1)}, {shot.yMm.toFixed(1)} mm</li>{/each}</ol>
      </div>
    {/if}
    <div class="drawing">{@html picture}</div>
    <ScaleRuler />
  </section>
</div>
{:else}<p role="alert">{t('targets.face')}: {faceId}</p>{/if}

</div>
<style>
  @layer legacy {
  :global([data-ui="TargetScoring"] .hint) { max-width: 70ch; } :global([data-ui="TargetScoring"] .hint) { color: var(--ink-2); font-size: .9rem; }
  :global([data-ui="TargetScoring"] .limits) { border-left: 3px solid var(--link); background: var(--surface); padding: .7rem 1rem; margin: 1rem 0; font-size: .9rem; } :global([data-ui="TargetScoring"] summary) { cursor: pointer; }
  :global([data-ui="TargetScoring"] .inputs) { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,17rem),1fr)); gap: var(--space-4); margin-block: 0 var(--section-gap); padding: var(--panel-padding); background: var(--surface); border: 1px solid var(--rule); border-radius: var(--panel-radius); }
  :global([data-ui="TargetScoring"] [data-slot="label"]) { display: grid; gap: var(--field-gap); min-width: 0; font-size: var(--step-0); } :global([data-ui="TargetScoring"] [data-slot="native-select"]) { max-width: 100%; min-width: 0; } :global([data-ui="TargetScoring"] .coordinates) { max-width: 30rem; }
  :global([data-ui="TargetScoring"] .scoring-workspace) { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--section-gap); align-items: start; }
  :global([data-ui="TargetScoring"] h2) { font-size: var(--step-1); margin-bottom: var(--space-4); }
  :global([data-ui="TargetScoring"] .results > h2) { padding-bottom: var(--space-4); border-bottom: 1px solid var(--rule); }
  :global([data-ui="TargetScoring"] .input-panel > [data-slot="label"]) { max-width: none; }
  @media (max-width: 56rem) { :global([data-ui="TargetScoring"] .scoring-workspace) { grid-template-columns: minmax(0, 1fr); } }
  :global([data-ui="TargetScoring"] .drawing) { width: 100%; max-width: 32rem; margin: 0 auto; } :global([data-ui="TargetScoring"] .drawing svg) { width: 100%; height: auto; }
  :global([data-ui="TargetScoring"] dl) { display: grid; grid-template-columns: auto 1fr; gap: .3rem 1rem; } :global([data-ui="TargetScoring"] dd) { margin: 0; font-variant-numeric: tabular-nums; }
  }
</style>
