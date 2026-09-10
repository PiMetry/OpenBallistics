<script lang="ts">
  import { Label } from '$lib/components/ui/label/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { NativeSelect } from '$lib/components/ui/native-select/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { Button as ShadcnButton } from '$lib/components/ui/button/index.js';

  import FormSection from "../components/ui/FormSection.svelte";
  import Button from "../components/ui/Button.svelte";
  import AddAction from '../components/AddAction.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { byKey, entries } from '../lib/data';
  import { t } from '../lib/i18n.svelte';
  import { href } from '../lib/router';
  import { newId, type Gun, type GunKind, type TwistHand } from '@lib/userdata';
  import * as records from '../lib/records.svelte';
  import QuantityInput from '../components/QuantityInput.svelte';
  import { unitSystem, barrelUnit } from '../lib/units.svelte';
  import { defaultUnit, displayNumber, fromCanonical, toCanonical } from '../lib/units';

  type Draft = {
    id: string; name: string; kind: GunKind | ''; cartridgeKey: string; notes: string;
    barrelLengthMm?: number; twistMm?: number; twistHand: TwistHand;
    muzzleVelocity?: number; hasScope: boolean; clickMrad?: number;
    sightHeightMm?: number; zeroDistanceM?: number;
  };
  const KINDS: GunKind[] = ['rifle', 'pistol', 'revolver', 'shotgun', 'airgun', 'other'];
  let editing = $state<Draft | null>(null);
  let saving = $state(false);
  let error = $state('');
  let deleting = $state<string | null>(null);
  let query = $state('');
  const shown = $derived(records.state.rifles.filter(g => `${g.name} ${g.cartridge.snapshot?.name ?? g.cartridge.key}`.toLowerCase().includes(query.trim().toLowerCase())));
  const blank = (): Draft => ({ id: newId('gun'), name: '', kind: '', cartridgeKey: '', notes: '', twistHand: 'right', hasScope: false });
  const velocityMps = (gun: Gun) => gun.muzzleVelocity?.unit === 'ft/s'
    ? toCanonical(gun.muzzleVelocity.value, 'ft/s') : gun.muzzleVelocity?.value;

  function toDraft(gun: Gun): Draft {
    return {
      id: gun.id, name: gun.name, kind: gun.kind ?? '', cartridgeKey: gun.cartridge.key,
      notes: gun.notes ?? '', barrelLengthMm: gun.barrel.lengthMm || undefined,
      twistMm: gun.barrel.twistMm, twistHand: gun.barrel.twistHand ?? 'right',
      muzzleVelocity: velocityMps(gun), hasScope: !!gun.scope,
      clickMrad: gun.scope ? toCanonical(gun.scope.clickValue, gun.scope.clickUnit) : undefined,
      sightHeightMm: gun.scope?.heightOverBoreMm, zeroDistanceM: gun.scope?.zeroDistanceM
    };
  }
  const chosen = $derived(editing ? byKey(editing.cartridgeKey) : undefined);
  const valueLabel = (value: number, quantity: 'length' | 'velocity') => {
    const unit = quantity === 'length' ? barrelUnit() : defaultUnit(quantity, unitSystem());
    return `${displayNumber(value, unit)} ${unit === 'in' ? t('units.inch') : unit}`;
  };
  async function commit(draft: Draft) {
    if (saving) return;
    saving = true; error = '';
    try {
      const entry = byKey(draft.cartridgeKey);
      const existing = records.state.rifles.find(g => g.id === draft.id);
      // Values are canonical; choosing a display unit never rewrites an existing measurement.
      const clickUnit = existing?.scope?.clickUnit ?? (unitSystem() === 'imperial' ? 'moa' : 'mrad');
      await records.save({
        ...existing, id: draft.id, name: draft.name.trim(), kind: draft.kind || undefined,
        notes: draft.notes.trim() || undefined,
        cartridge: {
          key: draft.cartridgeKey,
          snapshot: existing?.cartridge.key === draft.cartridgeKey && existing.cartridge.snapshot
            ? existing.cartridge.snapshot
            : entry ? { name: entry.name, family: entry.family, capturedAt: new Date().toISOString().slice(0, 10), fields: {} } : undefined
        },
        barrel: { ...existing?.barrel, lengthMm: draft.barrelLengthMm ?? 0, twistMm: draft.twistMm, twistHand: draft.twistMm ? draft.twistHand : undefined },
        scope: draft.hasScope ? {
          ...existing?.scope, clickUnit, clickValue: fromCanonical(draft.clickMrad!, clickUnit),
          heightOverBoreMm: draft.sightHeightMm!, zeroDistanceM: draft.zeroDistanceM!
        } : undefined,
        muzzleVelocity: draft.muzzleVelocity === undefined ? undefined : {
          value: draft.muzzleVelocity, unit: 'm/s',
          source: existing?.muzzleVelocity && draft.muzzleVelocity === velocityMps(existing)
            ? existing.muzzleVelocity.source : { kind: 'measured', date: new Date().toISOString().slice(0, 10) }
        }
      });
      editing = null;
    } catch { error = t('data.writeFailed'); }
    finally { saving = false; }
  }
