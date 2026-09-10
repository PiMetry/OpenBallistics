<script lang="ts">
  import Panel from './ui/Panel.svelte';
  import { Label } from '$lib/components/ui/label/index.js';
  import { NativeSelect } from '$lib/components/ui/native-select/index.js';
  import { lang, LANG_LABELS, LANGS, setLang, t, type Lang } from '../lib/i18n.svelte';
  import { theme, toggleTheme } from '../lib/theme.svelte';
  import { barrelUnit, setBarrelUnit, setUnitSystem, unitSystem } from '../lib/units.svelte';
  import type { UnitSystem } from '../lib/units';
  const id = $props.id();
</script>
<Panel title={t('settings.title')} description={t('settings.local')}>
  <div class="divide-y">
    <div class="settings-row">
      <div><Label for={`${id}-units`}>{t('settings.units')}</Label><p class="help">{t('settings.unitsHint')}</p></div>
      <NativeSelect id={`${id}-units`} value={unitSystem()} onchange={(event) => setUnitSystem(event.currentTarget.value as UnitSystem)}>
        <option value="metric">{t('settings.metric')}</option><option value="imperial">{t('settings.imperial')}</option>
      </NativeSelect>
    </div>
    <div class="settings-row">
      <div><Label for={`${id}-barrel`}>{t('settings.barrelUnits')}</Label><p class="help">{t('settings.barrelHint')}</p></div>
      <NativeSelect id={`${id}-barrel`} value={barrelUnit()} onchange={(event) => setBarrelUnit(event.currentTarget.value as 'in' | 'mm')}>
        <option value="in">{t('settings.inches')}</option><option value="mm">{t('settings.millimetres')}</option>
      </NativeSelect>
    </div>
    <div class="settings-row">
      <Label for={`${id}-language`}>{t('settings.language')}</Label>
      <NativeSelect id={`${id}-language`} value={lang()} onchange={(event) => setLang(event.currentTarget.value as Lang)}>
        {#each LANGS as code}<option value={code} lang={code}>{LANG_LABELS[code]}</option>{/each}
      </NativeSelect>
    </div>
    <div class="settings-row">
      <Label for={`${id}-theme`}>{t('settings.appearance')}</Label>
      <NativeSelect id={`${id}-theme`} value={theme()} onchange={(event) => { if (event.currentTarget.value !== theme()) toggleTheme(); }}>
        <option value="light">{t('settings.light')}</option><option value="dark">{t('settings.dark')}</option>
      </NativeSelect>
    </div>
  </div>
</Panel>
<style>
  .settings-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(12rem, 18rem); gap: 1.5rem; align-items: center; padding-block: 1.5rem; }
  .settings-row:first-child { padding-top: 0; }
  .settings-row:last-child { padding-bottom: 0; }
  .help { max-width: 48ch; color: var(--muted-foreground); font-size: .875rem; line-height: 1.5; margin: .5rem 0 0; }
  @media (max-width: 40rem) { .settings-row { grid-template-columns: minmax(0, 1fr); gap: .75rem; } }
</style>
