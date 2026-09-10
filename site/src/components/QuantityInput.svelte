<script lang="ts">
  import { Label } from '$lib/components/ui/label/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { NativeSelect } from '$lib/components/ui/native-select/index.js';

  import { t } from '../lib/i18n.svelte';
  import { defaultUnit, displayNumber, parseQuantity, UNITS, type Quantity, type Unit, type UnitSystem } from '../lib/units';
  interface Props {
    label: string;
    value: number | undefined;
    quantity: Quantity;
    system: UnitSystem;
    defaultDisplayUnit?: Unit;
    twist?: boolean;
    required?: boolean;
    positive?: boolean;
  }
  let { label, value = $bindable(), quantity, system, defaultDisplayUnit, twist = false, required = false, positive = false }: Props = $props();
  const id = $props.id();
  let override = $state<Unit | undefined>();
  const preferred = $derived(defaultDisplayUnit ?? defaultUnit(quantity, system));
  const unit = $derived(override ?? preferred);
  let raw = $state('');
  let invalid = $state(false);
  let input = $state<HTMLInputElement>(null!);
  let lastValue: number | undefined;
  let lastUnit: Unit | undefined;
  $effect(() => { preferred; override = undefined; });
  $effect(() => {
    if (value !== lastValue || unit !== lastUnit) {
      if (invalid && value === lastValue) { lastUnit = unit; return; }
      raw = displayNumber(value, unit);
      lastValue = value;
      lastUnit = unit;
      invalid = false;
      input?.setCustomValidity('');
    }
  });
  function change(event: Event) {
    const field = event.currentTarget as HTMLInputElement;
    raw = twist ? field.value.replace(/^\s*1\s*:\s*/, '') : field.value;
    const next = parseQuantity(raw, unit);
    invalid = next !== undefined && (!Number.isFinite(next) || (positive && next <= 0));
    field.setCustomValidity(invalid ? t('units.invalid') : '');
    lastValue = invalid ? undefined : next;
    value = lastValue;
  }
</script>
<div class="min-w-0 space-y-2">
  <Label for={id}>{label}</Label>
  <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_5.25rem] gap-2">
    <span class="relative block min-w-0">
      {#if twist}<span class="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-sm" aria-hidden="true">1:</span>{/if}
      <Input {id} class={twist ? 'pl-8' : ''} bind:ref={input} value={raw} oninput={change} inputmode="decimal" {required}
        aria-label={twist ? `${label} (1:n ${unit})` : `${label} (${unit})`} aria-invalid={invalid || undefined} />
    </span>
    <NativeSelect aria-label={t('units.for', { field: label })} value={unit} disabled={invalid}
      onchange={(e) => { override = e.currentTarget.value as Unit; }}>
      {#each UNITS[quantity] as option}<option value={option}>{option === 'in' ? t('units.inch') : option === 'moa' ? 'MOA' : option}</option>{/each}
    </NativeSelect>
  </div>
</div>
