/**
 * The bullet catalogue: makers' projectiles, each drawn from its own measurements.
 *
 * Kept upstream in BallisticViz (`data/bullets/`, see its `docs/BULLETS.md`), published here as
 * `bullets/<key>.json` beside the case families, and indexed at build time like the cartridges. A
 * bullet is nobody's cartridge: it fits whichever cartridges take its diameter, which is how the
 * two catalogues meet -- see `bulletsFor`.
 */

import index from './bullets.generated.json';
import type { Entry } from './types';

/** One row of the shipped index; see `scripts/build-index.mjs`. */
export interface BulletEntry {
  key: string;
  manufacturer: string;
  line: string | null;
  model: string;
  name: string;
  calibre: string;
  diameter: number;
  mass: number;
  length: number | null;
  g1: number | null;
  g7: number | null;
  /** How many of the drawing's figures the build assumed rather than read from a source. */
  assumed: number;
  /** The drawing's page and its object box, in millimetres; absent where nothing was drawn. */
  svg?: [number, number];
  tight?: [number, number];
}

export const bullets: BulletEntry[] = index as BulletEntry[];

export function bulletByKey(key: string): BulletEntry | undefined {
  return bullets.find((bullet) => bullet.key === key);
}

/** One figure's provenance, as the record states it. */
export interface Source {
  fields: string[];
  publisher: string;
  url: string;
  retrieved: string;
  kind: 'published' | 'measured' | 'quoted';
  note?: string;
}

/** The whole record, fetched when a bullet is opened. Mirrors the upstream schema. */
export interface BulletRecord extends Omit<BulletEntry, 'g1' | 'g7' | 'assumed' | 'svg' | 'tight' | 'length'> {
  length?: number;
  bearing?: number;
  nose?: number;
  base_to_ogive?: number;
  meplat?: number;
  base: { type: string; length?: number; angle?: number; diameter?: number };
  ogive: { form: string; radius_calibres?: number; rt_over_r?: number };
  tip: { type: string; cavity_depth?: number };
  construction: { jacket: string; core: string; jacket_material: string; core_material: string };
  cannelure?: { from_base: number; width?: number };
  ballistics: { g1?: number; g7?: number; note?: string };
  recommended_twist?: string;
  sources: Source[];
  notes?: string;
  /** What the drawing was made with, every figure, and which of them were assumed. */
  derived: {
    length: number;
    bearing: number;
    nose: number;
    boatTail: number;
    baseDiameter: number;
    boatTailAngle: number | null;
    meplat: number;
    ogiveRadiusCalibres: number;
    massGrains: number;
    sectionalDensity: number;
    assumed: string[];
  };
}

const cache = new Map<string, Promise<BulletRecord>>();

export function loadBullet(key: string): Promise<BulletRecord> {
  const cached = cache.get(key);
  if (cached) return cached;
  if (!bulletByKey(key)) return Promise.reject(new Error(`No bullet is catalogued under the key "${key}".`));
  const request = fetch(`${import.meta.env.BASE_URL}bullets/${key}.json`).then((response) => {
    if (!response.ok) throw new Error(`${key}: ${response.status} ${response.statusText}`);
    return response.json() as Promise<BulletRecord>;
  });
  cache.set(key, request);
  return request;
}

/**
 * How far a bullet's diameter may sit from a cartridge's `G1` and still be its calibre, in mm.
 *
 * `G1` is the case mouth's grip diameter, not the bullet's: the two differ by a measured
 * tolerance, and upstream's plausibility survey found them within 0.05 mm on 440 of 510 records
 * (BallisticViz `docs/TODO.md` item 18). A .308 bullet is 7.82 mm; the 308 Win's `G1` is 7.85.
 */
export const CALIBRE_TOLERANCE_MM = 0.06;

/** The catalogue's bullets of a cartridge's calibre, by `G1`. */
export function bulletsFor(entry: Entry): BulletEntry[] {
  if (entry.G1 === null || entry.G1 === undefined) return [];
  const g1 = entry.G1;
  return bullets.filter((bullet) => Math.abs(bullet.diameter - g1) <= CALIBRE_TOLERANCE_MM);
}

/** The cartridges a bullet fits, by the same rule. */
export function cartridgesFor(bullet: BulletEntry, entries: Entry[]): Entry[] {
  return entries.filter(
    (entry) => entry.G1 !== null && Math.abs(bullet.diameter - entry.G1) <= CALIBRE_TOLERANCE_MM
  );
}

/** Where a bullet's drawing is served, with the face the page wants. */
export function bulletDrawingUrl(key: string, fragment: string): string {
  return `${import.meta.env.BASE_URL}outlines/bullets/${key}.svg${fragment}`;
}
