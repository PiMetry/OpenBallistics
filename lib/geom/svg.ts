/**
 * Shared SVG primitives: units, stroke widths, viewports, paths, section lines and headers.
 * These helpers depend only on profiles and viewports, allowing shape builders to use
 * SVG primitives without depending on the renderer's drawing routines.
 */

import { EPSILON, type Point, type Profile } from './profile';

const COORD_PRECISION = 6;
export const OUTLINE_STROKE_MM = 0.12;
export const ANNOTATION_STROKE_MM = 0.06;
const SECTION_STROKE_RATIO = 1.0;

export type Frame = 'upright' | 'landscape';

// ---- Viewport --------------------------------------------------------------------------------

interface ViewportOptions {
  scale?: number;
  marginMm?: number;
  marginLeftMm?: number;
  marginRightMm?: number;
  marginTopMm?: number;
  marginBottomMm?: number;
  frame?: Frame;
}

export class Viewport {
  readonly scale: number;
  readonly marginMm: number;
  readonly marginLeftMm: number;
  readonly marginRightMm: number;
  readonly marginTopMm: number;
  readonly marginBottomMm: number;
  readonly frame: Frame;

  constructor(
    readonly zMin: number,
    readonly zMax: number,
    readonly rMax: number,
    options: ViewportOptions = {}
  ) {
    this.scale = options.scale ?? 4.0;
    this.marginMm = options.marginMm ?? 6.0;
    this.marginLeftMm = options.marginLeftMm ?? 0;
    this.marginRightMm = options.marginRightMm ?? 0;
    this.marginTopMm = options.marginTopMm ?? 0;
    this.marginBottomMm = options.marginBottomMm ?? 0;
    this.frame = options.frame ?? 'upright';
  }

  private get acrossMm(): number {
    return 2 * this.rMax + 2 * this.marginMm;
  }
  private get alongMm(): number {
    return this.zMax - this.zMin + 2 * this.marginMm;
  }
  get width(): number {
    const base = this.frame === 'upright' ? this.acrossMm : this.alongMm;
    return (base + this.marginLeftMm + this.marginRightMm) * this.scale;
  }
  get height(): number {
    const base = this.frame === 'upright' ? this.alongMm : this.acrossMm;
    return (base + this.marginTopMm + this.marginBottomMm) * this.scale;
  }
  xy(r: number, z: number): [number, number] {
    if (this.frame === 'upright') {
      return [
        (r + this.rMax + this.marginMm + this.marginLeftMm) * this.scale,
        (this.zMax + this.marginMm + this.marginTopMm - z) * this.scale
      ];
    }
    return [
      (z - this.zMin + this.marginMm + this.marginLeftMm) * this.scale,
      (r + this.rMax + this.marginMm + this.marginTopMm) * this.scale
    ];
  }
  length(mm: number): number {
    return mm * this.scale;
  }
  /** A direction in the part's frame, (dr, dz), as a unit vector on the page. */
  direction(dr: number, dz: number): [number, number] {
    const length = Math.hypot(dr, dz);
    if (length < 1e-12) return [0, 0];
    dr /= length;
    dz /= length;
    if (this.frame === 'upright') return [dr, -dz];
    return [dz, dr];
  }
}

export function viewportFor(profiles: Profile[], options: ViewportOptions = {}): Viewport {
  const points = profiles.flat();
  if (!points.length) throw new Error('cannot build a viewport with no geometry');
  let zMin = Infinity, zMax = -Infinity, rMax = -Infinity;
  for (const [r, z] of points) {
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
    if (r > rMax) rMax = r;
  }
  return new Viewport(zMin, zMax, rMax, options);
}

/** Up to six decimal places, with trailing zeros dropped and negative zero normalised. */
export function fmt(value: number): string {
  let s = value.toFixed(COORD_PRECISION);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s || '0';
}

// ---- Paths -----------------------------------------------------------------------------------

