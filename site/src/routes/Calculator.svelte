<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from '$lib/components/ui/label/index.js';
  import { NativeSelect } from '$lib/components/ui/native-select/index.js';

  import PageHeader from '../components/PageHeader.svelte';
  import { entries, load } from '../lib/data';
  import { href } from '../lib/router';
  import { t } from '../lib/i18n.svelte';
  import LiveCartridge from '../components/LiveCartridge.svelte';
  import LiveShotshell from '../components/LiveShotshell.svelte';
  import PageLoadError from '../components/PageLoadError.svelte';
  import type { CartridgeRecord, ShotshellRecord } from '@lib/shapes2d';
  let { key }: { key?: string } = $props();
  let selected = $state('');
  $effect(() => { selected = key ?? ''; });
  const entry = $derived(entries.find(e => e.key === selected));
  const request = $derived(entry ? load(entry.key) : undefined);
</script>
<div data-ui="Calculator" class="contents">

<PageHeader title={t('preview.calculator')} description={t('preview.calculatorNote')} backHref={href.preview()} backLabel={t('preview.back')} eyebrow={t('preview.badge')} />
<div class="selector ui-panel">
<Label>{t('rifles.cartridge')}
  <NativeSelect data-report-context="Cartridge" bind:value={selected}><option value="">{t('targets.chooseCartridge')}</option>{#each entries as e}<option value={e.key}>{e.name}</option>{/each}</NativeSelect>
</Label>
{#if entry}<Button variant="outline" href={href.cartridge(entry.key)}>{t('preview.record')}</Button>{/if}
</div>
{#if key && !entry && selected === key}<p role="alert">{t('preview.unknown')}</p>{/if}
{#if request && entry}
  {#await request}<p>{t('site.loading')}</p>
  {:then data}
    {#key entry.key}
      {#if entry.family === 'shotshell'}<LiveShotshell record={data as unknown as ShotshellRecord} />
      {:else}<LiveCartridge record={data as unknown as CartridgeRecord} />{/if}
    {/key}
  {:catch}<PageLoadError />{/await}
{/if}
<aside><h2>{t('preview.todo')}</h2><ul><li>{t('preview.todo.connect')}</li></ul></aside>

</div>
<style>
  @layer legacy {
  :global([data-ui="Calculator"] .selector) { display: flex; align-items: end; flex-wrap: wrap; gap: var(--space-4); }
  :global([data-ui="Calculator"] [data-slot="label"]) { display: grid; gap: var(--field-gap); flex: 1 1 20rem; min-width: 0; font-size: var(--step-0); } :global([data-ui="Calculator"] [data-slot="native-select"]) { min-width: 0; max-width: 100%; }
  :global([data-ui="Calculator"] aside) { border-top: 1px solid var(--rule); margin-top: 2rem; padding-top: 1rem; } :global([data-ui="Calculator"] li) { margin-block: .5rem; }
  }
</style>
