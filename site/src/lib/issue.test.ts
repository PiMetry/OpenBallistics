import { afterEach, expect, it, vi } from 'vitest';
import { pageIssueUrl } from './issue';
import { entries } from './data';
import { bullets } from './bullets';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('preserves page hashes, query parameters and multiline context in reports', () => {
  const page = 'https://example.org/app/#/targets/score?target=bds_25m_interval';
  const context = 'Target scoring\nTarget: BDS 25 m Intervall (bds_25m_interval)';
  const url = new URL(pageIssueUrl(page, context));
  expect(url.searchParams.get('template')).toBe('site-feedback.yml');
  expect(url.searchParams.get('page')).toBe(page);
  expect(url.searchParams.get('context')).toBe(context);
  expect(url.searchParams.get('title')).toBe('Site: Target scoring');
});

it('keeps all project interactions in OpenBallistics regardless of deployment overrides', async () => {
  vi.resetModules();
  vi.stubEnv('VITE_REPO', 'Example/Unrelated');
  vi.stubGlobal('location', { origin: 'https://preview.example.org', pathname: '/preview/' });
  const { REPOSITORY_URL } = await import('./repository');
  const issues = await import('./issue');
  expect(REPOSITORY_URL).toBe('https://github.com/PiMetry/OpenBallistics');
  const cartridge = entries[0]!;
  const bullet = bullets[0]!;
  const cases = [
    [issues.pageIssueUrl('https://preview.example.org/preview/#/guns', 'My guns'), 'site-feedback.yml'],
    [issues.issueUrl(cartridge), 'data.yml'],
    [issues.bulletIssueUrl(bullet), 'bullet.yml'],
    [issues.formUrl('site-feedback.yml', '', 'Site: Feedback', { context: 'Current page' }), 'site-feedback.yml']
  ];
  for (const [link, template] of cases) {
    const url = new URL(link!);
    expect(url.origin + url.pathname).toBe('https://github.com/PiMetry/OpenBallistics/issues/new');
    expect(url.searchParams.get('template')).toBe(template);
  }
  expect(new URL(issues.issueUrl(cartridge)).searchParams.get('page'))
    .toBe(`https://preview.example.org/preview/#/c/${encodeURIComponent(cartridge.key)}`);
  expect(new URL(issues.bulletIssueUrl(bullet)).searchParams.get('page'))
    .toBe(`https://preview.example.org/preview/#/b/${encodeURIComponent(bullet.key)}`);
});
