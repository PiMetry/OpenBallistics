/**
 * Two views is not a routing problem. `#/` and `#/c/<key>` are the whole surface, and a hash route
 * works on GitHub Pages without a server rewrite -- a path-based router would 404 on a hard refresh
 * of any URL but the root.
 */

import { readable } from 'svelte/store';

export type Route = { view: 'list' } | { view: 'cartridge'; key: string };

export function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  if (path?.startsWith('c/')) return { view: 'cartridge', key: decodeURIComponent(path.slice(2)) };
  return { view: 'list' };
}

export const route = readable<Route>(parse(location.hash), (set) => {
  const update = () => set(parse(location.hash));
  addEventListener('hashchange', update);
  return () => removeEventListener('hashchange', update);
});

export const href = {
  list: () => '#/',
  cartridge: (key: string) => `#/c/${encodeURIComponent(key)}`
};
