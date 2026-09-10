<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ArrowLeft } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge/index.js';
  let { title, description, eyebrow, backHref, backLabel, actions }: {
    title: string; description?: string; eyebrow?: string;
    backHref?: string; backLabel?: string; actions?: Snippet;
  } = $props();
</script>
<header class="mb-8">
  {#if backHref}<a href={backHref} class="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft class="size-3.5" />{backLabel}</a>{/if}
  <div class="flex flex-wrap items-start justify-between gap-5">
    <div class="min-w-0 flex-1 basis-72">
      {#if eyebrow}<Badge variant="outline" class="mb-3 text-xs font-normal text-muted-foreground">{eyebrow}</Badge>{/if}
      <h1 class="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {#if description}<p class="mt-2 mb-0 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>{/if}
    </div>
    {#if actions}<div class="flex max-w-full flex-wrap items-center gap-2">{@render actions()}</div>{/if}
  </div>
</header>
