/**
 * Everything the user owns, as the app holds it: rifles, cartridges they designed, reticles they
 * measured off their own glass, and target faces they drew.
 *
 * Two jobs, and the split matters. The *shapes*, the export file and the merge rules are
 * `@lib/userdata`, framework-free and tested. What is here is the part that cannot be: the rune
 * state components read, and the wiring to the browser database. The database plumbing itself
 * moved to `idb.ts` when a second kind of record arrived - it is identical for every kind.
 *
 * The database is asynchronous and components are not, so it is read
 * once at startup into `rifles` and never touched again from a component. And storage can be
 * refused - a private window, blocked site data, an eviction - in which case this falls back to
 * the in-memory store from `@lib/userdata`. That is the same interface, not a special path, so it
 * behaves; and `durable` goes false so the UI can say the one thing the user must be told.
 *
 * The export carries **everything**, not just rifles: a backup that quietly left the user's
 * designed cartridges behind would be worse than no backup, because it would look like one.
 */

import {
  memoryStore,
  parse,
  planMerge,
  applyMerge,
  saveGun as saveToStore,
  serialise,
  emptyUserData,
  type MergeRow,
  type Gun,
  type GunStore,
  type Store,
  type StoredCartridge,
  type StoredReticle,
  type StoredTargetFace
} from '@lib/userdata';
import { indexedStore, openDatabase, replaceRecords } from './idb';
let database: IDBDatabase | null = null;
let loading: Promise<void> | undefined;

let store: GunStore = memoryStore<Gun>();
let cartridgeStore: Store<StoredCartridge> = memoryStore<StoredCartridge>();
let reticleStore: Store<StoredReticle> = memoryStore<StoredReticle>();
let faceStore: Store<StoredTargetFace> = memoryStore<StoredTargetFace>();

/** The user's records, for components to read. Written only by the functions below. */
export const state = $state<{
  rifles: Gun[];
  cartridges: StoredCartridge[];
  reticles: StoredReticle[];
  targetFaces: StoredTargetFace[];
  durable: boolean;
  ready: boolean;
  importing: boolean;
}>({
  rifles: [],
  cartridges: [],
  reticles: [],
  targetFaces: [],
  durable: false,
  ready: false,
  importing: false
});

/** Read once, at startup. Both kinds, from one open. */
export function load(): Promise<void> {
  if (loading) return loading;
  loading = loadRecords().finally(() => { loading = undefined; });
  return loading;
}

async function loadRecords(): Promise<void> {
  state.ready = false;
  database?.close();
  const db = await openDatabase();
  database = db;
  store = db ? indexedStore<Gun>(db, 'rifles') : memoryStore<Gun>();
  cartridgeStore = db
    ? indexedStore<StoredCartridge>(db, 'cartridges')
    : memoryStore<StoredCartridge>();
  reticleStore = db ? indexedStore<StoredReticle>(db, 'reticles') : memoryStore<StoredReticle>();
  faceStore = db
    ? indexedStore<StoredTargetFace>(db, 'targetFaces')
    : memoryStore<StoredTargetFace>();
  try {
    state.rifles = await store.all();
    state.cartridges = await cartridgeStore.all();
    state.reticles = await reticleStore.all();
    state.targetFaces = await faceStore.all();
  } catch {
    db?.close();
    database = null;
    // A database that opens but will not read is worse than none: fall back rather than sit empty.
    store = memoryStore<Gun>();
    cartridgeStore = memoryStore<StoredCartridge>();
    reticleStore = memoryStore<StoredReticle>();
    faceStore = memoryStore<StoredTargetFace>();
    state.rifles = [];
    state.cartridges = [];
    state.reticles = [];
    state.targetFaces = [];
  }
  state.durable = store.durable;
  state.ready = true;
}

async function writable(): Promise<void> {
  if (loading) await loading;
  else if (!state.ready) await load();
  if (state.importing) throw new Error('An import is in progress. Wait for it to finish.');
}

// Serialize mutations so an import cannot race a save that has already started.
let writes: Promise<void> = Promise.resolve();
function mutate<T>(run: () => Promise<T>): Promise<T> {
  const next = writes.then(async () => { await writable(); return run(); });
  writes = next.then(() => undefined, () => undefined);
  return next;
}

export async function saveCartridge(cartridge: StoredCartridge): Promise<StoredCartridge> {
  return mutate(async () => {
    await cartridgeStore.put(cartridge);
    state.cartridges = [...state.cartridges.filter((c) => c.id !== cartridge.id), cartridge];
    return cartridge;
  });
}

export async function removeCartridge(id: string): Promise<void> {
  return mutate(async () => {
    await cartridgeStore.remove(id);
    state.cartridges = state.cartridges.filter((c) => c.id !== id);
  });
}