</script>
<div data-ui="Rifles" class="contents">

<PageHeader title={t('rifles.title')} description={t('guns.lede')}>
  {#snippet actions()}<AddAction label={t('actions.addGun')} disabled={saving || !records.state.ready} onclick={() => editing = blank()} />{/snippet}
</PageHeader>
<details class="mb-6 rounded-lg border bg-card px-4 py-3 text-sm" open={records.state.ready && !records.state.durable}>
  <summary class="cursor-pointer font-medium">{t('data.browserStorage')}</summary>
  <p class="mt-3 text-muted-foreground">{records.state.ready && !records.state.durable ? t('rifles.notDurable') : t('rifles.localOnly')}</p>
  <a href={href.myData()}>{t('data.manage')}</a>
</details>
{#if error}<p class="notice loud" role="alert">{error}</p>{/if}
{#if editing}
  {#key editing.id}
    {@const draft = editing}
    <form class="edit grid items-start gap-6 xl:grid-cols-2" onsubmit={(e) => { e.preventDefault(); void commit(draft); }}>
      <FormSection title={t('guns.identity')} disabled={saving}>
        <div class="ui-form-grid">
        <Label>{t('rifles.name')}<Input bind:value={draft.name} required pattern=".*\S.*" /></Label>
        <Label>{t('guns.kind')}
          <NativeSelect bind:value={draft.kind}><option value="">{t('guns.unspecified')}</option>{#each KINDS as kind}<option value={kind}>{t(`guns.kind.${kind}`)}</option>{/each}</NativeSelect>
        </Label>
        <Label class="ui-full">{t('rifles.cartridge')}
          <Input bind:value={draft.cartridgeKey} list="cartridge-keys" placeholder="9_mm_luger" />
          <span class="hint" class:unknown={draft.cartridgeKey.trim() !== '' && !chosen}>{chosen ? chosen.name : draft.cartridgeKey.trim() === '' ? '' : t('rifles.unknownCartridge')}</span>
        </Label>
        <datalist id="cartridge-keys">{#each entries as entry (entry.key)}<option value={entry.key}>{entry.name}</option>{/each}</datalist>
        <Label class="ui-full">{t('rifles.notes')}<Textarea bind:value={draft.notes} rows={3}></Textarea></Label>
        </div>
      </FormSection>
      <FormSection title={t('guns.measurements')} disabled={saving}>
        <div class="ui-form-grid">
        <QuantityInput label={t('rifles.barrelLength')} bind:value={draft.barrelLengthMm} quantity="length" system={unitSystem()} defaultDisplayUnit={barrelUnit()} positive />
        <QuantityInput label={t('rifles.twist')} bind:value={draft.twistMm} quantity="length" system={unitSystem()} defaultDisplayUnit={barrelUnit()} twist positive />
        <p class="hint ui-full">{t('guns.twistHint')}</p>
        {#if draft.twistMm}
          <Label>{t('rifles.twistHand')}<NativeSelect bind:value={draft.twistHand}><option value="right">{t('rifles.right')}</option><option value="left">{t('rifles.left')}</option></NativeSelect></Label>
        {/if}
        <QuantityInput label={t('rifles.muzzleVelocity')} bind:value={draft.muzzleVelocity} quantity="velocity" system={unitSystem()} positive />
        <Label class="flex flex-row items-center check ui-full"><input type="checkbox" bind:checked={draft.hasScope} />{t('guns.hasScope')}</Label>
        {#if draft.hasScope}
          <QuantityInput label={t('rifles.clickValue')} bind:value={draft.clickMrad} quantity="angle" system={unitSystem()} required positive />
          <QuantityInput label={t('rifles.sightHeight')} bind:value={draft.sightHeightMm} quantity="length" system={unitSystem()} required />
          <QuantityInput label={t('rifles.zeroDistance')} bind:value={draft.zeroDistanceM} quantity="distance" system={unitSystem()} required positive />
        {/if}
        </div>
      </FormSection>
      <div class="flex flex-wrap justify-end gap-2 border-t pt-5 xl:col-span-2"><Button variant="primary" type="submit" disabled={saving}>{t('rifles.save')}</Button><Button disabled={saving} onclick={() => editing = null}>{t('rifles.cancel')}</Button></div>

    </form>
  {/key}
{/if}
{#if !records.state.rifles.length && !editing}
  <div class="ui-empty"><p>{t('rifles.none')}</p></div>
{:else if records.state.rifles.length}
  <Label class="search">{t('list.search')}<Input type="search" bind:value={query} /></Label>
  {#if !shown.length}<p>{t('list.emptyLead')}</p>{/if}
  <ul class="list">
    {#each shown as gun (gun.id)}
      <li>
        <b>{gun.name}</b>
        <span class="meta">
          {#if gun.kind}{t(`guns.kind.${gun.kind}`)} · {/if}{byKey(gun.cartridge.key)?.name ?? gun.cartridge.snapshot?.name ?? gun.cartridge.key}
          {#if gun.barrel.lengthMm} · {valueLabel(gun.barrel.lengthMm, 'length')}{/if}
          {#if gun.barrel.twistMm} · 1:{valueLabel(gun.barrel.twistMm, 'length')}{/if}
          {#if gun.muzzleVelocity} · {valueLabel(velocityMps(gun)!, 'velocity')}{/if}
        </span>
        <ShadcnButton variant="outline" type="button" disabled={saving} onclick={() => editing = toDraft(gun)}>{t('rifles.edit')}</ShadcnButton>
        {#if deleting === gun.id}
          <span>{t('data.deleteConfirm', { name: gun.name })}</span>
          <ShadcnButton variant="outline" type="button" onclick={async () => { try { await records.remove(gun.id); deleting = null; } catch { error = t('data.writeFailed'); } }}>{t('rifles.delete')}</ShadcnButton>
          <ShadcnButton variant="outline" type="button" onclick={() => deleting = null}>{t('rifles.cancel')}</ShadcnButton>
        {:else}<ShadcnButton variant="outline" type="button" onclick={() => deleting = gun.id}>{t('rifles.delete')}</ShadcnButton>{/if}
      </li>
    {/each}
  </ul>
{/if}

</div>
<style>
  @layer legacy {
  :global([data-ui="Rifles"] .search) { display: grid; gap: 0.25rem; font-size: var(--step-0); }
  :global([data-ui="Rifles"] .search) { max-width: 32rem; margin-bottom: var(--space-5); }
  :global([data-ui="Rifles"] .edit .check) { display: flex; align-items: center; gap: 0.5rem; }
  :global([data-ui="Rifles"] .edit [data-slot="input"]),
:global([data-ui="Rifles"] .edit [data-slot="native-select"]),
:global([data-ui="Rifles"] .edit [data-slot="textarea"]),
:global([data-ui="Rifles"] .edit .ui-form-grid) { min-width: 0; max-width: 100%; }
  :global([data-ui="Rifles"] .list li) { padding: 1rem; border: 1px solid var(--rule); background: var(--surface); border-radius: var(--panel-radius); }

  :global([data-ui="Rifles"] .notice) {
    border: 1px solid var(--rule);
    background: var(--surface);
    padding: var(--space-4);
    border-radius: var(--radius);
    font-size: 0.9rem;
  }
  :global([data-ui="Rifles"] .notice.loud) {
    border-color: var(--alert);
    font-weight: 600;
  }
  :global([data-ui="Rifles"] .bar) {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin: 0.8rem 0;
    flex-wrap: wrap;
  }
  :global([data-ui="Rifles"] .edit) {
    display: grid;
    gap: 0.5rem;
    width: 100%;
    margin: var(--section-gap) 0;
  }
  :global([data-ui="Rifles"] .edit [data-slot="label"]) {
    display: grid;
    gap: 0.2rem;
    font-size: 0.9rem;
  }
  :global([data-ui="Rifles"] .list) {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }
  :global([data-ui="Rifles"] .list li) {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    flex-wrap: wrap;
  }
  :global([data-ui="Rifles"] .meta) {
    color: var(--ink-2);
    font-size: 0.9rem;
    flex: 1;
  }
  :global([data-ui="Rifles"] .hint) {
    font-size: 0.85rem;
    color: var(--ink-2);
    min-height: 1.1em;
  }
  :global([data-ui="Rifles"] .hint.unknown) {
    color: var(--alert);
  }
  :global([data-ui="Rifles"] .form-actions) { margin-top: var(--space-6); padding-top: var(--space-5); border-top: 1px solid var(--rule); }
  :global([data-ui="Rifles"] .hint) { margin: 0; }
  :global([data-ui="Rifles"] .hint:empty) { display: none; }
  }
</style>
