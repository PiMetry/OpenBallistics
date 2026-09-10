/** Resolve shotshell records and construct unfired hull profiles. */

import { MATERIAL_HEX, type Material } from './bullet';
import { MissingDimensionError, type MetallicCase } from './case';
import { truncateBehind, truncateForward, type Profile } from '../geom/profile';
import {
  clipPathDef,
  fullSectionPath,
  num,
  offsetInward,
  OUTLINE_STROKE_MM,
  sectionLines,
  svgHeader,
  viewportFor,
  type Frame,
  type Viewport
} from '../geom/svg';
import { darken } from './bullet';

/** A Tab VII record as the site publishes it. */
export interface ShotshellRecord {
  key: string;
  name: string;
  family: 'shotshell';
  cartridge: {
    dimensions?: { d?: number | null; g?: number | null; t?: number | null; h?: number | null } & Record<string, unknown>;
    lengths?: { l?: number | null; marking?: string | null; tol?: number | null }[];
  };
  chamber?: { dimensions?: { B?: number | null } & Record<string, unknown> };
}

interface ShotshellHull {
  gauge: string;
  bodyDiameter: number;
  rimDiameter: number;
  rimThickness: number;
  headHeight: number;
  length: number;
  marking: string | null;
  wallThickness: number;
  /** Where the metal head ends and the polymer tube begins: `h`. */
  headTopZ: number;
  /** The unfired mouth plane: the hull length. */
  mouthZ: number;
  headMaterial: Material;
  hullMaterial: Material;
}

export interface ShotshellCase {
  kind: 'shotshell';
  key: string;
  name: string;
  family: 'shotshell';
  hull: ShotshellHull;
  mouth: { z: number; outsideDiameter: number; insideDiameter: number };
  tolerances: Record<string, number>;
}

/** `derived.SHOTSHELL_HULL_WALL_MM`: the tube wall when the bore is not published. */
const SHOTSHELL_HULL_WALL_MM = 0.75;
/** `derived.COMMON_HULL_LENGTH_MM`: 2 3/4 in, the length a gauge is loaded to by default. */
const COMMON_HULL_LENGTH_MM = 69.8;

export function isShotshell(c: MetallicCase | ShotshellCase): c is ShotshellCase {
  return (c as ShotshellCase).kind === 'shotshell';
}

/** `derived.hull_wall_thickness`: `(d - B) / 2`, or the fallback where the bore is blank. */
function hullWallThickness(bodyDiameter: number, boreDiameter: number | null | undefined): number {
  if (boreDiameter == null) return SHOTSHELL_HULL_WALL_MM;
  const wall = (bodyDiameter - boreDiameter) / 2;
  return wall <= 0 ? SHOTSHELL_HULL_WALL_MM : wall;
}

/** `derived.select_hull_length`: the offering nearest the common length, ties to the shorter. */
function selectHullLength(lengths: number[]): number {
  let best = 0;
  for (let i = 1; i < lengths.length; i++) {
    const a = Math.abs(lengths[i]! - COMMON_HULL_LENGTH_MM), b = Math.abs(lengths[best]! - COMMON_HULL_LENGTH_MM);
    if (a < b || (a === b && lengths[i]! < lengths[best]!)) best = i;
  }
  return best;
}

function require(value: number | null | undefined, key: string, field: string, neededFor: string): number {
  if (value == null) throw new MissingDimensionError(key, field, neededFor);
  return value;
}

/** `adapter._shot_tolerances`: every `<column>Tol` on the sheet, keyed by its column. */
function shotTolerancesOf(record: ShotshellRecord): Record<string, number> {
  const found: Record<string, number> = {};
  const dims = record.cartridge.dimensions ?? {};
  for (const [field, value] of Object.entries(dims)) {
    if (field.endsWith('Tol') && typeof value === 'number') found[field.slice(0, -3)] = value;
  }
  return found;
}

/**
 * `adapter.adapt_shotshell`: the hull at one of its published lengths - the one `marking` names,
 * or the one nearest 2 3/4 in. A record with no lengths list is refused rather than guessed.
 */
export function adaptShotshell(record: ShotshellRecord, marking: string | null = null): ShotshellCase {
  const key = record.key;
  const dims = record.cartridge.dimensions ?? {};
  const bodyDiameter = require(dims.d, key, 'd', 'the hull body');
  const rimDiameter = require(dims.g, key, 'g', 'the hull rim');
  const rimThickness = require(dims.t, key, 't', 'the hull rim');
  const headHeight = require(dims.h, key, 'h', 'the metal head');
  const lengths = record.cartridge.lengths ?? [];
  if (!lengths.length) throw new MissingDimensionError(key, 'lengths', 'the hull length');
  let offering: (typeof lengths)[number];
  let index: number;
  if (marking != null) {
    const found = lengths.findIndex((entry) => entry.marking === marking);
    if (found < 0) {
      throw new MissingDimensionError(key, `lengths[marking=${marking}]`, 'the hull length');
    }
    index = found;
    offering = lengths[found]!;
  } else {
    const published = lengths.map((entry) => entry.l);
    if (published.some((value) => value == null)) throw new MissingDimensionError(key, 'lengths[].l', 'the hull length');
    index = selectHullLength(published as number[]);
    offering = lengths[index]!;
  }
  const hullLength = require(offering.l, key, `lengths[${index}].l`, 'the hull length');
  const wallThickness = hullWallThickness(bodyDiameter, record.chamber?.dimensions?.B ?? null);
  const hull: ShotshellHull = {
    gauge: key,
    bodyDiameter,
    rimDiameter,
    rimThickness,
    headHeight,
    length: hullLength,
    marking: offering.marking ?? null,
    wallThickness,
    headTopZ: headHeight,
    mouthZ: hullLength,
    headMaterial: 'BRASS',
    hullMaterial: 'POLYMER_RED'
  };
  return {
    kind: 'shotshell',
    key,
    name: record.name,
    family: 'shotshell',
    hull,
    mouth: { z: hull.mouthZ, outsideDiameter: bodyDiameter, insideDiameter: (bodyDiameter / 2 - wallThickness) * 2 },
    tolerances: shotTolerancesOf(record)
  };
}

