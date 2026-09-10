import { describe, expect, it, vi } from 'vitest';
import { indexedStore, replaceRecords } from './idb';

function fakeDatabase() {
  const objectStore = { put: vi.fn(), delete: vi.fn(), clear: vi.fn(), getAll: vi.fn(() => ({ result: [] })) };
  const tx = { objectStore: vi.fn(() => objectStore), oncomplete: null as any, onabort: null as any, onerror: null as any, error: null as Error | null, abort: vi.fn() };
  const db = { transaction: vi.fn(() => tx) } as unknown as IDBDatabase;
  return { db, tx, objectStore };
}

describe('database commit boundary', () => {
  it('does not report a write complete until the transaction commits', async () => {
    const { db, tx } = fakeDatabase();
    let saved = false;
    const result = indexedStore(db, 'rifles').put({ id: 'one' }).then(() => { saved = true; });
    await Promise.resolve();
    expect(saved).toBe(false);
    tx.oncomplete();
    await result;
    expect(saved).toBe(true);
  });

  it('reports a transaction that aborts after requests were queued', async () => {
    const { db, tx } = fakeDatabase();
    const result = indexedStore(db, 'rifles').put({ id: 'one' });
    tx.error = new Error('Quota exceeded');
    tx.onabort();
    await expect(result).rejects.toThrow('Quota exceeded');
  });

  it('puts every imported collection in the same transaction', async () => {
    const { db, tx } = fakeDatabase();
    const result = replaceRecords(db, { rifles: [], cartridges: [], reticles: [], targetFaces: [] });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.transaction).toHaveBeenCalledWith(['rifles', 'cartridges', 'reticles', 'targetFaces'], 'readwrite');
    tx.oncomplete();
    await result;
  });
});
