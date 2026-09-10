<script lang="ts">
  import ScaleRuler from '../components/ScaleRuler.svelte';
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Label } from '$lib/components/ui/label/index.js';
  import { NativeSelect } from '$lib/components/ui/native-select/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Button as ShadcnButton } from '$lib/components/ui/button/index.js';

  import FormSection from "../components/ui/FormSection.svelte";
  import PageHeader from '../components/PageHeader.svelte';
  import { href } from '../lib/router';
  /**
   * The cartridge designer.
   *
   * **There is no photograph mode here.** A bullet in your hand has no
   * published drawing, so tracing one off a picture is the only way to measure it. A cartridge
   * does have one - the numbers come off a CIP sheet, a neighbour in the catalogue, or a caliper -
   * and tracing it off a photo would produce worse figures than the sheet prints while looking
   * exactly as authoritative.
   *
   * Form structure:
   *
   * - **Family first.** It is the one answer that decides the form, and the first thing anyone
   *   knows about the cartridge in front of them. The field set then comes from the dataset
   *   (`fieldsets.generated.json`), not from a list kept by hand.
   * - **The working set, and the rest behind a disclosure** that says how rare each one is.
   * - **Not applicable is not the same as not known.** Every field has both, and they look
   *   different.
   * - **Start from a neighbour**, because 500 records beat an empty form.
   * - **Draw while typing**, with the catalogue's own geometry, so what you see is what the record
   *   means.
   * - **Derived figures are shown as derived** and cannot be typed over.
   */
  import { entries, load as loadRecord } from '../lib/data';
  import { designableFamilies, fieldsFor, isAngleField, shareOf, splitPath } from '../lib/fieldsets';
  import { t } from '../lib/i18n.svelte';
  import * as store from '../lib/records.svelte';
  import { liveDrawing } from '@lib/render2d';
  import { profilesFor } from '@lib/geometry';
  import type { CartridgeRecord } from '@lib/shapes2d';
  import {
    checkDraft,
    derivedOf,
    designed,
    draftFrom,
    emptyDraft,
    isAngle,
    setField,
    stateOf,
    toRecord,
    type CartridgeDraft
  } from '@lib/designer';
  import { newId, type StoredCartridge } from '@lib/userdata';
  import type { Angle, Value } from '@lib/core';

  // Read once, before either piece of state exists, so the initial draft is not built from a
  // reactive read of `family` that only ever captures its first value.
  const firstFamily = designableFamilies.includes('rimless') ? 'rimless' : designableFamilies[0]!;

  let family = $state(firstFamily);
  let draft = $state<CartridgeDraft>(emptyDraft(firstFamily, newId('crt')));
  let showRare = $state(false);
  let startFrom = $state('');
  let busy = $state('');

  const fields = $derived(fieldsFor(draft.family));

  /** The working set, grouped the way the record groups it, so the form reads like a sheet. */
  const sections = $derived.by(() => {
    const paths = showRare ? [...fields.working, ...fields.rare] : fields.working;
    const bySection = new Map<string, string[]>();
    for (const path of paths) {
      const { side, group } = splitPath(path);
      const key = `${side}.${group}`;
      bySection.set(key, [...(bySection.get(key) ?? []), path]);
    }
    return [...bySection.entries()].map(([key, paths_]) => ({ key, paths: paths_ }));
  });

  const check = $derived(checkDraft(draft));
  // Not named `derived`: that collides with the name Svelte's compiler generates for `$derived`,
  // and the error it produces points at the rune rather than at the variable.
  const figures = $derived(derivedOf(draft));

  /**
   * The drawing, made here rather than through `lib/live`.
   *
   * That module fetches a record by key and caches it, which is right for the catalogue and wrong
   * for a draft: this record exists only in memory and changes on every keystroke. So the geometry
   * is called directly, which is the same geometry the catalogue pages use.
   */
  const picture = $derived.by(() => {
    if (!check.drawable) return undefined;
    try {
      const record = toRecord(draft) as unknown as CartridgeRecord;
      const p = profilesFor(record);
      return liveDrawing(p.case, p.bullet, {
        scale: 3,
        frame: 'landscape',
        profile: p.outline,
        idPrefix: 'designer-'
      });
    } catch {
      // The check above says the geometry is happy; a failure here is the drawing layer's and is
      // not worth a second error message beside the one already shown.
      return undefined;
    }
  });

  function edit(path: string, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      draft = setField(draft, path, undefined);
      return;
    }
    const value = Number(trimmed);
    draft = setField(draft, path, Number.isFinite(value) ? value : (trimmed as Value));
  }

  /**
   * Edit one part of an angle.
   *
   * The sheets print these as degrees, minutes and seconds, so the form does too rather than
   * asking for a decimal and converting - a shoulder angle read off a sheet as 40° 3′ 3″ should
   * be typed as what it says. Minutes and seconds stay optional: `Angle` allows both to be absent,
   * and a sheet that prints only whole degrees should not gain two zeroes it never had.
   */
  function editAngle(path: string, part: 'degrees' | 'minutes' | 'seconds', raw: string) {
    const current = draft.fields[path];
    const base: Angle = isAngle(current) ? current : { degrees: 0 };
    const trimmed = raw.trim();
    const next: Angle = { ...base };
    if (trimmed === '') {
      if (part === 'degrees') next.degrees = 0;
      else delete next[part];
    } else {
      const value = Number(trimmed);
      if (!Number.isFinite(value)) return;
      next[part] = value;
    }
    draft = setField(draft, path, next);
  }

  const anglePart = (path: string, part: 'degrees' | 'minutes' | 'seconds'): string => {
    const value = draft.fields[path];
    if (!isAngle(value)) return '';
    const found = value[part];
    return found === undefined ? '' : String(found);
  };

  /** Say "the source does not print this", which is a different thing from an empty box. */
  function markAbsent(path: string) {
    draft = setField(draft, path, stateOf(draft, path) === 'not-printed' ? undefined : null);
  }

  async function copyFrom(key: string) {
    if (!key) return;
    busy = t('newCartridge.loading');
    try {
      const record = await loadRecord(key);
      draft = draftFrom(record, newId('crt'), `${key}_mine`);
      family = record.family;
      busy = '';
    } catch {
      busy = t('newCartridge.copyFailed');
    }
  }

  async function save() {
    const stored: StoredCartridge = designed(
      draft,
      // A designed cartridge is the user's measurement, never a published figure. The type does
      // not offer `published` and neither does this page.
      'measured'
    ) as StoredCartridge;
    await store.saveCartridge(stored);
    busy = t('newCartridge.saved');
  }

  const shown = (path: string): string => {
    const value = draft.fields[path];
    if (value === null || value === undefined) return '';
    if (isAngle(value)) {
      const { degrees, minutes = 0, seconds = 0 } = value;
      return `${degrees}° ${minutes}′ ${seconds}″`;
    }
    return String(value);
  };

  const fixed = (value: number, places: number) => value.toFixed(places);
  const label = (path: string) => splitPath(path).field;