export function pathOf(points: Point[], view: Viewport, close: boolean): string {
  const commands: string[] = [];
  points.forEach(([r, z], i) => {
    const [x, y] = view.xy(r, z);
    commands.push(`${i === 0 ? 'M' : 'L'}${fmt(x)},${fmt(y)}`);
  });
  if (close) commands.push('Z');
  return commands.join(' ');
}

/** Closed path around the full section: up one side, back down the mirrored side. */
export function fullSectionPath(profile: Profile, view: Viewport): string {
  const forward: Point[] = profile.map(([r, z]) => [r, z]);
  const backward: Point[] = [...profile].reverse().map(([r, z]) => [-r, z]);
  return pathOf([...forward, ...backward], view, true);
}

export function insetStrokePath(profile: Profile, view: Viewport, strokeMm: number): string {
  return fullSectionPath(offsetInward(profile, strokeMm / 2), view);
}

export function clipPathDef(contour: string, clipId: string): string {
  return `<clipPath id="${clipId}"><path d="${contour}"/></clipPath>`;
}

// ---- Offsetting ----------------------------------------

function same(a: Point, b: Point): boolean {
  return Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;
}

function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const onSegment = (p: Point, q: Point, r: Point) =>
    Math.min(p[0], r[0]) - EPSILON <= q[0] && q[0] <= Math.max(p[0], r[0]) + EPSILON &&
    Math.min(p[1], r[1]) - EPSILON <= q[1] && q[1] <= Math.max(p[1], r[1]) + EPSILON;
  const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
  if (((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON)) &&
      ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON))) return true;
  if (Math.abs(d1) <= EPSILON && onSegment(p3, p1, p4)) return true;
  if (Math.abs(d2) <= EPSILON && onSegment(p3, p2, p4)) return true;
  if (Math.abs(d3) <= EPSILON && onSegment(p1, p3, p2)) return true;
  if (Math.abs(d4) <= EPSILON && onSegment(p1, p4, p2)) return true;
  return false;
}

function crossingPoint(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const d1r = p2[0] - p1[0], d1z = p2[1] - p1[1];
  const d2r = p4[0] - p3[0], d2z = p4[1] - p3[1];
  const denominator = d1r * d2z - d1z * d2r;
  if (Math.abs(denominator) < EPSILON * EPSILON) return null;
  const t = ((p3[0] - p1[0]) * d2z - (p3[1] - p1[1]) * d2r) / denominator;
  return [p1[0] + d1r * t, p1[1] + d1z * t];
}

/** Cut the loops an offset makes where a feature is narrower than the distance it was moved. */
function cutFolds(profile: Profile): Profile {
  let points: Profile = [...profile];
  let cut = true;
  while (cut) {
    cut = false;
    const count = points.length - 1;
    outer: for (let i = 0; i < count; i++) {
      for (let j = i + 2; j < count; j++) {
        if (!segmentsIntersect(points[i]!, points[i + 1]!, points[j]!, points[j + 1]!)) continue;
        const crossing = crossingPoint(points[i]!, points[i + 1]!, points[j]!, points[j + 1]!);
        const kept: Profile = points.slice(0, i + 1);
        if (crossing !== null && !same(kept[kept.length - 1]!, crossing)) kept.push(crossing);
        for (const point of points.slice(j + 1)) {
          if (!same(kept[kept.length - 1]!, point)) kept.push(point);
        }
        points = kept;
        cut = true;
        break outer;
      }
    }
  }
  return points;
}

