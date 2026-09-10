<script lang="ts">
  import ScaleRuler from './ScaleRuler.svelte';
  import { Label } from '$lib/components/ui/label/index.js';
  import { NativeSelect } from '$lib/components/ui/native-select/index.js';

  /**
   * A shot cartridge drawn here, from its published columns: the unfired hull at any of the
   * lengths the sheet lists, with the dimension layer over it when asked. The shipped drawings
   * stay the source of truth for the page; this is the port (`lib/geometry/shotshell.ts`,
   * `technical.ts`), tested against them, drawing the length the reader picks.
   */
  import { liveDrawing } from '@lib/render2d';
import { adaptShotshell, type ShotshellRecord } from '@lib/shapes2d';
  import { t } from '../lib/i18n.svelte';
  import { PX_PER_MM } from '@lib/core';

  interface Props {
    record: ShotshellRecord;
  }
  let { record }: Props = $props();

  const SCALE = 4;
  const lengths = $derived((record.cartridge.lengths ?? []).filter((entry) => entry.l != null && entry.marking));
  const usual = $derived.by(() => {
    try {
      return adaptShotshell(record).hull.marking;
    } catch {
      return null;
    }
  });
  let chosen = $state<string | null>(null);
  let dimensions = $state(false);
  let panelWidth = $state(0);
  const marking = $derived(chosen ?? usual);

  const hull = $derived.by(() => {
    if (!marking) return null;
    try {
      return adaptShotshell(record, marking);
    } catch {
      return null;
    }
  });
  const drawn = $derived(hull ? liveDrawing(hull, null, { scale: SCALE, frame: 'landscape', dimensions }) : null);
  const zoom = $derived.by(() => {
    if (!drawn || !panelWidth) return 1;
    return Math.max(0.5, Math.min(2, (panelWidth - 24) / (drawn.widthMm * PX_PER_MM)));
  });
</script>
<div data-ui="LiveShotshell" class="contents">

{#if hull && drawn}
  <section class="live" bind:clientWidth={panelWidth}>
    <h2>{t('hull.title')}</h2>
    <p class="lede">{t('hull.lede')}</p>
    <div class="stage">
      <div class="sheet" style={`width:${(drawn.widthMm * PX_PER_MM * zoom).toFixed(1)}px;height:${(drawn.heightMm * PX_PER_MM * zoom).toFixed(1)}px`}>
        {@html drawn.markup}
      </div>
    </div>
    <ScaleRuler widthMm={drawn.widthMm} />
    <div class="controls">
      <Label>
        <span class="eyebrow">{t('hull.length')}</span>
        <NativeSelect value={marking} onchange={(e) => (chosen = e.currentTarget.value)}>
          {#each lengths as entry (entry.marking)}
            <option value={entry.marking}>{entry.marking} · {(entry.l as number).toFixed(1)} mm</option>
          {/each}
        </NativeSelect>
      </Label>
      <Label class="flex flex-row items-center toggle">
        <input type="checkbox" bind:checked={dimensions} />
        {t('live.dimensions')}
      </Label>
    </div>
    <p class="note">{t('hull.note')}</p>
  </section>
{/if}

</div>
<style>
  @layer legacy {
  :global([data-ui="LiveShotshell"] .live) {
    margin: var(--section-gap) 0 0;
    padding: var(--panel-padding);
    border: 1px solid var(--rule);
    border-radius: var(--panel-radius);
    background: var(--surface);
  }
  :global([data-ui="LiveShotshell"] h2) {
    font-size: var(--step-1);
    margin: 0 0 0.3rem;
  }
  :global([data-ui="LiveShotshell"] .lede),
:global([data-ui="LiveShotshell"] .note) {
    margin: 0 0 1rem;
    font-size: 0.82rem;
    color: var(--ink-2);
    max-width: 70ch;
  }
  :global([data-ui="LiveShotshell"] .stage) {
    overflow-x: auto;
    padding: 0.75rem 0;
  }
  :global([data-ui="LiveShotshell"] .sheet) {
    display: block;
  }
  :global([data-ui="LiveShotshell"] .sheet svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
  :global([data-ui="LiveShotshell"] .controls) {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    align-items: end;
    margin: 0.5rem 0 1rem;
  }
  :global([data-ui="LiveShotshell"] .controls [data-slot="label"]) {
    display: flex;
    flex-direction: column;
    gap: var(--field-gap);
    flex: 1 1 10rem;
    min-width: 0;
    max-width: 100%;
  }
  :global([data-ui="LiveShotshell"] .toggle) {
    flex-direction: row !important;
    align-items: center;
    gap: 0.4rem !important;
    font-size: var(--step-0);
    color: var(--ink-2);
  }
  }
</style>
