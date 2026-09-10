/**
 * Render catalogue records using `lib/geometry` and `lib/render2d`.
 * Fetch each record once, then generate its cartridge, chamber and hull-length views locally,
 * with or without dimensions. Regression tests compare rendering against fixed fixtures.
 */

import { load } from './data';
import { profilesFor } from '@lib/geometry';
import {
  chamberRecordFacts,
  liveChamberDrawing,
  liveDrawing
} from '@lib/render2d';
import {
  adaptShotshell,
  type CartridgeRecord,
  type ShotshellRecord
} from '@lib/shapes2d';
import type {
  Drawing,
  DrawingStyle,
  Entry
} from '@lib/core';

export interface Live {
  markup: string;
  widthMm: number;
  heightMm: number;
}

/**
 * A short, stable namespace for one drawing's clip ids, from the cache key that describes it.
 *
 * An id is global to the document, and a page holds several drawings at once. Two `<svg>` roots
 * that share an id both resolve `url(#id)` to whichever the document met first, so one drawing
 * ends up clipped by another's contour, in another's coordinates, and disappears.
 */
function scopeOf(key: string): string {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `d${(hash >>> 0).toString(36)}`;
}

/** A few of the last drawings, so a zoom step does not draw the whole page twice. */
const cache = new Map<string, Promise<Live | null>>();
const CACHE_LIMIT = 64;

function remember(key: string, value: Promise<Live | null>): Promise<Live | null> {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

/**
 * The drawing a page asks for: of the cartridge or its chamber (`plate.subject`), at the hull
 * length the plate names, in the style, with or without dimensions, sized for `pixelsPerMm` on
 * screen. `null` where the record gives no such drawing - a chamber the sheet leaves blank.
 */
export function liveFor(
  entry: Entry,
  plate: Drawing | null,
  style: DrawingStyle,
  dimensions: boolean,
  pixelsPerMm: number
): Promise<Live | null> {
  const subject = plate?.subject ?? 'cartridge';
  const marking = plate?.marking ?? null;
  const key = [entry.key, subject, marking ?? '', style, dimensions ? 'dims' : 'plain', pixelsPerMm.toFixed(4)].join('|');
  const held = cache.get(key);
  if (held) return held;
  const className = style === 'technical' ? 'plate technical' : 'plate';
  // The clip ids are namespaced by what is drawn, so that two drawings of the same record at two
  // sizes - the page's and the print sheet's - cannot share one. Same key, same drawing, same
  // ids: harmless, since the geometry is identical.
  const options = { style, dimensions, pixelsPerMm, className, frame: 'landscape' as const, idPrefix: `${scopeOf(key)}-` };
  const made = load(entry.key).then((raw): Live | null => {
    const record = raw as unknown as CartridgeRecord | ShotshellRecord;
    try {
      if (record.family === 'shotshell') {
        if (subject !== 'cartridge') return null;
        return liveDrawing(adaptShotshell(record as ShotshellRecord, marking), null, options);
      }
      const p = profilesFor(record as CartridgeRecord);
      if (subject === 'chamber') {
        if (!p.chamber) return null;
        return liveChamberDrawing(p.chamber, record.name, chamberRecordFacts(record as CartridgeRecord), options);
      }
      return liveDrawing(p.case, p.bullet, { ...options, profile: p.outline });
    } catch {
      return null;
    }
  }).catch((error: unknown) => {
    // An older failed request may already have been evicted and replaced.
    if (cache.get(key) === made) cache.delete(key);
    throw error;
  });
  return remember(key, made);
}
