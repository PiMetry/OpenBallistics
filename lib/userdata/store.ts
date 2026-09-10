/**
 * Storage interfaces for personal records.
 * The IndexedDB and in-memory backends share store logic. When browser storage is
 * unavailable, the memory backend preserves session use, and `durable` lets the app
 * explain that records will not persist. Tests use the same memory backend.
 */

import type { Gun } from './types';

/**
 * A store of one kind of user record.
 *
 * Generic because rifles were the first kind and are not the last - a designed cartridge is kept
 * the same way, and the IndexedDB adapter in the app is written once against this interface rather
 * than once per kind.
 */
export interface Store<T extends { id: string }> {
  /** False when this is memory only: the session survives, the data does not. */
  readonly durable: boolean;
  all(): Promise<T[]>;
  put(item: T): Promise<void>;
  remove(id: string): Promise<void>;
  /** Used by import, which decides the whole set at once. */
  replaceAll(items: T[]): Promise<void>;
}

/** The gun store, named because it reads better at the call sites than the generic form. */
export type GunStore = Store<Gun>;

/**
 * Records held for this session only.
 *
 * Not a mock: this is what runs when the browser refuses storage, so it has to behave.
 */
export function memoryStore<T extends { id: string }>(seed: T[] = []): Store<T> {
  const held = new Map<string, T>(seed.map((r) => [r.id, r]));
  return {
    durable: false,
    async all() {
      return [...held.values()];
    },
    async put(item) {
      held.set(item.id, item);
    },
    async remove(id) {
      held.delete(id);
    },
    async replaceAll(items) {
      held.clear();
      for (const item of items) held.set(item.id, item);
    }
  };
}

/** A fresh id. Sortable by creation, so a list has a sensible default order. */
export function newId(prefix = 'rfl', now = Date.now(), random = Math.random): string {
  const stamp = now.toString(36).padStart(9, '0');
  const noise = Math.floor(random() * 0xffffff)
    .toString(36)
    .padStart(5, '0');
  return `${prefix}_${stamp}${noise}`;
}

/**
 * Save a gun, keeping its timestamps honest.
 *
 * `created` is set once and never moved; `updated` is what an import compares to decide whether a
 * file is newer than what is held, so it has to advance on every write or the merge plan in
 * `transfer.ts` cannot tell an edit from a duplicate.
 */
export async function saveGun(
  store: GunStore,
  gun: Omit<Gun, 'created' | 'updated'> & Partial<Pick<Gun, 'created' | 'updated'>>,
  now = new Date().toISOString()
): Promise<Gun> {
  const full: Gun = { ...gun, created: gun.created ?? now, updated: now } as Gun;
  await store.put(full);
  return full;
}
