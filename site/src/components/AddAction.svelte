<script lang="ts">
  import Button from './ui/Button.svelte';
  let { label, href, onclick, disabled = false }: {
    label: string; href?: string; onclick?: () => void; disabled?: boolean;
  } = $props();
</script>
<Button variant="primary" {href} {onclick} {disabled}><span aria-hidden="true">+</span>{label}</Button>
<style>
  @layer legacy {
  span { font-size: 1.2rem; line-height: 1; }
  }
</style>
