<script lang="ts">
  import { Input } from '$lib/components/ui/input/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Search } from '@lucide/svelte';
  import type { Snippet } from 'svelte';
  import { t } from '../lib/i18n.svelte';
  let { query = $bindable(), placeholder, filters, presentation }: {
    query: string; placeholder: string; filters: Snippet; presentation?: Snippet;
  } = $props();
</script>
<Card.Root class="mb-5 gap-0 py-5">
  <Card.Content>
    <search aria-label={t('searchPanel.label')} class="grid min-w-0 items-end gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Label>{t('list.search')}
        <span class="relative block"><Search class="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" /><Input type="search" class="pl-9" bind:value={query} {placeholder} autocomplete="off" spellcheck="false" /></span>
      </Label>
      <div class="flex min-w-0 flex-wrap items-end gap-4">
        <div class="grid min-w-0 flex-[2_1_16rem] grid-cols-1 gap-4 sm:grid-cols-2">{@render filters()}</div>
        {#if presentation}<div class="min-w-0 flex-[1_1_10rem]">{@render presentation()}</div>{/if}
      </div>
    </search>
  </Card.Content>
</Card.Root>