/** Move the profile `distance` mm into the material with mitred corners and optional end offsets. */
export function offsetInward(profile: Profile, distance: number, pullEnds = true): Profile {
  if (distance <= 0 || profile.length < 2) return [...profile];
  const normal = (a: Point, b: Point): [number, number] => {
    const dr = b[0] - a[0], dz = b[1] - a[1];
    const length = Math.hypot(dr, dz);
    if (length < EPSILON) return [0, 0];
    return [-dz / length, dr / length];
  };
  const normals: [number, number][] = [];
  for (let i = 0; i < profile.length - 1; i++) normals.push(normal(profile[i]!, profile[i + 1]!));

  let result: Profile = [];
  profile.forEach(([r, z], i) => {
    const before = i > 0 ? normals[i - 1]! : normals[0]!;
    const after = i < normals.length ? normals[i]! : normals[normals.length - 1]!;
    let nr = before[0] + after[0], nz = before[1] + after[1];
    let length = Math.hypot(nr, nz);
    if (length < EPSILON) {
      [nr, nz] = after;
      length = Math.hypot(nr, nz);
      if (length < EPSILON) {
        result.push([r, z]);
        return;
      }
    }
    nr /= length;
    nz /= length;
    const cosHalf = Math.max(0.2, before[0] * nr + before[1] * nz);
    const step = distance / cosHalf;
    result.push([Math.max(0, r + nr * step), z + nz * step]);
  });
  result = cutFolds(result);
  if (!pullEnds) return result;
  result[0] = [result[0]![0], profile[0]![1] + distance];
  result[result.length - 1] = [result[result.length - 1]![0], profile[profile.length - 1]![1] - distance];
  return result;
}

// ---- Section lines --------------------------------------------------------------

interface SectionLineConfig {
  turnAngleDeg: number;
  minSegmentMm: number;
  lengthRatio: number;
  radialStepMm: number;
  foldTurnDeg: number;
}
const SECTION_CONFIG: SectionLineConfig = { turnAngleDeg: 8, minSegmentMm: 0.35, lengthRatio: 10, radialStepMm: 0.2, foldTurnDeg: 135 };
const MIN_SECTION_LINE_SEPARATION_FRAC = 0.005;

const degrees = (radians: number) => (radians * 180) / Math.PI;