export async function saveReticle(reticle: StoredReticle): Promise<StoredReticle> {
  return mutate(async () => {
    await reticleStore.put(reticle);
    state.reticles = [...state.reticles.filter((r) => r.id !== reticle.id), reticle];
    return reticle;
  });
}

export async function removeReticle(id: string): Promise<void> {
  return mutate(async () => {
    await reticleStore.remove(id);
    state.reticles = state.reticles.filter((r) => r.id !== id);
  });
}

export async function saveTargetFace(face: StoredTargetFace): Promise<StoredTargetFace> {
  return mutate(async () => {
    await faceStore.put(face);
    state.targetFaces = [...state.targetFaces.filter((f) => f.id !== face.id), face];
    return face;
  });
}

export async function removeTargetFace(id: string): Promise<void> {
  return mutate(async () => {
    await faceStore.remove(id);
    state.targetFaces = state.targetFaces.filter((f) => f.id !== id);
  });
}

export async function save(rifle: Parameters<typeof saveToStore>[1]): Promise<Gun> {
  return mutate(async () => {
    const saved = await saveToStore(store, rifle);
    state.rifles = [...state.rifles.filter((r) => r.id !== saved.id), saved];
    return saved;
  });
}

export async function remove(id: string): Promise<void> {
  return mutate(async () => {
    await store.remove(id);
    state.rifles = state.rifles.filter((r) => r.id !== id);
  });
}

/** Everything the user has, as the file they keep. */
export function exportAll(commit?: string): string {
  return serialise({
    ...emptyUserData(),
    app: { name: 'OpenBallistics', commit },
    rifles: state.rifles,
    cartridges: state.cartridges,
    reticles: state.reticles,
    targetFaces: state.targetFaces
  });
}

export type ImportPreview =
  | { ok: false; error: string }
  | {
      ok: true;
      plan: MergeRow[];
      cartridgePlan: MergeRow[];
      reticlePlan: MergeRow[];
      facePlan: MergeRow[];
      apply: () => Promise<void>;
    };

/**
 * What an import would do - and only then, if asked, do it.
 *
 * §A.4: an import that silently overwrites a rifle is the same failure as losing one, so the plan
 * comes back first and `apply` is the user's decision rather than this function's.
 */
export function preview(text: string): ImportPreview {
  if (!state.ready) return { ok: false, error: 'Your saved data is still loading. Try again when it is ready.' };
  const read = parse(text);
  if (!read.ok) return { ok: false, error: read.error };
  if (read.data.loads.length || read.data.sessions.length || Object.keys(read.data.settings).length) {
    return { ok: false, error: 'This file contains loads, sessions or settings that this build cannot restore. Nothing has been imported. Keep the original file.' };
  }
  const snapshot = () => JSON.stringify([state.rifles, state.cartridges, state.reticles, state.targetFaces]);
  const before = snapshot();
  const incoming = read.data.rifles;
  const incomingCartridges = read.data.cartridges;
  const incomingReticles = read.data.reticles;
  const incomingFaces = read.data.targetFaces;
  // One rule, from one function, for every kind. Four copies of it would eventually disagree
  // about which side of an import wins.
  const plan = planMerge(state.rifles, incoming);
  const cartridgePlan = planMerge(state.cartridges, incomingCartridges);
  const reticlePlan = planMerge(state.reticles, incomingReticles);
  const facePlan = planMerge(state.targetFaces, incomingFaces);
  return {
    ok: true,
    plan,
    cartridgePlan,
    reticlePlan,
    facePlan,
    apply: () => mutate(async () => {
      if (snapshot() !== before) throw new Error('Your data changed after this preview. Select the file again to review an updated plan.');
      state.importing = true;
      try {
        const merged = applyMerge(state.rifles, incoming, plan);
        const mergedCartridges = applyMerge(state.cartridges, incomingCartridges, cartridgePlan);
        const mergedReticles = applyMerge(state.reticles, incomingReticles, reticlePlan);
        const mergedFaces = applyMerge(state.targetFaces, incomingFaces, facePlan);
        if (database) {
          await replaceRecords(database, { rifles: merged, cartridges: mergedCartridges, reticles: mergedReticles, targetFaces: mergedFaces });
        } else {
          await store.replaceAll(merged);
          await cartridgeStore.replaceAll(mergedCartridges);
          await reticleStore.replaceAll(mergedReticles);
          await faceStore.replaceAll(mergedFaces);
        }
        state.rifles = merged;
        state.cartridges = mergedCartridges;
        state.reticles = mergedReticles;
        state.targetFaces = mergedFaces;
      } finally {
        state.importing = false;
      }
    })
  };
}
