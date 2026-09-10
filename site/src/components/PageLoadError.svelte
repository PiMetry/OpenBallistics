<script lang="ts">
  import { Button as ShadcnButton } from '$lib/components/ui/button/index.js';

  import { t } from '../lib/i18n.svelte';
</script>
<div data-ui="PageLoadError" class="contents">

<div class="failure" role="alert">
  <p>{t('site.loadFailed')}</p>
  <ShadcnButton variant="outline" type="button" onclick={() => location.reload()}>{t('site.reload')}</ShadcnButton>
</div>

</div>
<style>
  @layer legacy {
  :global([data-ui="PageLoadError"] .failure) {
    padding: 1.5rem;
    border: 1px solid var(--rule-strong);
    border-radius: var(--panel-radius);
    background: var(--surface);
  }
  :global([data-ui="PageLoadError"] p) {
    margin: 0 0 1rem;
    color: var(--alert);
  }
  :global([data-ui="PageLoadError"] [data-slot="button"]) {
    padding: 0.55rem 0.85rem;
    border: 1px solid var(--link);
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--link);
  }
  }
</style>