function weightedTransitions(profile: Profile, config: SectionLineConfig = SECTION_CONFIG): [number, number][] {
  if (profile.length < 3) return [];
  const segments: [number, number][] = [];
  for (let i = 0; i < profile.length - 1; i++) {
    segments.push([profile[i + 1]![0] - profile[i]![0], profile[i + 1]![1] - profile[i]![1]]);
  }
  const lengths = segments.map(([dr, dz]) => Math.hypot(dr, dz));
  const turnAt = (index: number): number => {
    const lenIn = lengths[index - 1]!, lenOut = lengths[index]!;
    if (lenIn === 0 || lenOut === 0) return 0;
    const vIn = segments[index - 1]!, vOut = segments[index]!;
    const cosine = (vIn[0] * vOut[0] + vIn[1] * vOut[1]) / (lenIn * lenOut);
    return degrees(Math.acos(Math.max(-1, Math.min(1, cosine))));
  };
  const signedTurnAt = (index: number): number => {
    const vIn = segments[index - 1]!, vOut = segments[index]!;
    const cross = vIn[0] * vOut[1] - vIn[1] * vOut[0];
    return cross ? Math.sign(cross) * turnAt(index) : 0;
  };
  const isVerticalFace = (index: number): boolean =>
    Math.abs(segments[index]![1]) < 1e-9 && Math.abs(segments[index]![0]) > 1e-9;

  const arcRuns: [number, number][] = [];
  let index = 0;
  while (index < segments.length) {
    if (lengths[index]! < config.minSegmentMm && !isVerticalFace(index)) {
      const start = index;
      while (index < segments.length && lengths[index]! < config.minSegmentMm && !isVerticalFace(index)) index++;
      if (index - start >= 2) arcRuns.push([start, index]);
    } else {
      index++;
    }
  }

  const transitions: [number, number][] = [];
  const covered = new Set<number>();
  for (const [start, end] of arcRuns) {
    for (let i = start; i <= end; i++) covered.add(i);
    const turns: number[] = [];
    for (let i = start + 1; i < Math.min(end, profile.length - 1); i++) turns.push(signedTurnAt(i));
    if (start === 0) {
      if (turns.reduce((a, t) => a + Math.abs(t), 0) >= config.foldTurnDeg) {
        const last = Math.min(end, profile.length - 1);
        transitions.push([profile[last]![1], Math.abs(profile[last]![0] - profile[start]![0])]);
      }
      continue;
    }
    const positive = turns.filter((t) => t > 0).reduce((a, t) => a + t, 0);
    const negative = -turns.filter((t) => t < 0).reduce((a, t) => a + t, 0);
    if (positive > 1 && negative > 1) continue;
    const last = Math.min(end, profile.length - 1);
    const strength = Math.abs(profile[last]![0] - profile[start]![0]);
    transitions.push([arcFeatureZ(profile, segments, start, end), strength]);
  }

  for (let i = 0; i < segments.length; i++) {
    if (isVerticalFace(i)) transitions.push([profile[i]![1], Math.abs(segments[i]![0])]);
  }

  for (let i = 1; i < profile.length - 1; i++) {
    if (covered.has(i)) continue;
    const lenIn = lengths[i - 1]!, lenOut = lengths[i]!;
    if (lenIn === 0 || lenOut === 0) continue;
    const longEnough = Math.max(lenIn, lenOut) >= config.minSegmentMm;
    const scaleChange = Math.max(lenIn, lenOut) / Math.min(lenIn, lenOut) >= config.lengthRatio;
    const radialStep = Math.abs(profile[i]![0] - profile[i - 1]![0]) >= config.radialStepMm;
    if ((turnAt(i) >= config.turnAngleDeg && longEnough) || scaleChange || radialStep) {
      transitions.push([profile[i]![1], Math.abs(profile[i + 1]![0] - profile[i - 1]![0])]);
    }
  }

  let zMin = Infinity, zMax = -Infinity;
  for (const [, z] of profile) {
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const margin = Math.max(0.08, (zMax - zMin) * 0.002);
  return dedupeWeighted(transitions.filter(([z]) => zMin + margin < z && z < zMax - margin));
}

function arcFeatureZ(profile: Profile, segments: [number, number][], start: number, end: number): number {
  const lastIndex = Math.min(end, profile.length - 1);
  const midpoint = (profile[start]![1] + profile[lastIndex]![1]) / 2;
  const legIn = start - 1, legOut = end;
  if (legIn < 0 || legOut >= segments.length) return midpoint;
  const p1 = profile[legIn]!, d1 = segments[legIn]!;
  const p2 = profile[legOut]!, d2 = segments[legOut]!;
  const denominator = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(denominator) < 1e-12) return midpoint;
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / denominator;
  const cornerZ = p1[1] + t * d1[1];
  const span = Math.abs(profile[lastIndex]![1] - profile[start]![1]) + 1e-9;
  if (Math.abs(cornerZ - midpoint) > span * 4) return midpoint;
  return cornerZ;
}

function dedupeWeighted(values: [number, number][], tolerance = 0.05): [number, number][] {
  const out: [number, number][] = [];
  for (const [z, weight] of [...values].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const last = out[out.length - 1];
    if (last && z - last[0] <= tolerance) {
      if (weight > last[1]) out[out.length - 1] = [z, weight];
    } else {
      out.push([z, weight]);
    }
  }
  return out;
}

