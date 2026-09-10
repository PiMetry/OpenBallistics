<script lang="ts">
  import { pageIssueUrl } from '../lib/issue';
  import { t } from '../lib/i18n.svelte';
  import type { Route } from '../lib/router';
  let { current }: { current: Route } = $props();
  const fallback = $derived(pageIssueUrl(location.href, current.view + ('key' in current && current.key ? `: ${current.key}` : '')));
  function update(event: Event) {
    const title = document.querySelector('main h1')?.textContent?.trim() ?? current.view;
    const selections = [...document.querySelectorAll<HTMLSelectElement>('main select[data-report-context]')]
      .filter(select => select.value).map(select => `${select.dataset.reportContext}: ${select.selectedOptions[0]?.textContent?.trim() ?? select.value} (${select.value})`);
    const key = 'key' in current && current.key ? [`Record: ${current.key}`] : [];
    (event.currentTarget as HTMLAnchorElement).href = pageIssueUrl(location.href, [title, ...key, ...selections].join('\n'));
  }
</script>
<a href={fallback} onpointerenter={update} onfocus={update} onclick={update} target="_blank" rel="noopener noreferrer">{t('record.report')}</a>
