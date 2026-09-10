<script lang="ts">
  import type { Snippet } from 'svelte';
  import * as Card from '$lib/components/ui/card/index.js';
  import * as Field from '$lib/components/ui/field/index.js';
  let { title, description, disabled = false, children }: {
    title: string; description?: string; disabled?: boolean; children: Snippet;
  } = $props();
</script>

<Card.Root class="min-w-0 overflow-visible">
  <Card.Content>
    <Field.Set {disabled} class="min-w-0">
      <Field.Legend class="mb-5 font-semibold">{title}</Field.Legend>
      {#if description}<Field.Description class="mb-5">{description}</Field.Description>{/if}
      <div class="min-w-0">{@render children()}</div>
    </Field.Set>
  </Card.Content>
</Card.Root>
