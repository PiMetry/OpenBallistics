<script lang="ts">
  import type { Snippet } from 'svelte';
  import * as Card from '$lib/components/ui/card/index.js';
  let { title, description, children, actions }: {
    title?: string; description?: string; children: Snippet; actions?: Snippet;
  } = $props();
</script>

<Card.Root class="min-w-0 overflow-visible">
  {#if title || description || actions}
    <Card.Header>
      {#if title}<Card.Title><h2 class="text-base font-semibold">{title}</h2></Card.Title>{/if}
      {#if description}<Card.Description>{description}</Card.Description>{/if}
      {#if actions}<Card.Action><div class="flex flex-wrap gap-2">{@render actions()}</div></Card.Action>{/if}
    </Card.Header>
  {/if}
  <Card.Content class="min-w-0">{@render children()}</Card.Content>
</Card.Root>