</script>
<div data-ui="CartridgeDesigner" class="contents">

<PageHeader title={t('actions.addCartridge')} description={t('newCartridge.lede')} backHref={href.list()} backLabel={t('nav.cartridges')} />

<div class="start">
  <Label>
    {t('newCartridge.family')}
    <NativeSelect
      bind:value={family}
      onchange={() => (draft = emptyDraft(family, newId('crt')))}
    >
      {#each designableFamilies as f (f)}<option value={f}>{t(`family.${f}`)}</option>{/each}
    </NativeSelect>
  </Label>

  <Label class="wide">
    {t('newCartridge.startFrom')}
    <Input list="all-cartridges" bind:value={startFrom} placeholder="308_win" />
    <datalist id="all-cartridges">
      {#each entries as entry (entry.key)}<option value={entry.key}>{entry.name}</option>{/each}
    </datalist>
  </Label>
  <ShadcnButton variant="outline" type="button" onclick={() => copyFrom(startFrom)}>{t('newCartridge.copy')}</ShadcnButton>
  {#if busy}<span class="busy">{busy}</span>{/if}
</div>

<p class="hint">
  {t('newCartridge.setNote', { family: t(`family.${family}`), working: fields.working.length, rare: fields.rare.length, records: fields.records })}
</p>

<div class="split">
  <form class="form ui-stack" onsubmit={(e) => e.preventDefault()}>
    <div class="identity">
      <Label>{t('newCartridge.name')}<Input value={draft.name} oninput={(e) => (draft = { ...draft, name: e.currentTarget.value })} /></Label>
      <Label>{t('newCartridge.key')}<Input value={draft.key} oninput={(e) => (draft = { ...draft, key: e.currentTarget.value })} /></Label>
    </div>

    <Tabs.Root value="cartridge" class="gap-5">
      <Tabs.List class="h-auto max-w-full flex-wrap" aria-label={t('newCartridge.title')}>
        <Tabs.Trigger value="cartridge">{t('record.cartridgeMaxi')}</Tabs.Trigger>
        <Tabs.Trigger value="chamber">{t('record.chamberMini')}</Tabs.Trigger>
      </Tabs.List>
      {#each ['cartridge', 'chamber'] as side}
      <Tabs.Content value={side} class="space-y-6">
    {#each sections.filter(section => section.key.startsWith(side + '.')) as section (section.key)}
      <FormSection title={section.key.split('.').map((part, i) => t(i === 0 ? (part === 'cartridge' ? 'record.cartridgeMaxi' : 'record.chamberMini') : `group.${part}`)).join(' · ')}>
        <div class="dimension-fields">
        {#each section.paths as path (path)}
          {@const state = stateOf(draft, path)}
          <div class="field" class:absent={state === 'not-printed'}>
            <Label>
              <span class="name">
                {label(path)}
                {#if shareOf(draft.family, path) < 0.9}
                  <span class="rarity">
                    {Math.round(shareOf(draft.family, path) * 100)}%
                  </span>
                {/if}
              </span>
              {#if isAngleField(path)}
                <span class="angle" title={t('newCartridge.angleHelp')}>
                  <Input
                    value={anglePart(path, 'degrees')}
                    inputmode="decimal"
                    disabled={state === 'not-printed'}
                    aria-label="degrees"
                    oninput={(e) => editAngle(path, 'degrees', e.currentTarget.value)}
                  />°
                  <Input
                    value={anglePart(path, 'minutes')}
                    inputmode="decimal"
                    disabled={state === 'not-printed'}
                    aria-label="minutes"
                    oninput={(e) => editAngle(path, 'minutes', e.currentTarget.value)}
                  />′
                  <Input
                    value={anglePart(path, 'seconds')}
                    inputmode="decimal"
                    disabled={state === 'not-printed'}
                    aria-label="seconds"
                    oninput={(e) => editAngle(path, 'seconds', e.currentTarget.value)}
                  />″
                </span>
              {:else}
                <Input
                  value={shown(path)}
                  inputmode="decimal"
                  disabled={state === 'not-printed'}
                  placeholder={state === 'not-printed' ? t('newCartridge.notPrinted') : ''}
                  oninput={(e) => edit(path, e.currentTarget.value)}
                />
              {/if}
            </Label>
            <ShadcnButton variant="outline"
              type="button"
              class="absent-toggle"
              aria-pressed={state === 'not-printed'}
              aria-label={`${label(path)}: ${t('newCartridge.markAbsentHelp')}`} title={t('newCartridge.markAbsentHelp')}
              onclick={() => markAbsent(path)}>-</ShadcnButton
            >
          </div>
        {/each}
        </div>
      </FormSection>
    {/each}

      </Tabs.Content>
      {/each}
    </Tabs.Root>
    <ShadcnButton variant="outline" type="button" class="disclose" onclick={() => (showRare = !showRare)}>
      {showRare
        ? t('newCartridge.hideRare')
        : t('newCartridge.showRare').replace('{n}', String(fields.rare.length))}
    </ShadcnButton>
  </form>

  <aside class="side">
    <h2>{t('newCartridge.drawing')}</h2>
    {#if picture}
      <!--
        `@html` is safe here: the markup comes from the catalogue's own renderer, built from the
        figures in the draft, which it formats itself. Nothing typed reaches it as markup.
      -->
      <div class="drawing">{@html picture.markup}</div>
      <ScaleRuler widthMm={picture.widthMm} />
    {:else}
      <p class="empty">{t('newCartridge.notDrawable')}</p>
    {/if}

    {#if check.problems.length}
      <ul class="problems">
        {#each check.problems as problem (problem)}<li>{problem}</li>{/each}
      </ul>
    {:else if !check.seatable}
      <p class="hint">{t('newCartridge.noBullet')}</p>
    {/if}

    <h2>{t('newCartridge.derived')}</h2>
    <dl class="derived">
      {#if figures.caseCapacityGrainsH2O !== undefined}
        <dt>{t('newCartridge.capacity')}</dt>
        <dd>
          {fixed(figures.caseCapacityGrainsH2O, 2)} gr H₂O
          <span class="unit">({fixed(figures.caseVolumeMm3!, 1)} mm³)</span>
        </dd>
      {/if}
      {#if figures.boreAreaMm2 !== undefined}
        <dt>{t('newCartridge.boreArea')}</dt>
        <dd>{fixed(figures.boreAreaMm2, 3)} mm²</dd>
      {/if}
    </dl>
    {#if figures.missing.length}
      <ul class="problems quiet">
        {#each figures.missing as reason (reason)}<li>{reason}</li>{/each}
      </ul>
    {/if}

    <div class="bar">
      <ShadcnButton variant="outline" type="button" onclick={save} disabled={!draft.name.trim()}>
        {t('newCartridge.save')}
      </ShadcnButton>
    </div>
    <p class="hint">{t('newCartridge.ownership')}</p>

    {#if store.state.cartridges.length}
      <h2>{t('newCartridge.mine')}</h2>
      <ul class="mine">
        {#each store.state.cartridges as mine (mine.id)}
          <li>
            <ShadcnButton variant="outline" type="button" class="linkish" onclick={() => (draft = mine as CartridgeDraft)}>
              {mine.name || mine.key}
            </ShadcnButton>
            <ShadcnButton variant="outline" type="button" onclick={() => store.removeCartridge(mine.id)}>x</ShadcnButton>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>
</div>

</div>
<style>
  @layer legacy {
  :global([data-ui="CartridgeDesigner"] .start) {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: end;
    margin: 0 0 var(--space-4);
    padding: var(--panel-padding);
    border: 1px solid var(--rule);
    border-radius: var(--panel-radius);
    background: var(--surface);
  }
  :global([data-ui="CartridgeDesigner"] .start [data-slot="label"]) {
    display: grid;
    gap: 0.2rem;
    font-size: var(--step-0);
    flex: 1;
    min-width: 0;
  }
  :global([data-ui="CartridgeDesigner"] .start [data-slot="label"].wide) {
    flex: 1;
    min-width: 0;
  }
  :global([data-ui="CartridgeDesigner"] .busy) {
    font-size: 0.85rem;
    color: var(--ink-2);
  }
  :global([data-ui="CartridgeDesigner"] .hint) {
    font-size: 0.8rem;
    color: var(--ink-2);
    max-width: 46rem;
  }
  :global([data-ui="CartridgeDesigner"] .split) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 22rem);
    gap: 1.5rem;
    align-items: start;
  }
  @media (max-width: 60rem) {
    :global([data-ui="CartridgeDesigner"] .split) {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  :global([data-ui="CartridgeDesigner"] .identity) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
    padding: var(--panel-padding);
    border: 1px solid var(--rule);
    border-radius: var(--panel-radius);
    background: var(--surface);
  }
  :global([data-ui="CartridgeDesigner"] .identity [data-slot="label"]) {
    display: grid;
    gap: 0.2rem;
    font-size: 0.85rem;
    min-width: 0;
  }
  :global([data-ui="CartridgeDesigner"] .identity [data-slot="input"]) { width: 100%; }
  :global([data-ui="CartridgeDesigner"] .dimension-fields) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); }
  :global([data-ui="CartridgeDesigner"] .field) {
    display: flex;
    align-items: end;
    gap: 0.3rem;
    min-width: 0;
  }
  :global([data-ui="CartridgeDesigner"] .field [data-slot="label"]) {
    display: grid;
    gap: 0.1rem;
    font-size: 0.8rem;
    flex: 1;
    min-width: 0;
  }
  :global([data-ui="CartridgeDesigner"] .field [data-slot="input"]) {
    font-variant-numeric: tabular-nums;
    min-width: 0;
  }
  :global([data-ui="CartridgeDesigner"] .angle) {
    display: flex;
    align-items: baseline;
    gap: 0.15rem;
    font-size: 0.85rem;
  }
  :global([data-ui="CartridgeDesigner"] .angle [data-slot="input"]) {
    width: 3.2rem;
  }
  :global([data-ui="CartridgeDesigner"] .field.absent [data-slot="input"]) {
    background: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 4px,
      rgba(128, 128, 128, 0.12) 4px,
      rgba(128, 128, 128, 0.12) 8px
    );
  }
  :global([data-ui="CartridgeDesigner"] .name) {
    display: flex;
    gap: 0.3rem;
    align-items: baseline;
  }
  :global([data-ui="CartridgeDesigner"] .rarity) {
    color: var(--ink-2);
    font-size: 0.75rem;
  }
  :global([data-ui="CartridgeDesigner"] .absent-toggle) {
    padding: 0.15rem 0.45rem;
    line-height: 1;
  }
  :global([data-ui="CartridgeDesigner"] .absent-toggle[aria-pressed='true']) {
    font-weight: 700;
  }
  :global([data-ui="CartridgeDesigner"] .disclose) {
    margin-bottom: 1rem;
  }
  :global([data-ui="CartridgeDesigner"] .side) { padding: var(--panel-padding); border: 1px solid var(--rule); border-radius: var(--panel-radius); background: var(--surface); position: sticky; top: 1rem; }
  :global([data-ui="CartridgeDesigner"] .side h2) {
    font-size: 0.95rem;
    margin: 0 0 0.4rem;
  }
  :global([data-ui="CartridgeDesigner"] .drawing svg) {
    width: 100%;
    height: auto;
  }
  :global([data-ui="CartridgeDesigner"] .problems) {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0;
    font-size: 0.85rem;
    color: var(--alert);
  }
  :global([data-ui="CartridgeDesigner"] .problems.quiet) {
    color: var(--ink-2);
  }
  :global([data-ui="CartridgeDesigner"] .derived) {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.2rem 0.6rem;
    font-size: 0.85rem;
    margin: 0 0 0.5rem;
  }
  :global([data-ui="CartridgeDesigner"] .derived dt) {
    color: var(--ink-2);
  }
  :global([data-ui="CartridgeDesigner"] .derived dd) {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  :global([data-ui="CartridgeDesigner"] .unit) {
    color: var(--ink-2);
  }
  :global([data-ui="CartridgeDesigner"] .bar) {
    margin: 0.8rem 0 0.3rem;
  }
  :global([data-ui="CartridgeDesigner"] .mine) {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.3rem;
    font-size: 0.85rem;
  }
  :global([data-ui="CartridgeDesigner"] .mine li) {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  :global([data-ui="CartridgeDesigner"] .linkish) {
    flex: 1;
    text-align: left;
  }
  @media (max-width: 60rem) { :global([data-ui="CartridgeDesigner"] .side) { position: static; } }
  @media (max-width: 40rem) { :global([data-ui="CartridgeDesigner"] .dimension-fields),
:global([data-ui="CartridgeDesigner"] .identity) { grid-template-columns: minmax(0, 1fr); } :global([data-ui="CartridgeDesigner"] .start [data-slot="label"]) { flex-basis: 100%; } }
  :global([data-ui="CartridgeDesigner"] .empty) {
    color: var(--ink-2);
    font-size: 0.85rem;
  }
  }
</style>