function sectionLineZs(profile: Profile, materialBoundaries: number[] = []): number[] {
  let weighted = weightedTransitions(profile);
  let zMin = Infinity, zMax = -Infinity;
  for (const [, z] of profile) {
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const extent = zMax - zMin;
  const boundaries = [...materialBoundaries].sort((a, b) => a - b);
  if (extent <= 0) return [...new Set([...weighted.map(([z]) => z), ...boundaries])].sort((a, b) => a - b);
  const minimum = extent * MIN_SECTION_LINE_SEPARATION_FRAC;
  weighted = weighted.filter(([z]) => boundaries.every((boundary) => Math.abs(z - boundary) >= minimum));
  const kept: [number, number][] = [];
  for (const [z, weight] of weighted) {
    const last = kept[kept.length - 1];
    if (last && z - last[0] < minimum) {
      if (weight > last[1]) kept[kept.length - 1] = [z, weight];
    } else {
      kept.push([z, weight]);
    }
  }
  return [...kept.map(([z]) => z), ...boundaries].sort((a, b) => a - b);
}

function sectionLineRadius(profile: Profile, z: number): number {
  const candidates: number[] = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, z0] = profile[i]!, [r1, z1] = profile[i + 1]!;
    const low = Math.min(z0, z1), high = Math.max(z0, z1);
    if (low - 1e-9 <= z && z <= high + 1e-9) {
      if (Math.abs(z1 - z0) < 1e-9) candidates.push(r0, r1);
      else candidates.push(r0 + ((r1 - r0) * (z - z0)) / (z1 - z0));
    }
  }
  return candidates.length ? Math.min(...candidates) : 0;
}

function sectionLinePlacements(profile: Profile, zs: number[], strokeMm: number): [number, number][] {
  const inset = offsetInward(profile, strokeMm / 2);
  const placements: [number, number][] = [];
  for (const z of zs) {
    let drawnZ = z;
    let radius: number | null = null;
    for (let index = 0; index < profile.length - 1; index++) {
      const here = profile[index]!, ahead = profile[index + 1]!;
      if (Math.abs(here[1] - z) < 1e-9 && Math.abs(ahead[1] - z) < 1e-9) {
        drawnZ = (inset[index]![1] + inset[index + 1]![1]) / 2;
        radius = Math.min(inset[index]![0], inset[index + 1]![0]);
        break;
      }
    }
    if (radius === null) radius = sectionLineRadius(inset, drawnZ);
    placements.push([radius, drawnZ]);
  }
  return placements;
}

// ---- The faces -------------------------------------------------------------------------------

/** Format a number with at least one decimal place unless it uses scientific notation. */

export const num = (value: number): string => {
  const s = String(value);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
};

export function sectionLines(profile: Profile, view: Viewport, colour: string, materialBoundaries: number[] = []): string {
  const zs = sectionLineZs(profile, materialBoundaries);
  const stroke = OUTLINE_STROKE_MM * SECTION_STROKE_RATIO;
  const pieces: string[] = [];
  for (const [r, z] of sectionLinePlacements(profile, zs, OUTLINE_STROKE_MM)) {
    if (r <= 0) continue;
    const [x1, y1] = view.xy(-r, z), [x2, y2] = view.xy(r, z);
    pieces.push(`<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${colour}" stroke-width="${num(view.length(stroke))}"/>`);
  }
  return pieces.join('');
}

/** Outline up one side, across the tip and down the other, open at the mouth. */
export function bulletOutlinePath(exposed: Profile, view: Viewport, strokeMm: number): string {
  const inset = offsetInward(exposed, strokeMm / 2, false);
  inset[0] = [inset[0]![0], exposed[0]![1]];
  inset[inset.length - 1] = [inset[inset.length - 1]![0], exposed[exposed.length - 1]![1] - strokeMm / 2];
  const points: Point[] = [...inset, ...[...inset].reverse().map(([r, z]): Point => [-r, z])];
  return pathOf(points, view, false);
}

/** Escape text for SVG markup. */

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Build the SVG root and title using the viewport dimensions in user units. */
export function svgHeader(view: Viewport, title: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(view.width)}" height="${fmt(view.height)}" ` +
    `viewBox="0 0 ${fmt(view.width)} ${fmt(view.height)}"><title>${escape(title)}</title>`
  );
}
