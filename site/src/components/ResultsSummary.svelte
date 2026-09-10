<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import type { Snippet } from 'svelte';
  import { t } from '../lib/i18n.svelte';
  let { count, filtering, onclear, controls }: { count: string; filtering: boolean; onclear: () => void; controls?: Snippet } = $props();
</script>
<div class="mb-5 flex min-h-10 flex-wrap items-center justify-between gap-3">
  <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
    <p class="m-0" role="status">{count}</p>
    {#if filtering}<Button variant="ghost" size="sm" onclick={onclear}>{t('list.clear')}</Button>{/if}
  </div>
  {#if controls}<div class="min-w-0 max-w-full">{@render controls()}</div>{/if}
</div>
