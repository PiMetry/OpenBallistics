<script lang="ts">
  import Panel from '../components/ui/Panel.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { ArrowUpRight, Calculator, ChartLine, Target } from '@lucide/svelte';
  import { href } from '../lib/router';
  import { t } from '../lib/i18n.svelte';
  const tools = $derived([
    { url: href.calculator(), title: t('preview.calculator'), description: t('preview.calculatorNote'), icon: Calculator },
    { url: href.trajectory(), title: t('trajectory.title'), description: t('preview.trajectoryNote'), icon: ChartLine },
    { url: href.targetScoring(), title: t('photo.title'), description: t('photo.lede'), icon: Target }
  ]);
</script>
<PageHeader title={t('preview.title')} description={t('preview.lede')} />
<div class="mb-8 grid gap-5 xl:grid-cols-3">
  {#each tools as tool}
    <a href={tool.url} class="group min-w-0 text-foreground no-underline hover:no-underline">
      <Card.Root class="h-full transition-shadow group-hover:ring-foreground/30">
        <Card.Header class="gap-4">
          <div class="flex items-center justify-between"><span class="flex size-11 items-center justify-center rounded-lg bg-muted"><tool.icon class="size-5" /></span><ArrowUpRight class="size-4 text-muted-foreground" /></div>
          <Badge variant="secondary" class="w-fit text-xs font-normal">{t('preview.badge')}</Badge>
          <Card.Title><h2 class="text-lg font-semibold">{tool.title}</h2></Card.Title>
        </Card.Header>
        <Card.Content><p class="m-0 text-sm leading-relaxed text-muted-foreground">{tool.description}</p></Card.Content>
      </Card.Root>
    </a>
  {/each}
</div>
<Panel title={t('preview.todo')}>
  <ul class="list-disc space-y-2 pl-5 text-sm text-muted-foreground"><li>{t('preview.todo.connect')}</li><li>{t('preview.todo.photo')}</li></ul>
</Panel>
