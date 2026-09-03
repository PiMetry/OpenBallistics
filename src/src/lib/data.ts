/**
 * Getting records to the page.
 *
 * The index ships with the app; a cartridge's dimensions are fetched when one is opened, from the
 * repository's own published records, copied into `public/` at build time. The list is therefore
 * instant and works offline once loaded.
 *
 * The records are the dataset at the repository root, served as they are (see `scripts/records.mjs`
 * and the `records` plugin in `vite.config.ts`); the ones `scope.json` names are left out. Nothing
 * is *added* and no value is changed, so a dimension on the page is the dimension in the record.
 */

import indexData from './index.generated.json';
import type { Entry, Record_ } from './types';

export const entries: Entry[] = indexData as Entry[];

export const families: string[] = [...new Set(entries.map((entry) => entry.family))].sort();

/** Every origin named in the dataset, each once, including both halves of a joint standard. */
export const countries: string[] = [
  ...new Set(entries.flatMap((entry) => entry.countries))
].sort();

const cache = new Map<string, Promise<Record_>>();

/** Where a record lives, relative to the deployed base path. */
function recordUrl(entry: Entry): string {
  return `${import.meta.env.BASE_URL}${entry.family}/${entry.key}.json`;
}

export function byKey(key: string): Entry | undefined {
  return entries.find((entry) => entry.key === key);
}

export function load(key: string): Promise<Record_> {
  const cached = cache.get(key);
  if (cached) return cached;

  const entry = byKey(key);
  if (!entry) return Promise.reject(new Error(`No cartridge is published under the key "${key}".`));

  const request = fetch(recordUrl(entry)).then((response) => {
    if (!response.ok) throw new Error(`${entry.name}: ${response.status} ${response.statusText}`);
    return response.json() as Promise<Record_>;
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
  const needle = query.trim().toLowerCase().replace(/[.,\s]+/g, '');
  if (!needle) return list;
  return list.filter((entry) => {
    const haystack = [entry.name, entry.key, ...entry.alt].join(' ').toLowerCase();
    return haystack.replace(/[.,\s_]+/g, '').includes(needle);
  });
}
