import { beforeEach, expect, it, vi } from 'vitest';
import type { Entry } from '@lib/core';

vi.mock('./data', () => ({ load: vi.fn() }));
const entry = { key: 'example' } as Entry;

beforeEach(() => vi.resetModules());

it('does not keep a failed drawing request in the cache', async () => {
  const { load } = await import('./data');
  vi.mocked(load).mockReset().mockRejectedValueOnce(new Error('Offline')).mockRejectedValueOnce(new Error('Retry'));
  const { liveFor } = await import('./live');
  const first = liveFor(entry, null, 'visual', false, 1);
  expect(liveFor(entry, null, 'visual', false, 1)).toBe(first);
  await expect(first).rejects.toThrow('Offline');
  await expect(liveFor(entry, null, 'visual', false, 1)).rejects.toThrow('Retry');
  expect(load).toHaveBeenCalledTimes(2);
});