/** `hull_outer_profile`: rim flange, step in, the tube to the unfired mouth. */
export function hullOuterProfile(hull: ShotshellHull): Profile {
  return [
    [hull.rimDiameter / 2, 0],
    [hull.rimDiameter / 2, hull.rimThickness],
    [hull.bodyDiameter / 2, hull.rimThickness],
    [hull.bodyDiameter / 2, hull.mouthZ]
  ];
}

/** `ShotshellCase.material_boundaries`: the brass head meeting the polymer tube. */
export function shotshellMaterialBoundaries(c: ShotshellCase): number[] {
  return [c.hull.headTopZ];
}

// ---- The coloured face --------------------------------------------

/** Four significant digits, trailing zeros dropped. */
function g4(value: number): string {
  if (value === 0) return '0';
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  if (exponent < -4 || exponent >= 4) {
    // Scientific notation uses at least two exponent digits, for example `1.235e+04`.
    const mantissa = (value / 10 ** exponent).toPrecision(4).replace(/0+$/, '').replace(/\.$/, '');
    const sign = exponent < 0 ? '-' : '+';
    return `${mantissa}e${sign}${String(Math.abs(exponent)).padStart(2, '0')}`;
  }
  let s = value.toPrecision(4);
  if (s.includes('e')) s = Number(s).toString();
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

/** `_material_band`: the contour itself between two axial positions, closed. */
function materialBand(profile: Profile, view: Viewport, z0: number | null, z1: number | null): string {
  let piece = profile;
  if (z1 != null) piece = truncateForward(piece, z1);
  if (z0 != null) piece = truncateBehind(piece, z0);
  return fullSectionPath(piece, view);
}

/** `_boundary_on`: the boundary as it falls on the inset contour, kept inside the piece. */
function boundaryOn(inset: Profile, boundary: number): number {
  let low = Infinity, high = -Infinity;
  for (const [, z] of inset) {
    if (z < low) low = z;
    if (z > high) high = z;
  }
  return Math.min(Math.max(boundary, low), high);
}

/** `_open_band_path`: one side and its mirror, joined across one end only. */
function openBandPath(piece: Profile, view: Viewport, closeAtStart: boolean): string {
  const points: Profile = closeAtStart
    ? [...[...piece].reverse().map(([r, z]): [number, number] => [-r, z]), ...piece]
    : [...piece.map(([r, z]): [number, number] => [-r, z]), ...[...piece].reverse()];
  return points
    .map(([r, z], index) => {
      const [x, y] = view.xy(r, z);
      return `${index === 0 ? 'M' : 'L'}${g4(x)},${g4(y)}`;
    })
    .join(' ');
}

/** `_banded_outline`: the inset outline, stroked in each material's own colour to the boundary. */
function bandedOutline(profile: Profile, view: Viewport, boundary: number, c: ShotshellCase): string {
  const inset = offsetInward(profile, OUTLINE_STROKE_MM / 2);
  const drawnBoundary = boundaryOn(inset, boundary);
  const width = view.length(OUTLINE_STROKE_MM);
  const head = truncateForward(inset, drawnBoundary);
  const tube = truncateBehind(inset, drawnBoundary);
  return (
    `<path d="${openBandPath(head, view, true)}" fill="none" stroke="${darken(c.hull.headMaterial)}" stroke-width="${num(width)}"/>` +
    `<path d="${openBandPath(tube, view, false)}" fill="none" stroke="${darken(c.hull.hullMaterial)}" stroke-width="${num(width)}"/>`
  );
}

/** `shotshell_parts`: the coloured drawing of a shot cartridge as `[defs, parts]`. */
export function shotshellParts(c: ShotshellCase, view: Viewport, prefix = ''): [string, string[]] {
  const profile = hullOuterProfile(c.hull);
  const contour = fullSectionPath(profile, view);
  const clipId = `${prefix}contour-${c.key}`;
  const boundary = c.hull.headTopZ;
  const headBand = materialBand(profile, view, null, boundary);
  const tubeBand = materialBand(profile, view, boundary, null);
  const parts = [
    `<g clip-path="url(#${clipId})">`,
    `<path d="${tubeBand}" fill="${MATERIAL_HEX[c.hull.hullMaterial]}"/>`,
    `<path d="${headBand}" fill="${MATERIAL_HEX[c.hull.headMaterial]}"/>`,
    sectionLines(profile, view, darken(c.hull.headMaterial), shotshellMaterialBoundaries(c)),
    bandedOutline(profile, view, boundary, c),
    '',
    '</g>'
  ];
  return [clipPathDef(contour, clipId), parts];
}

/** `render_visual_svg` for a shot cartridge: the coloured hull on the plain viewport. */
export function renderShotshellVisualSvg(c: ShotshellCase, options: { scale?: number; frame?: Frame } = {}): string {
  const profile = hullOuterProfile(c.hull);
  const view = viewportFor([profile], { scale: options.scale ?? 4.0, frame: options.frame ?? 'upright' });
  const [defs, parts] = shotshellParts(c, view);
  return [svgHeader(view, `${c.name} - visual`), '<defs>', defs, '</defs>', ...parts, '</svg>'].join('');
}

