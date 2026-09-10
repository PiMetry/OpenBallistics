/**
 * Import and export of personal records.
 * Exports sort keys for stable comparisons. Imports reject unsupported newer versions
 * to avoid silently dropping fields, and migrate older versions to preserve backups.
 */

import {
  USER_DATA_FORMAT,
  USER_DATA_VERSION,
  emptyUserData,
  type Gun,
  type StoredCartridge,
  type StoredReticle,
  type StoredTargetFace,
  type UserData
} from './types';
import { validateSections } from './validate';

/** Deterministic JSON: keys in sorted order at every level, so exports diff cleanly. */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>).sort()) {
    out[k] = (value as Record<string, unknown>)[k];
  }
  return out;
}

export function serialise(data: UserData): string {
  return `${JSON.stringify(data, sortedReplacer, 1)}\n`;
}

export type ParseResult =
  | { ok: true; data: UserData; migratedFrom?: number }
  | { ok: false; error: string };

/**
 * Bring an older export up to the current shape.
 *
 * One place, one direction. When version 2 exists this gains a step rather than a branch
 * elsewhere.
 */
function migrate(raw: Record<string, unknown>, from: number): Record<string, unknown> {
  let out = raw;
  let at = from;
  // while (at === 1) { out = toV2(out); at = 2; }
  void at;
  return out;
}

export function parse(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not JSON.' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'That file does not contain an object.' };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.format !== USER_DATA_FORMAT) {
    return { ok: false, error: 'That is not an OpenBallistics export.' };
  }
  const version = typeof obj.version === 'number' ? obj.version : NaN;
  if (!Number.isFinite(version)) {
    return { ok: false, error: 'That export does not say which version it is.' };
  }
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'That export has an unsupported format version.' };
  }
  if (version > USER_DATA_VERSION) {
    return {
      ok: false,
      error:
        `That export was written by a newer version of the site (format ${version}, this build ` +
        `reads ${USER_DATA_VERSION}). Opening it here would drop whatever it holds that this ` +
        `build has no name for. Update, then import it.`
    };
  }

  const migrated = version < USER_DATA_VERSION ? migrate(obj, version) : obj;
  const invalid = validateSections(migrated);
  if (invalid) return { ok: false, error: invalid };
  const base = emptyUserData();
  const data: UserData = {
    ...base,
    ...migrated,
    format: USER_DATA_FORMAT,
    version: USER_DATA_VERSION,
    rifles: Array.isArray(migrated.rifles) ? (migrated.rifles as Gun[]) : [],
    cartridges: Array.isArray(migrated.cartridges)
      ? (migrated.cartridges as StoredCartridge[])
      : [],
    reticles: Array.isArray(migrated.reticles) ? (migrated.reticles as StoredReticle[]) : [],
    targetFaces: Array.isArray(migrated.targetFaces)
      ? (migrated.targetFaces as StoredTargetFace[])
      : [],
    loads: Array.isArray(migrated.loads) ? (migrated.loads as unknown[]) : [],
    sessions: Array.isArray(migrated.sessions) ? (migrated.sessions as unknown[]) : [],
    settings:
      migrated.settings && typeof migrated.settings === 'object'
        ? (migrated.settings as Record<string, unknown>)
        : {}
  };
  return version < USER_DATA_VERSION
    ? { ok: true, data, migratedFrom: version }
    : { ok: true, data };
}

export type MergeAction = 'add' | 'update' | 'skip';

export interface MergeRow {
  id: string;
  name: string;
  action: MergeAction;
  /** Why, in words a person can act on. */
  reason: string;
}

/** Everything the merge needs to know about a thing, whatever kind of thing it is. */
export interface Mergeable {
  id: string;
  name: string;
  updated: string;
}

/**
 * What an import would do, before it does it.
 *
 * §A.4: an import that silently overwrites a record is the same failure as losing one. This
 * produces the preview; nothing here writes.
 *
 * A record already held is updated only when the incoming copy is genuinely newer, which is what
 * `updated` is for. Same timestamp means the same record, so there is nothing to do.
 *
 * Generic over what is being merged, because rifles were the first kind and are not the last: a
 * designed cartridge merges by exactly the same rule, and two copies of that rule would eventually
 * disagree.
 */
export function planMerge<T extends Mergeable>(current: T[], incoming: T[]): MergeRow[] {
  const held = new Map(current.map((r) => [r.id, r]));
  return incoming.map((item) => {
    const mine = held.get(item.id);
    if (!mine) return { id: item.id, name: item.name, action: 'add', reason: 'not held yet' };
    if (Date.parse(mine.updated) === Date.parse(item.updated)) {
      const identical = JSON.stringify(mine, sortedReplacer) === JSON.stringify(item, sortedReplacer);
      return { id: item.id, name: item.name, action: 'skip', reason: identical ? 'identical to the one held' : 'same timestamp but different content; keeping the local copy' };
    }
    if (Date.parse(mine.updated) > Date.parse(item.updated)) {
      return {
        id: item.id,
        name: item.name,
        action: 'skip',
        reason: 'the copy held here is newer'
      };
    }
    return { id: item.id, name: item.name, action: 'update', reason: 'the file is newer' };
  });
}

/** Apply a plan. Separate from making it, so the preview cannot disagree with the result. */
export function applyMerge<T extends Mergeable>(current: T[], incoming: T[], plan: MergeRow[]): T[] {
  const byId = new Map(current.map((r) => [r.id, r]));
  const source = new Map(incoming.map((r) => [r.id, r]));
  for (const row of plan) {
    if (row.action === 'skip') continue;
    const item = source.get(row.id);
    if (item) byId.set(row.id, item);
  }
  return [...byId.values()];
}
