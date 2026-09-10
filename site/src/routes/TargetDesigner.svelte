<script lang="ts">
  import ScaleRuler from '../components/ScaleRuler.svelte';
  import { Label } from '$lib/components/ui/label/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { NativeSelect } from '$lib/components/ui/native-select/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { Button as ShadcnButton } from '$lib/components/ui/button/index.js';

  import FormSection from "../components/ui/FormSection.svelte";
  import Panel from "../components/ui/Panel.svelte";
  import PageHeader from '../components/PageHeader.svelte';
  import { t } from '../lib/i18n.svelte';
  import { href } from '../lib/router';
  import * as records from '../lib/records.svelte';
  import { writePref } from '../lib/prefs';
  import { downloadJson } from '../lib/download';
  import { asTargetFace } from '../lib/target-catalogue';
  import { newId, type StoredTargetFace } from '@lib/userdata';
  import { isTargetGeometry, parseTargetGeometry, targetSvg, type TargetGeometry } from '@lib/targets';

  let name = $state('');
  let distance = $state<number | undefined>(100);
  let width = $state<number | undefined>(250);
  let height = $state<number | undefined>(250);
  let black = $state<number | undefined>(80);
  let white = $state<number | undefined>();
  let inner = $state<number | undefined>();
  let whiteDot = $state(false);
  let method = $state<'edge' | 'centre'>('edge');
  let notes = $state('');
  let rings = $state<{ score: number; diameterMm: number | undefined }[]>(Array.from({ length: 10 }, (_, i) => ({ score: 10 - i, diameterMm: 20 * (i + 1) })));
  let saving = $state(false);
  let error = $state('');
  let importing = $state(false);
  let origin = $state<'measured' | 'imported'>('measured');

  const geometry = $derived({
    name: name.trim(), distanceM: distance, rings, cardMm: { width, height },
    blackMm: black, whiteCentreMm: white, innerTenMm: inner,
    tenIsWhiteDot: whiteDot || undefined, scoringMethod: method === 'centre' ? 'centre' : undefined,
    note: notes.trim() || undefined
  });
  const valid = $derived(isTargetGeometry(geometry));
  // A name is not needed to draw the dimensions while the form is being filled in.
  const picture = $derived.by(() => {
    const preview = { ...geometry, name: name.trim() || t('targetEditor.preview') };
    if (!isTargetGeometry(preview)) return '';
    return targetSvg({ ...preview, id: 'preview', source: { body: '', rulebook: '', edition: '', rule: '', retrieved: '' } });
  });

  function record(): StoredTargetFace | null {
    if (!isTargetGeometry(geometry) || !geometry.cardMm) return null;
    const now = new Date().toISOString();
    const { note, ...fields } = geometry as TargetGeometry;
    return { ...fields, rings: fields.rings.map(r => ({ ...r })), cardMm: geometry.cardMm, id: newId('tgt'), notes: note, origin, created: now, updated: now };
  }

  async function save() {
    const own = record();
    if (!own || saving || importing) return;
    saving = true;
    error = '';
    try {
      await records.saveTargetFace(own);
      writePref('targets.face', own.id);
      location.hash = href.targets();
    } catch { error = t('targetEditor.saveError'); }
    finally { saving = false; }
  }

  function download() {
    const own = record();
    if (own) downloadJson(asTargetFace(own, t('targets.noRulebook')), `${own.id}.json`);
  }

  async function importFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    importing = true;
    error = '';
    try {
      if (file.size > 1_000_000) throw new Error();
      const data = parseTargetGeometry(await file.text());
      if (!data) throw new Error();
      name = data.name; distance = data.distanceM;
      rings = data.rings.map(r => ({ ...r }));
      const outer = Math.max(...data.rings.map(r => r.diameterMm));
      width = data.cardMm?.width ?? outer; height = data.cardMm?.height ?? outer;
      black = data.blackMm; white = data.whiteCentreMm; inner = data.innerTenMm;
      whiteDot = data.tenIsWhiteDot ?? false; method = data.scoringMethod ?? 'edge'; notes = data.note ?? '';
      origin = 'imported';
    } catch { error = t('targetEditor.importError'); }
    finally { input.value = ''; importing = false; }
  }

  function addRing() {
    const last = rings[rings.length - 1]!;
    if (last.score > 1) rings = [...rings, { score: last.score - 1, diameterMm: (last.diameterMm ?? 0) + 20 }];
  }
</script>
<div data-ui="TargetDesigner" class="contents">

<PageHeader title={t('actions.addTarget')} description={t('targetEditor.lede')} backHref={href.targets()} backLabel={t('photo.back')} />

