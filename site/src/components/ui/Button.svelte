<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  let { children, href, onclick, disabled = false, type = 'button', variant = 'secondary' }: {
    children: Snippet; href?: string; onclick?: () => void; disabled?: boolean;
    type?: 'button' | 'submit' | 'reset'; variant?: 'primary' | 'secondary';
  } = $props();
</script>

<Button variant={variant === 'primary' ? 'default' : 'outline'} {href} {type} {disabled} {onclick}>
  {@render children()}
</Button>
