import { afterEach, describe, expect, it, vi } from 'vitest';
import { entries, search, sortEntries } from './data';
import type { Entry } from '@lib/core';

afterEach(() => vi.unstubAllGlobals());

describe('catalogue search', () => {
  const row = { ...entries[0]!, key: '308_win', name: '308 Win.', alt: ['7,62 x 51'] };
  it.each(['308_win', '308 win', '.308 Win.', '7.62 x 51', '7,62 x 51', '７.６２ x ５１'])(
    'finds punctuation and key variants: %s', (query) => expect(search(query, [row])).toEqual([row])
  );
  it('keeps blank searches and does not match across unrelated names', () => {
    const list = [row];
    expect(search('  ', list)).toBe(list);
    expect(search('win7', list)).toEqual([]);
  });
});

describe('catalogue sorting', () => {
  const row = (name: string, value: number | null, family = 'a'): Entry => ({
    ...entries[0]!, name, L3: value, L6: value, G1: value, family
  });
  const rows = [row('Zulu', 2), row('Bravo', null), row('Beta', 1), row('Alpha', 2), row('Absent', null)];
  it.each(['L3', 'L6', 'G1'] as const)('keeps %s ties alphabetical and missing values last', (column) => {
    expect(sortEntries(rows, column, 'desc', String, 'en').map((r) => r.name))
      .toEqual(['Alpha', 'Zulu', 'Beta', 'Absent', 'Bravo']);
    expect(sortEntries(rows, column, 'asc', String, 'en').map((r) => r.name))
      .toEqual(['Beta', 'Alpha', 'Zulu', 'Absent', 'Bravo']);
    expect(rows[0]!.name).toBe('Zulu');
  });
  it('sorts translated family labels, with alphabetical ties in either direction', () => {
    const list = [row('Zulu', 1, 'a'), row('Alpha', 1, 'a'), row('Beta', 1, 'b')];
    const label = (family: string) => family === 'a' ? 'Z' : 'A';
    expect(sortEntries(list, 'family', 'desc', label, 'de').map((r) => r.name)).toEqual(['Alpha', 'Zulu', 'Beta']);
    expect(sortEntries(list, 'family', 'asc', label, 'de').map((r) => r.name)).toEqual(['Beta', 'Alpha', 'Zulu']);
  });
  it('reverses names when requested', () => {
    expect(sortEntries(rows, 'name', 'desc', String, 'en')[0]!.name).toBe('Zulu');
  });
});

describe.each(['cartridge', 'bullet'] as const)('%s request caching', (kind) => {
  async function loader() {
    vi.resetModules();
    if (kind === 'cartridge') {
      const { load, entries } = await import('./data');
      const entry = entries[0]!;
      return { load, key: entry.key, path: `data/cartridges/${entry.family}/${entry.key}.json` };
    }
    const { loadBullet, bullets } = await import('./bullets');
    return { load: loadBullet, key: bullets[0]!.key, path: `data/bullets/${bullets[0]!.key}.json` };
  }
  it('shares concurrent requests and keeps successful results', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetcher);
    const { load, key, path } = await loader();
    const first = load(key);
    expect(load(key)).toBe(first);
    await expect(first).resolves.toEqual({ ok: true });
    expect(load(key)).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}${path}`);
  });
  it.each(['network', 'http', 'json'])('allows retry after a %s failure', async (failure) => {
    const fetcher = vi.fn();
    if (failure === 'network') fetcher.mockRejectedValueOnce(new TypeError('Offline'));
    else fetcher.mockResolvedValueOnce(failure === 'http'
      ? new Response('', { status: 503 }) : new Response('invalid json'));
    fetcher.mockResolvedValueOnce(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetcher);
    const { load, key } = await loader();
    await expect(load(key)).rejects.toBeInstanceOf(Error);
    await expect(load(key)).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects unknown keys without requesting a URL', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { load } = await loader();
    await expect(load('not-a-published-key')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