<div class="editor">
  <form onsubmit={(event) => { event.preventDefault(); void save(); }}>
    <FormSection title={t('targetEditor.details')} disabled={saving || importing}>
      <div class="fields">
        <Label class="full">{t('targets.faceName')}<Input required bind:value={name} maxlength={160} /></Label>
        <Label>{t('targets.distance')}<Input type="number" min="0.001" step="any" required bind:value={distance} /></Label>
        <Label>{t('targets.scoringMethod')}<NativeSelect bind:value={method}><option value="edge">{t('targetEditor.edge')}</option><option value="centre">{t('targetEditor.centre')}</option></NativeSelect></Label>
        <Label>{t('targets.cardW')}<Input type="number" min="0.001" step="any" required bind:value={width} /></Label>
        <Label>{t('targets.cardH')}<Input type="number" min="0.001" step="any" required bind:value={height} /></Label>
        <Label>{t('targetEditor.black')}<Input type="number" min="0.001" step="any" bind:value={black} /></Label>
        <Label>{t('targetEditor.white')}<Input type="number" min="0.001" step="any" bind:value={white} /></Label>
        <Label>{t('targetEditor.inner')}<Input type="number" min="0.001" step="any" bind:value={inner} /></Label>
        <Label class="flex flex-row items-center check"><input type="checkbox" bind:checked={whiteDot} />{t('targetEditor.whiteDot')}</Label>
        <Label class="full">{t('targets.note')}<Textarea rows={3} bind:value={notes}></Textarea></Label>
      </div>
    </FormSection>
    <FormSection title={t('targetEditor.rings')} description={t('targetEditor.ringHint')} disabled={saving || importing}>
      <div class="ring-grid">
        {#each rings as ring (ring.score)}
          <Label>{t('targets.ring')} {ring.score}<Input aria-label={`${t('targets.ring')} ${ring.score}: ${t('targets.diameter')}`} type="number" min="0.001" step="any" required bind:value={ring.diameterMm} /></Label>
        {/each}
      </div>
      <div class="actions">
        <ShadcnButton variant="outline" type="button" disabled={rings[rings.length - 1]!.score === 1} onclick={addRing}>{t('targetEditor.addRing')}</ShadcnButton>
        <ShadcnButton variant="outline" type="button" disabled={rings.length === 1} onclick={() => rings = rings.slice(0, -1)}>{t('targetEditor.removeRing')}</ShadcnButton>
      </div>
    </FormSection>
    {#if !valid}<p class="hint">{t('targetEditor.invalid')}</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="actions">
      <ShadcnButton variant="default" class="primary" type="submit" disabled={!valid || !records.state.ready || saving || importing}>{t(saving ? 'targetEditor.saving' : 'targetEditor.save')}</ShadcnButton>
      <ShadcnButton variant="outline" type="button" onclick={download} disabled={!valid || saving || importing}>{t('targetEditor.download')}</ShadcnButton>
    </div>
    <Label class="import">{t('targetEditor.import')}<Input type="file" accept=".json,application/json" onchange={importFile} disabled={saving || importing} /></Label>
    <p class="hint">{t('targetEditor.storage')}</p>
  </form>
  <aside aria-label={t('targetEditor.preview')}>
    <Panel title={t('targetEditor.preview')}>
    {#if picture}<div class="sheet">{@html picture}</div><ScaleRuler />{:else}<p class="hint">{t('targetEditor.invalid')}</p>{/if}
    </Panel>
  </aside>
</div>

</div>
<style>
  @layer legacy {
  :global([data-ui="TargetDesigner"] .editor) { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: var(--section-gap); align-items: start; }
  :global([data-ui="TargetDesigner"] form),
:global([data-ui="TargetDesigner"] aside) { min-width: 0; }
  :global([data-ui="TargetDesigner"] form) { display: grid; gap: var(--section-gap); }
  :global([data-ui="TargetDesigner"] .fields) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); align-items: end; }
  :global([data-ui="TargetDesigner"] .full) { grid-column: 1 / -1; }
  :global([data-ui="TargetDesigner"] [data-slot="label"]) { display: grid; gap: .3rem; min-width: 0; font-size: .9rem; }
  :global([data-ui="TargetDesigner"] [data-slot="input"]),
:global([data-ui="TargetDesigner"] [data-slot="native-select"]),
:global([data-ui="TargetDesigner"] [data-slot="textarea"]) { width: 100%; min-width: 0; }
  :global([data-ui="TargetDesigner"] .check) { display: flex; align-items: center; gap: .5rem; align-self: end; min-height: var(--control-height); } :global([data-ui="TargetDesigner"] .check [data-slot="input"]) { width: auto; }
  :global([data-ui="TargetDesigner"] .ring-grid) { display: grid; grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr)); gap: var(--space-4); }
  :global([data-ui="TargetDesigner"] .hint) { color: var(--ink-2); font-size: .9rem; }
  :global([data-ui="TargetDesigner"] .actions) { display: flex; flex-wrap: wrap; gap: .5rem; }
  :global([data-ui="TargetDesigner"] [data-slot="button"]) { min-height: var(--control-height); border: 1px solid var(--rule-strong); border-radius: var(--radius); background: var(--surface); padding: .4rem .75rem; }
  :global([data-ui="TargetDesigner"] .primary) { background: var(--link); color: var(--accent-ink); border-color: var(--link); }
  :global([data-ui="TargetDesigner"] .error) { color: var(--alert); } :global([data-ui="TargetDesigner"] .import) { margin-top: 0; }
  :global([data-ui="TargetDesigner"] .sheet svg) { display: block; width: 100%; height: auto; }
  :global([data-ui="TargetDesigner"] aside) { position: sticky; top: 1rem; }
  @media (max-width: 800px) { :global([data-ui="TargetDesigner"] .editor) { grid-template-columns: minmax(0, 1fr); } :global([data-ui="TargetDesigner"] aside) { position: static; } :global([data-ui="TargetDesigner"] .sheet) { max-width: 16rem; margin-inline: auto; } }
  @media (max-width: 400px) { :global([data-ui="TargetDesigner"] .fields) { grid-template-columns: minmax(0, 1fr); } }
  }
</style>
