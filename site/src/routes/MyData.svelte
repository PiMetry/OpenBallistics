<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Button as ShadcnButton } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';

  import Panel from "../components/ui/Panel.svelte";
  import PageHeader from '../components/PageHeader.svelte';
  import GlobalSettings from '../components/GlobalSettings.svelte';
  import * as records from '../lib/records.svelte';
  import { t } from '../lib/i18n.svelte';
  import { href } from '../lib/router';

  let fileInput = $state<HTMLInputElement>(null!);
  let preview = $state<records.ImportPreview | null>(null);
  let filename = $state('');
  let busy = $state(false);
  let message = $state('');
  let error = $state('');
  const sections = $derived([
    { key: 'rifles', label: t('rifles.title'), count: records.state.rifles.length, url: href.rifles(), plan: preview?.ok ? preview.plan : [] },
    { key: 'cartridges', label: t('data.cartridges'), count: records.state.cartridges.length, url: href.newCartridge(), plan: preview?.ok ? preview.cartridgePlan : [] },
    { key: 'reticles', label: t('data.reticles'), count: records.state.reticles.length, url: href.trajectory(), plan: preview?.ok ? preview.reticlePlan : [] },
    { key: 'targets', label: t('data.targets'), count: records.state.targetFaces.length, url: href.targets(), plan: preview?.ok ? preview.facePlan : [] }
  ]);
  const total = $derived(sections.reduce((n, s) => n + s.count, 0));
  const changes = $derived(sections.reduce((n, s) => n + s.plan.filter(r => r.action !== 'skip').length, 0));

  function download() {
    const url = URL.createObjectURL(new Blob([records.exportAll()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `openballistics-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function chooseFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // Choosing the same file again must produce a fresh preview.
    if (!file) return;
    preview = null;
    message = error = '';
    filename = file.name;
    busy = true;
    try { preview = records.preview(await file.text()); }
    catch { error = t('data.readFailed'); }
    finally { busy = false; }
  }
  async function apply() {
    if (!preview?.ok) return;
    busy = true;
    error = '';
    try {
      await preview.apply();
      preview = null;
      message = t('data.imported');
    } catch (e) {
      error = e instanceof Error ? e.message : t('data.writeFailed');
    } finally { busy = false; }
  }
</script>
<div data-ui="MyData" class="contents">

<PageHeader description={t('data.lede')} title={t('data.title')} />
<Tabs.Root value="settings" class="gap-6">
<Tabs.List class="h-11 w-fit max-w-full" aria-label={t('data.title')}>
  <Tabs.Trigger value="settings">{t('settings.title')}</Tabs.Trigger>
  <Tabs.Trigger value="records">{t('data.records')}</Tabs.Trigger>
</Tabs.List>
<Tabs.Content value="settings"><GlobalSettings /></Tabs.Content>
<Tabs.Content value="records" class="space-y-6">
<Panel title={t('data.records')}>
{#if !records.state.ready}
  <p role="status">{t('site.loading')}</p>
{:else}
  <p class="storage" class:temporary={!records.state.durable}>{t(records.state.durable ? 'data.local' : 'data.temporary')}</p>
{/if}
<div class="sections">
  {#each sections as section (section.key)}
    <a href={section.url}><strong class="num">{section.count}</strong><span>{section.label}</span></a>
  {/each}
</div>
<div class="actions">
  <ShadcnButton variant="outline" onclick={download} disabled={!records.state.ready || busy || !total}>{t('data.export')}</ShadcnButton>
  <ShadcnButton variant="outline" onclick={() => fileInput.click()} disabled={!records.state.ready || busy}>{t('rifles.import')}</ShadcnButton>
  <Input class="hidden" tabindex={-1} aria-label={t('rifles.import')} bind:ref={fileInput} type="file" accept="application/json,.json" onchange={chooseFile} />
</div>
</Panel>
{#if message}<p role="status">{message}</p>{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if preview}
  <section class="preview">
    <h2>{filename}</h2>
    {#if !preview.ok}
      <p class="error" role="alert">{preview.error}</p>
    {:else}
      <p>{t('data.mergeNote')}</p>
      {#each sections as section (section.key)}
        {#if section.plan.length}
          <h3>{section.label}</h3>
          <ul>
            {#each section.plan as row (row.id)}
              <li><strong>{t(`rifles.import${row.action[0]!.toUpperCase()}${row.action.slice(1)}`)}</strong> {row.name}<span class="reason"> - {t(`data.reason.${row.reason}`)}</span></li>
            {/each}
          </ul>
        {/if}
      {/each}
      {#if !changes}<p>{t('data.noChanges')}</p>{/if}
      <ShadcnButton variant="outline" onclick={apply} disabled={busy || !changes}>{t('data.apply', { count: changes })}</ShadcnButton>
    {/if}
    <ShadcnButton variant="outline" disabled={busy} onclick={() => { preview = null; error = ''; }}>{t('rifles.cancel')}</ShadcnButton>
  </section>
{/if}

</Tabs.Content>
</Tabs.Root>
</div>
<style>
  @layer legacy {
  :global([data-ui="MyData"] .storage) { max-width: 75ch; color: var(--ink-2); font-size: var(--step-0); margin: 0; }
  :global([data-ui="MyData"] .temporary),
:global([data-ui="MyData"] .error) { color: var(--alert); }
  :global([data-ui="MyData"] .sections) { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr)); gap: 1rem; margin: 1.5rem 0; }
  :global([data-ui="MyData"] .sections a) { display: flex; flex-direction: column; padding: 1rem; border: 1px solid var(--rule); border-radius: var(--panel-radius); background: var(--paper); }
  :global([data-ui="MyData"] .sections a:hover) { border-color: var(--link); text-decoration: none; }
  :global([data-ui="MyData"] .sections strong) { font-size: 1.8rem; }
  :global([data-ui="MyData"] .actions) { display: flex; flex-wrap: wrap; gap: 0.6rem; }
  :global([data-ui="MyData"] [data-slot="button"]) { padding: 0.55rem 0.85rem; background: var(--surface); border: 1px solid var(--rule-strong); border-radius: var(--radius); }
  :global([data-ui="MyData"] [data-slot="button"]:disabled) { opacity: 0.5; cursor: default; }
  :global([data-ui="MyData"] .preview) { margin-top: 1.5rem; padding: 1.25rem; border: 1px solid var(--rule); background: var(--surface); border-radius: var(--panel-radius); }
  :global([data-ui="MyData"] h2) { font-size: 1.2rem; overflow-wrap: anywhere; }
  :global([data-ui="MyData"] h3) { font-size: 1rem; }
  :global([data-ui="MyData"] .reason) { color: var(--ink-2); }
  :global([data-ui="MyData"] li) { overflow-wrap: anywhere; }
  }
</style>
