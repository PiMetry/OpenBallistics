/**
 * The browser half of the user's storage: one IndexedDB database, several object stores.
 *
 * Split out of `rifles.svelte.ts` when a second kind of record arrived. The plumbing is identical
 * for every kind - open, read all, put, delete, replace - and `@lib/userdata` already describes a
 * store as an interface, so this implements that interface once instead of once per kind.
 *
 * Storage failure handling:
 *
 * - **Opening never throws.** A private window, blocked site data, an eviction: a refusal is an
 *   answer, and the caller falls back to the in-memory store rather than crashing.
 * - **The fallback is not a special path.** It is `memoryStore` from the library, the same
 *   interface, the one the tests run against - so the degraded path is the best-tested one.
 */

import type { Store, UserData } from '@lib/userdata';

const DB_NAME = 'openballistics';

/**
 * Schema version 3.
 *
 * v1 held `rifles` alone, v2 added `cartridges`, v3 adds `reticles` and `targetFaces`. The upgrade
 * *adds* rather than rewrites, because a user's database is already at whichever version they last
 * opened and the path has to stay walkable from any of them - an upgrade that assumed v1 would
 * strand anyone who skipped it. Creating every missing store rather than only the ones this
 * version introduced is what makes that true for free.
 */
const DB_VERSION = 3;

export const STORES = ['rifles', 'cartridges', 'reticles', 'targetFaces'] as const;
export type StoreName = (typeof STORES)[number];

/** Request success precedes commit: only the transaction can report a durable write. */
function transaction<T>(db: IDBDatabase, names: StoreName[], mode: IDBTransactionMode,
  enqueue: (tx: IDBTransaction) => () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode);
    let result: () => T;
    tx.oncomplete = () => resolve(result());
    tx.onabort = () => reject(tx.error ?? new Error('The database transaction was cancelled.'));
    tx.onerror = () => {}; // An unhandled request error aborts; report it once via onabort.
    try {
      result = enqueue(tx);
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

// Records are JSON data. This also unwraps Svelte proxies before IndexedDB clones them.
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Restore all record types together, or leave the entire database unchanged. */
export function replaceRecords(db: IDBDatabase, data: Pick<UserData, StoreName>): Promise<void> {
  return transaction(db, [...STORES], 'readwrite', tx => {
    for (const name of STORES) {
      const store = tx.objectStore(name);
      store.clear();
      for (const item of data[name]) store.put(plain(item));
    }
    return () => undefined;
  });
}

/** Open the database, or say why not. Never throws. */
export function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      // Blocked site data throws here rather than failing later.
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!req.result.objectStoreNames.contains(name)) {
          req.result.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    let blocked = false;
    req.onsuccess = () => {
      if (blocked) { req.result.close(); return; }
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => { blocked = true; resolve(null); };
  });
}

/** One object store, behind the library's interface. */
export function indexedStore<T extends { id: string }>(
  db: IDBDatabase,
  name: StoreName
): Store<T> {
  return {
    durable: true,
    async all() {
      return transaction(db, [name], 'readonly', tx => {
        const request = tx.objectStore(name).getAll();
        return () => request.result as T[];
      });
    },
    async put(item) {
      await transaction(db, [name], 'readwrite', tx => {
        tx.objectStore(name).put(plain(item));
        return () => undefined;
      });
    },
    async remove(id) {
      await transaction(db, [name], 'readwrite', tx => {
        tx.objectStore(name).delete(id);
        return () => undefined;
      });
    },
    async replaceAll(items) {
      await transaction(db, [name], 'readwrite', tx => {
        const store = tx.objectStore(name);
        store.clear();
        for (const item of items) store.put(plain(item));
        return () => undefined;
      });
    }
  };
}
