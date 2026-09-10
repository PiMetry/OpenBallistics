/**
 * Getting records to the page.
 *
 * The index ships with the app; a cartridge's dimensions are fetched when one is opened, from the
 * repository's own published records, copied into `dist/` at build time. The list is therefore
 * instant and works offline once loaded.
 *
 * The records are the dataset under data/cartridges/, served as they are (see `scripts/records.mjs`
 * and the `records` plugin in `vite.config.ts`). Every record is included and no value is changed,
 * so a dimension on the page is the dimension in the record.
 */

import indexData from './index.generated.json';
import type { Entry, Record_ } from '@lib/core';

export const entries: Entry[] = indexData as Entry[];
const entriesByKey = new Map(entries.map((entry) => [entry.key, entry]));

export const families: string[] = [...new Set(entries.map((entry) => entry.family))].sort();

/** Every origin named in the dataset, each once, including both halves of a joint standard. */
export const countries: string[] = [
  ...new Set(entries.flatMap((entry) => entry.countries))
].sort();

const cache = new Map<string, Promise<Record_>>();

/** Where a record lives, relative to the deployed base path. */
function recordUrl(entry: Entry): string {
  return `${import.meta.env.BASE_URL}data/cartridges/${entry.family}/${entry.key}.json`;
}

export function byKey(key: string): Entry | undefined {
  return entriesByKey.get(key);
}

export function load(key: string): Promise<Record_> {
  const cached = cache.get(key);
  if (cached) return cached;

  const entry = byKey(key);
  if (!entry) return Promise.reject(new Error(`No cartridge is published under the key "${key}".`));

  const request = fetch(recordUrl(entry)).then((response) => {
    if (!response.ok) throw new Error(`${entry.name}: ${response.status} ${response.statusText}`);
    return response.json() as Promise<Record_>;
  }).catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, request);
  return request;
}

/**
 * Search over name, key and the alternative names the sheet lists.
 *
 * The alternative names are why this is not a substring test on `name` alone: somebody looking for
 * "7.62 x 51" should find `308 Win.`, and the sheet is what says those are the same cartridge.
 */
export function search(query: string, list: Entry[]): Entry[] {
  const needle = normalizeSearch(query);
  if (!needle) return list;
  return list.filter((entry) =>
    [entry.name, entry.key, ...entry.alt].some((name) => normalizeSearch(name).includes(needle))
  );
}

function normalizeSearch(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/x/g, 'x').replace(/[.,\s_]+/g, '');
}

export type Sort = 'name' | 'family' | 'L3' | 'L6' | 'G1';

/** Descending order reverses the chosen column; alphabetical ties and missing values stay put. */
export function sortEntries(
  list: Entry[], column: Sort, direction: 'asc' | 'desc',
  familyName: (family: string) => string, locale: string
): Entry[] {
  const sign = direction === 'asc' ? 1 : -1;
  const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name, 'en');
  return [...list].sort((a, b) => {
    if (column === 'name') return sign * byName(a, b);
    if (column === 'family') {
      return sign * familyName(a.family).localeCompare(familyName(b.family), locale) || byName(a, b);
    }
    const x = a[column], y = b[column];
    if (x === null && y === null) return byName(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    return sign * (x - y) || byName(a, b);
  });
}
