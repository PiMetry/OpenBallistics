/** Add dimension annotations and specification tables to drawings. */

import type { Bullet } from '../shapes2d/bullet';
import type { MetallicCase } from '../shapes2d/case';
import { BORE_STUB_MM, leadeRun, type Chamber } from '../shapes2d/chamber';
import { EPSILON, type Profile } from '../geom/profile';
import {
  ANNOTATION_STROKE_MM,
  Viewport,
  type Frame
} from '../geom/svg';
import type { ShotshellCase } from '../shapes2d/shotshell';

const LABEL_SIZE_MM = 1.6;
const LEADER_MM = 5.0;
const DIAMETER_LABEL_MM = 4.5;
const ANGLE_ARC_MM = 6.0;
export const DELTA_ARC_MM = 12.0;
const TABLE_ROW_MM = 2.4;
const TABLE_EQUALS_MM = 8.0;
const TABLE_VALUE_MM = 17.5;
const TABLE_UNIT_MM = 18.5;
const TABLE_TOLERANCE_MM = 23.0;
const TABLE_WIDTH_MM = 32.0;

/** The inks: symbols and the table in a slate blue, notes lighter, rules lighter still. */
export const INK_SYMBOL = '#1f3f5f';
const INK_NOTE = '#6b7a8a';
const INK_RULE = '#9aa7b5';
/** The fit drawing writes an interference in this. */
export const INK_WARNING = '#b3541e';

const DIMENSION_OFFSET_MM = 3.0;
const DIMENSION_PITCH_MM = 3.2;
const EXTENSION_OVERRUN_MM = 0.9;
const EXTENSION_GAP_MM = 0.5;
const ARROW_LENGTH_MM = 1.1;
const ARROW_HALF_WIDTH = 0.32;
export const PAGE_MARGIN_MM = 4.0;
const APEX_ALLOWANCE = 0.2;
const BREAK_MM = 2.4;
const BREAK_AMPLITUDE_MM = 0.7;
/** The class the layer is wrapped in, which is what the file's faces hide. */
export const ANNOTATIONS_CLASS = 'dimensions';

/** One annotated CIP dimension. */
export interface Dimension {
  label: string;
  value: number;
  zFrom: number | null;
  zTo: number | null;
  radius: number | null;
  tolerance: number | null;
  side: number;
  below: boolean;
  head: boolean;
  unit: string;
}

export function dimension(label: string, value: number, options: Partial<Omit<Dimension, 'label' | 'value'>> = {}): Dimension {
  return {
    label,
    value,
    zFrom: options.zFrom ?? null,
    zTo: options.zTo ?? null,
    radius: options.radius ?? null,
    tolerance: options.tolerance ?? null,
    side: options.side ?? 1,
    below: options.below ?? false,
    head: options.head ?? false,
    unit: options.unit ?? 'mm'
  };
}

/** One CIP angle, an arc between two directions about an apex. */
export interface AngleMark {
  label: string;
  degrees: number;
  apexR: number;
  apexZ: number;
  startDeg: number;
  endDeg: number;
  flankMm: number;
  arcMm: number;
  flanks: [boolean, boolean];
  labelInside: boolean;
  labelDeg: number | null;
}

function angleMark(
  label: string, degrees: number, apexR: number, apexZ: number, startDeg: number, endDeg: number,
  options: Partial<Pick<AngleMark, 'flankMm' | 'arcMm' | 'flanks' | 'labelInside' | 'labelDeg'>> = {}
): AngleMark {
  return {
    label, degrees, apexR, apexZ, startDeg, endDeg,
    flankMm: options.flankMm ?? 0,
    arcMm: options.arcMm ?? ANGLE_ARC_MM,
    flanks: options.flanks ?? [true, true],
    labelInside: options.labelInside ?? false,
    labelDeg: options.labelDeg ?? null
  };
}

/** A value pointed at rather than measured: a fillet radius. */
export interface Callout {
  label: string;
  value: number;
  r: number;
  z: number;
  side: number;
  up: boolean;
  colour: string;
}

function callout(label: string, value: number, r: number, z: number, options: Partial<Pick<Callout, 'side' | 'up' | 'colour'>> = {}): Callout {
  return { label, value, r, z, side: options.side ?? 1, up: options.up ?? false, colour: options.colour ?? INK_SYMBOL };
}

const GREEK: Record<string, string> = { alpha: 'α', alpha1: 'α1', beta: 'β', delta: 'δ' };

const TABLE_GROUPS: [string, string[]][] = [
  ['Lengths', ['R', 'E', 'L0', 'L1', 'L2', 'L3', 'S', 'G', 'L6']],
  ['Diameters', ['R1', 'R3', 'E1', 'P1', 'P0', 'P2', 'H1', 'H2', 'G1', 'F']],
  ['Head', ['e min', 'f', 'beta', 'delta']],
  ['Shoulder', ['alpha', 'r1 min', 'r1 max', 'r2']],
  ['Throat', ['alpha1']],
  ['Hull', ['t', 'h', 'l', 'g', 'd']]
];

// ---- Dimension formatting -----------------------------------------------------------

function fixed(value: number, digits: number): string {
  // Preserve the sign of negative zero in fixed-point dimension labels.
  if (Object.is(value, -0)) return `-${(0).toFixed(digits)}`;
  return value.toFixed(digits);
}
const f3 = (value: number): string => fixed(value, 3);
const f4 = (value: number): string => fixed(value, 4);

/** Six significant digits, trailing zeros dropped. */
function general(value: number): string {
  if (value === 0) return '0';
  return String(Number(value.toPrecision(6)));
}

/** `_angle_text`: `40°`, or `33°56'8"` when the angle is not whole. */
function angleText(degrees: number): string {
  const total = Math.round(degrees * 3600);
  const whole = Math.floor(total / 3600);
  const rest = total - whole * 3600;
  const minutes = Math.floor(rest / 60);
  const seconds = rest - minutes * 60;
  if (minutes === 0 && seconds === 0) return `${whole}°`;
  return `${whole}°${minutes}'${seconds}"`;
}

/** `_mm`: two decimals, a tolerance with its sign; nothing for none. */
function mm(value: number | null, signed = false): string {
  if (value == null) return '';
  if (!signed) return value.toFixed(2);
  return value < 0 || Object.is(value, -0) ? value.toFixed(2) : `+${value.toFixed(2)}`;
}

const radians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** `profile.radius_at`: the radius at `z`, the largest where the profile steps there. */
function radiusAtMax(profile: Profile, z: number): number {
  const candidates: number[] = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, z0] = profile[i]!, [r1, z1] = profile[i + 1]!;
    const low = Math.min(z0, z1), high = Math.max(z0, z1);
    if (low - EPSILON <= z && z <= high + EPSILON) {
      if (Math.abs(z1 - z0) < EPSILON) candidates.push(r0, r1);
      else candidates.push(r0 + ((r1 - r0) * (z - z0)) / (z1 - z0));
    }
  }
  if (!candidates.length) throw new Error(`z=${z} lies outside the profile`);
  return Math.max(...candidates);
}

// ---- The dimensions of each subject ------------------------------------------------------------

/** `_bullet_dimensions`: `L6` to the tip, and `G1` on the exposed shank where there is one. */
export function bulletDimensions(c: MetallicCase, bullet: Bullet, exposed = true): Dimension[] {
  const tol = c.tolerances;
  const length = dimension('L6', bullet.tipZ, { zFrom: 0, zTo: bullet.tipZ, tolerance: tol.L6 ?? null });
  if (!exposed) return [length];
  return [
    length,
    dimension('G1', bullet.cylinder.diameter, {
      radius: bullet.cylinder.diameter / 2,
      zFrom: Math.max(bullet.cylinder.endZ - 0.4, (Math.max(c.mouth.z, bullet.cylinder.startZ) + bullet.cylinder.endZ) / 2),
      tolerance: tol.G1 ?? null
    })
  ];
}

/** `_metallic_dimensions`: the columns worth showing on a metallic drawing, each at its position. */
export function metallicDimensions(c: MetallicCase): Dimension[] {
  const tol = c.tolerances;
  const body = c.body;
  const dims: Dimension[] = [
    dimension('R1', c.rim.diameter, { radius: c.rim.radius, tolerance: tol.R1 ?? null, below: true }),
    dimension('R', c.rim.thickness, { zFrom: 0, zTo: c.rim.topZ, tolerance: tol.R ?? null, head: true, side: -1 }),
    dimension('P1', body.diameterBase, {
      radius: body.radiusBase,
      tolerance: tol.P1 ?? null,
      zFrom: body.startZ + Math.max(0.2 * (body.endZ - body.startZ), Math.min(7.0, 0.5 * (body.endZ - body.startZ)))
    }),
    dimension('L3', c.mouth.z, { zFrom: 0, zTo: c.mouth.z, tolerance: tol.L3 ?? null }),
    dimension('H2', c.mouth.outsideDiameter, { radius: c.mouth.outsideDiameter / 2, tolerance: tol.H2 ?? null, zFrom: c.mouth.z })
  ];
  if (c.head.chamferAngle && c.head.chamferHeight > 0) {
    dims.push(dimension('f', c.head.chamferHeight, { zFrom: 0, zTo: c.head.chamferHeight, tolerance: tol.f ?? null, head: true, side: -1 }));
  }
  if (c.groove) {
    const groove = c.groove;
    dims.push(dimension('E1', groove.diameter, { radius: groove.radius, tolerance: tol.E1 ?? null, below: true }));
    dims.push(dimension('E', groove.endZ, { zFrom: 0, zTo: groove.endZ, tolerance: tol.E ?? null, head: true, side: -1 }));
    if (groove.width > 0) {
      dims.push(dimension('e min', groove.width, { zFrom: groove.startZ, zTo: groove.floorEndZ, tolerance: tol.eMin ?? null, head: true, side: -1 }));
    }
  }
  if (c.belt) {
    dims.push(dimension('R3', c.belt.diameter, { radius: c.belt.radius, tolerance: tol.R3 ?? null, below: true }));
  }
  if (c.shoulder) {
    const shoulder = c.shoulder;
    dims.push(dimension('L1', shoulder.startZ, { zFrom: 0, zTo: shoulder.startZ, tolerance: tol.L1 ?? null }));
    dims.push(dimension('L2', shoulder.endZ, { zFrom: 0, zTo: shoulder.endZ, tolerance: tol.L2 ?? null }));
    if (shoulder.apexZ != null) {
      dims.push(dimension('S', shoulder.apexZ, { zFrom: 0, zTo: shoulder.apexZ, tolerance: tol.S ?? null, side: -1 }));
    }
    if (c.neck) {
      dims.push(dimension('H1', c.neck.diameterShoulderEnd, {
        radius: c.neck.diameterShoulderEnd / 2, tolerance: tol.H1 ?? null, zFrom: shoulder.endZ
      }));
    }
  }
  if (c.shoulder) {
    dims.push(dimension('P2', body.diameterForward, { radius: body.radiusForward, tolerance: tol.P2 ?? null, zFrom: body.endZ }));
  }
  return dims;
}

/** `_metallic_angles`: `alpha` from the apex, `beta` at the rim corner, `delta` at the groove. */
export function metallicAngles(c: MetallicCase): AngleMark[] {
  const angles: AngleMark[] = [];
  const shoulder = c.shoulder;
  if (shoulder && shoulder.apexZ != null && shoulder.apexZ > shoulder.startZ) {
    const half = shoulder.halfAngle;
    const reach = shoulder.apexZ - shoulder.startZ;
    angles.push(angleMark('alpha', shoulder.fullAngle, 0, shoulder.apexZ, 270 - half, 270 + half, {
      flankMm: reach * 1.6 + 2.0, arcMm: reach * 1.6, labelInside: true
    }));
  }
  if (c.head.chamferAngle && c.head.chamferHeight > 0) {
    const beta = c.head.chamferAngle;
    angles.push(angleMark('beta', beta, c.rim.radius, 0, 0, -beta, {
      flankMm: ANGLE_ARC_MM + 1.5, arcMm: ANGLE_ARC_MM * 0.7, flanks: [false, true]
    }));
  }
  const groove = c.groove;
  if (groove && groove.rampAngle) {
    angles.push(angleMark('delta', groove.rampAngle, groove.radius, groove.floorEndZ, 90, 90 - groove.rampAngle, {
      flankMm: ANGLE_ARC_MM + 1.5, arcMm: ANGLE_ARC_MM * 0.7, flanks: [false, true]
    }));
  }
  return angles;
}

/** `_metallic_callouts`: the junction cone's two fillet radii, where published. */
export function metallicCallouts(c: MetallicCase): Callout[] {
  const shoulder = c.shoulder;
  if (!shoulder) return [];
  const out: Callout[] = [];
  if (shoulder.filletBodySide > 0) {
    out.push(callout('r1 min', shoulder.filletBodySide, c.body.radiusForward, shoulder.startZ, { side: -1, up: false }));
  }
  if (shoulder.filletNeckSide > 0 && c.neck) {
    out.push(callout('r2', shoulder.filletNeckSide, c.neck.diameterShoulderEnd / 2, shoulder.endZ, { side: 1, up: true }));
  }
  return out;
}

/** `_shotshell_dimensions`: a shot cartridge's own columns with their tolerances. */
export function shotshellDimensions(c: ShotshellCase): Dimension[] {
  const hull = c.hull;
  const tol = c.tolerances;
  return [
    dimension('g', hull.rimDiameter, { radius: hull.rimDiameter / 2, tolerance: tol.g ?? null, below: true }),
    dimension('d', hull.bodyDiameter, { radius: hull.bodyDiameter / 2, tolerance: tol.d ?? null, below: true }),
    dimension('t', hull.rimThickness, { zFrom: 0, zTo: hull.rimThickness, tolerance: tol.t ?? null, head: true, side: -1 }),
    dimension('h', hull.headHeight, { zFrom: 0, zTo: hull.headTopZ, tolerance: tol.h ?? null, head: true, side: -1 }),
    dimension('l', hull.length, { zFrom: 0, zTo: hull.mouthZ })
  ];
}

/** What the chamber sheet states tolerances for. */
interface ChamberTolerances {
  R?: number | null;
  L3?: number | null;
  P2?: number | null;
}

/** The chamber's record as the builders read it: whether `E` is published, and the tolerances. */
export interface ChamberRecordFacts {
  hasE: boolean;
  tolerances: ChamberTolerances;
}

/** The facts from a published record's `chamber` section. */
export function chamberRecordFacts(record: { chamber?: Record<string, unknown> } | null): ChamberRecordFacts | null {
  if (!record?.chamber) return null;
  const chamber = record.chamber as { powderChamber?: Record<string, unknown>; breech?: Record<string, unknown>; lengths?: Record<string, unknown> };
  const numberOr = (value: unknown): number | null => (typeof value === 'number' ? value : null);
  return {
    hasE: chamber.powderChamber?.E != null,
    tolerances: {
      R: numberOr(chamber.breech?.RTol),
      L3: numberOr(chamber.lengths?.L3Tol),
      P2: numberOr(chamber.powderChamber?.P2Tol)
    }
  };
}

/** `chamber_dimensions`: every chamber column that is a length or a diameter. */
export function chamberDimensions(chamber: Chamber, facts: ChamberRecordFacts | null = null): Dimension[] {
  const tol = facts?.tolerances ?? {};
  const throat = chamber.throat;
  const dims: Dimension[] = [];
  const headLabel = facts ? (facts.hasE ? 'E' : 'R') : chamber.datum === 'rim' ? 'R' : 'E';
  dims.push(dimension(headLabel, chamber.recessDepth, {
    zFrom: 0, zTo: chamber.recessDepth, tolerance: headLabel === 'R' ? tol.R ?? null : null, side: -1, head: true
  }));
  dims.push(dimension('R1', chamber.recessDiameter, { zFrom: 0, radius: chamber.recessDiameter / 2, below: true }));
  if (chamber.beltDiameter != null) {
    dims.push(dimension('R3', chamber.beltDiameter, { zFrom: 0, radius: chamber.beltDiameter / 2, below: true }));
  }
  const bottleneck = chamber.neckStartZ != null;
  if (chamber.bodyMidZ != null) dims.push(dimension('L0', chamber.bodyMidZ, { zFrom: 0, zTo: chamber.bodyMidZ }));
  if (bottleneck) {
    dims.push(dimension('L1', chamber.bodyEndZ, { zFrom: 0, zTo: chamber.bodyEndZ }));
    dims.push(dimension('L2', chamber.neckStartZ ?? 0, { zFrom: 0, zTo: chamber.neckStartZ }));
  }
  dims.push(dimension('L3', chamber.mouthZ, { zFrom: 0, zTo: chamber.mouthZ, tolerance: tol.L3 ?? null }));
  if (chamber.coneApexZ != null) dims.push(dimension('S', chamber.coneApexZ, { zFrom: 0, zTo: chamber.coneApexZ, side: -1 }));
  if (throat && throat.freeBoreLength > 0) {
    dims.push(dimension('G', throat.freeBoreLength, { zFrom: chamber.mouthZ, zTo: chamber.freeBoreEndZ }));
  }
  const bodyFrom = chamber.recessDepth;
  dims.push(dimension('P1', chamber.bodyDiameterBase, {
    zFrom: bodyFrom + 0.2 * (chamber.bodyEndZ - bodyFrom), radius: chamber.bodyDiameterBase / 2
  }));
  if (chamber.bodyMidZ != null && chamber.bodyDiameterMid != null) {
    dims.push(dimension('P0', chamber.bodyDiameterMid, { zFrom: chamber.bodyMidZ, radius: chamber.bodyDiameterMid / 2 }));
  }
  if (bottleneck) {
    dims.push(dimension('P2', chamber.bodyDiameterForward, {
      zFrom: chamber.bodyEndZ, radius: chamber.bodyDiameterForward / 2, tolerance: tol.P2 ?? null
    }));
    dims.push(dimension('H1', chamber.neckDiameterBase ?? 0, { zFrom: chamber.neckStartZ, radius: (chamber.neckDiameterBase ?? 0) / 2 }));
  }
  dims.push(dimension('H2', chamber.neckDiameterMouth, { zFrom: chamber.mouthZ, radius: chamber.neckDiameterMouth / 2 }));
  if (throat) {
    const freeBoreMid = (chamber.mouthZ + chamber.freeBoreEndZ) / 2;
    dims.push(dimension('G1', throat.diameter, { zFrom: freeBoreMid, radius: throat.diameter / 2 }));
    const leadeEnd = chamber.freeBoreEndZ + leadeRun(chamber);
    dims.push(dimension('F', throat.landDiameter, { zFrom: leadeEnd + BORE_STUB_MM / 2, radius: throat.landDiameter / 2 }));
  }
  return dims;
}

/** `chamber_angles`: the junction cone's, and the leade's drawn locally. */
export function chamberAngles(chamber: Chamber): AngleMark[] {
  const angles: AngleMark[] = [];
  const bottleneck = chamber.neckStartZ != null;
  if (bottleneck && chamber.coneAngle != null && chamber.coneApexZ != null && chamber.coneApexZ > chamber.bodyEndZ) {
    const half = chamber.coneAngle / 2;
    const reach = chamber.coneApexZ - chamber.bodyEndZ;
    angles.push(angleMark('alpha', chamber.coneAngle, 0, chamber.coneApexZ, 270 - half, 270 + half, {
      flankMm: reach * 1.6 + 2.0, arcMm: reach * 1.6, labelInside: true
    }));
  }
  const throat = chamber.throat;
  if (throat && leadeRun(chamber) > 0) {
    const half = throat.leadeAngle / 2;
    angles.push(angleMark('alpha1', throat.leadeAngle, throat.diameter / 2, chamber.freeBoreEndZ, 90 - half, 90 + half, {
      flankMm: ANGLE_ARC_MM + 2.0, arcMm: ANGLE_ARC_MM * 0.8, labelDeg: 90 + half + 14.0
    }));
  }
  return angles;
}

/** `chamber_callouts`: the cone's two fillet radii. */
export function chamberCallouts(chamber: Chamber): Callout[] {
  if (chamber.neckStartZ == null) return [];
  const out: Callout[] = [];
  if (chamber.coneFilletBody > 0) {
    out.push(callout('r1 max', chamber.coneFilletBody, chamber.bodyDiameterForward / 2, chamber.bodyEndZ, { side: -1, up: false }));
  }
  if (chamber.coneFilletNeck > 0) {
    out.push(callout('r2', chamber.coneFilletNeck, (chamber.neckDiameterBase ?? 0) / 2, chamber.neckStartZ ?? 0, { side: 1, up: true }));
  }
  return out;
}

// ---- The values table --------------------------------------------------------------------------

/** One row: symbol, value, unit, tolerance, and whether it is a heading. */
type Row = [string, string, string, string, boolean];

/** `_table_rows`: the values table in the sheet's notation, grouped by kind. */
function tableRows(dimensions: Dimension[], angles: AngleMark[], callouts: Callout[] = []): Row[] {
  const rows = new Map<string, Row>();
  for (const d of dimensions) rows.set(d.label, [d.label, mm(d.value), d.unit, mm(d.tolerance, true), false]);
  for (const a of angles) rows.set(a.label, [GREEK[a.label] ?? a.label, angleText(a.degrees), '', '', false]);
  for (const c of callouts) rows.set(c.label, [c.label, mm(c.value), 'mm', '', false]);
  const table: Row[] = [];
  const placed = new Set<string>();
  for (const [heading, names] of TABLE_GROUPS) {
    const present = names.filter((name) => rows.has(name));
    if (!present.length) continue;
    table.push([heading, '', '', '', true]);
    for (const name of present) {
      table.push(rows.get(name)!);
      placed.add(name);
    }
  }
  for (const [name, row] of rows) if (!placed.has(name)) table.push(row);
  return table;
}

// ---- The layer ---------------------------------------------------------------------------------

type Pt = [number, number];
type Box = [number, number, number, number];

class Extent {
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  add(x: number, y: number): void {
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
  }
  box(): Box | null {
    if (this.minX === Infinity) return null;
    return [this.minX, this.minY, this.maxX, this.maxY];
  }
}

/** `_arrowhead`: a filled triangle at `(x, y)` pointing away from `(fromX, fromY)`. */
function arrowhead(x: number, y: number, fromX: number, fromY: number, length: number): string {
  const dx = x - fromX, dy = y - fromY;
  const span = Math.sqrt(dx * dx + dy * dy);
  if (span < 1e-9) return '';
  const ux = dx / span, uy = dy / span;
  const nx = -uy, ny = ux;
  const half = length * ARROW_HALF_WIDTH;
  const bx = x - ux * length, by = y - uy * length;
  return `<path d="M${f3(x)},${f3(y)} L${f3(bx + nx * half)},${f3(by + ny * half)} L${f3(bx - nx * half)},${f3(by - ny * half)} Z" fill="#444"/>`;
}

/**
 * `_annotate`: the annotation layer and the box it occupies, `[markup, box]`. `profile` is every
 * drawn point (the case and the exposed bullet together).
 */
export function annotate(
  dimensions: Dimension[],
  angles: AngleMark[],
  callouts: Callout[],
  profile: Profile,
  view: Viewport,
  showTable = false
): [string, Box | null] {
  let rMax = -Infinity, zMin = Infinity, zMax = -Infinity;
  for (const [r, z] of profile) {
    if (r > rMax) rMax = r;
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const stroke = view.length(ANNOTATION_STROKE_MM);
  const font = view.length(LABEL_SIZE_MM);
  const head = view.length(ARROW_LENGTH_MM);
  const pieces: string[] = [];
  const box = new Extent();

  const P = (r: number, z: number): Pt => view.xy(r, z);
  const D = (dr: number, dz: number): Pt => view.direction(dr, dz);
  const step = (point: Pt, along: Pt, by: number): Pt => [point[0] + along[0] * by, point[1] + along[1] * by];

  function line(a: Pt, b: Pt, colour: string, width: number): string {
    box.add(a[0], a[1]);
    box.add(b[0], b[1]);
    return `<line x1="${f3(a[0])}" y1="${f3(a[1])}" x2="${f3(b[0])}" y2="${f3(b[1])}" stroke="${colour}" stroke-width="${f4(width)}"/>`;
  }
  const thin = (a: Pt, b: Pt): string => line(a, b, '#999', stroke * 0.7);
  function arrow(tip: Pt, awayFrom: Pt): string {
    box.add(tip[0], tip[1]);
    return arrowhead(tip[0], tip[1], awayFrom[0], awayFrom[1], head);
  }
  function unit(a: Pt, b: Pt): Pt {
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return span > 1e-9 ? [(b[0] - a[0]) / span, (b[1] - a[1]) / span] : [0, 1];
  }
  function rule(a: Pt, b: Pt, outside = false): string {
    if (!outside) return line(a, b, '#444', stroke) + arrow(a, b) + arrow(b, a);
    const u = unit(a, b);
    const ext = head * 2.2;
    return line(step(a, u, -ext), step(b, u, ext), '#444', stroke) + arrow(a, step(a, u, -1)) + arrow(b, step(b, u, 1));
  }
  function brokenRule(a: Pt, b: Pt): string {
    const u = unit(a, b);
    const n: Pt = [-u[1], u[0]];
    const cut = view.length(BREAK_MM), amp = view.length(BREAK_AMPLITUDE_MM);
    const centre = step(b, u, -cut * 1.5);
    const z0 = step(centre, u, -cut / 2), z1 = step(centre, u, cut / 2);
    const peak = step(step(centre, u, -cut / 4), n, amp);
    const trough = step(step(centre, u, cut / 4), n, -amp);
    return (
      line(a, z0, '#444', stroke) + line(z0, peak, '#444', stroke) + line(peak, trough, '#444', stroke) +
      line(trough, z1, '#444', stroke) + line(z1, b, '#444', stroke) + arrow(a, b)
    );
  }
  function text(
    x: number, y: number, content: string, anchor = 'start', rotate = 0,
    options: { bold?: boolean; cls?: string; size?: number | null; colour?: string } = {}
  ): string {
    const em = options.size ?? font;
    const width = content.length * em * 0.62;
    const [x0, x1] = anchor === 'start' ? [0, width] : anchor === 'end' ? [-width, 0] : [-width / 2, width / 2];
    const y0 = -0.75 * em, y1 = 0.25 * em;
    const a = radians(rotate);
    for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as Pt[]) {
      box.add(x + cx * Math.cos(a) - cy * Math.sin(a), y + cx * Math.sin(a) + cy * Math.cos(a));
    }
    const transform = rotate ? ` transform="rotate(${general(rotate)} ${f3(x)} ${f3(y)})"` : '';
    const weight = options.bold ? ' font-weight="bold"' : '';
    const klass = options.cls ? ` class="${options.cls}"` : '';
    const colour = options.colour ?? INK_SYMBOL;
    return `<text${klass} x="${f3(x)}" y="${f3(y)}" font-size="${f4(em)}" text-anchor="${anchor}" fill="${colour}" font-family="sans-serif"${weight}${transform}>${content}</text>`;
  }
  function label(
    r: number, z: number, content: string,
    options: { along: Pt | null; clear?: Pt; extent?: Pt | null; anchor?: string; colour?: string }
  ): string {
    let rotate = 0;
    if (options.along) {
      const [dx, dy] = D(options.along[0], options.along[1]);
      rotate = toDeg(Math.atan2(dy, dx));
      if (rotate > 90) rotate -= 180;
      else if (rotate <= -90) rotate += 180;
    }
    const theta = radians(rotate);
    const forward: Pt = [Math.cos(theta), Math.sin(theta)];
    const up: Pt = [Math.sin(theta), -Math.cos(theta)];
    let [x, y] = P(r, z);
    const clear = options.clear ?? [0, 0];
    const [sx, sy] = clear[0] !== 0 || clear[1] !== 0 ? D(clear[0], clear[1]) : [0, 0];
    if (sx === 0 && sy === 0) {
      x -= up[0] * 0.25 * font;
      y -= up[1] * 0.25 * font;
    } else {
      const offset = sx * up[0] + sy * up[1] > 0 ? (0.1 + 0.25) * font : (0.1 + 0.75) * font;
      x += sx * offset;
      y += sy * offset;
    }
    let anchor = options.anchor ?? 'middle';
    if (options.extent) {
      const [ex, ey] = D(options.extent[0], options.extent[1]);
      anchor = ex * forward[0] + ey * forward[1] > 0 ? 'start' : 'end';
    }
    return text(x, y, content, anchor, rotate, { colour: options.colour });
  }
  function outlineR(z: number): number {
    if (zMin <= z && z <= zMax) return radiusAtMax(profile, z) + EXTENSION_GAP_MM;
    return 0;
  }

  const ALONG_AXIS: Pt = [0, 1];
  const ACROSS: Pt = [1, 0];
  const zBreak = zMax + APEX_ALLOWANCE * (zMax - zMin);

  function spanOf(d: Dimension): [number, number, boolean] {
    const zFrom = d.zFrom || 0, zTo = d.zTo || 0;
    if (zTo > zBreak) return [zFrom, zBreak, true];
    return [zFrom, zTo, false];
  }
  const byExtent = (a: Dimension, b: Dimension): number => {
    const sa = spanOf(a), sb = spanOf(b);
    return Math.abs(sa[1] - sa[0]) - Math.abs(sb[1] - sb[0]);
  };
  const lengthsRight = dimensions.filter((d) => d.radius === null && !d.head && d.side > 0).sort(byExtent);
  const lengthsLeft = dimensions.filter((d) => d.radius === null && !d.head && d.side < 0).sort(byExtent);
  const headLeft = dimensions.filter((d) => d.radius === null && d.head && d.side < 0).sort(byExtent);
  const headRight = dimensions.filter((d) => d.radius === null && d.head && d.side > 0).sort(byExtent);
  const lineDiameters = dimensions.filter((d) => d.radius !== null && !d.below);
  const below = dimensions.filter((d) => d.radius !== null && d.below).sort((a, b) => (a.radius ?? 0) - (b.radius ?? 0));

  const headOffset: Record<number, number> = { [-1]: DIMENSION_OFFSET_MM, [1]: DIMENSION_OFFSET_MM + 1.5 };
  const rightBase = headRight.length ? headOffset[1]! + headRight.length * DIMENSION_PITCH_MM : DIMENSION_OFFSET_MM;
  const leftBase = DIMENSION_OFFSET_MM + Math.max(headLeft.length * DIMENSION_PITCH_MM, lineDiameters.length ? DIAMETER_LABEL_MM : 0);
  let rightReach = rightBase + Math.max(lengthsRight.length - 1, 0) * DIMENSION_PITCH_MM;
  let leftReach = leftBase + Math.max(lengthsLeft.length - 1, 0) * DIMENSION_PITCH_MM;
  if (!lengthsRight.length) rightReach = headOffset[1]! + Math.max(headRight.length - 1, 0) * DIMENSION_PITCH_MM;
  if (!lengthsLeft.length) leftReach = DIMENSION_OFFSET_MM + Math.max(headLeft.length - 1, 0) * DIMENSION_PITCH_MM;

  // - The head face datum --
  if (dimensions.length) {
    pieces.push(thin(P(-(rMax + leftReach + EXTENSION_OVERRUN_MM), zMin), P(rMax + rightReach + EXTENSION_OVERRUN_MM, zMin)));
  }

  // - Case lengths: the stack on the +r side, and S on the -r side --
  for (const [side, group, base] of [[1, lengthsRight, rightBase], [-1, lengthsLeft, leftBase]] as [number, Dimension[], number][]) {
    if (!group.length) continue;
    const zBand = 0.7 * Math.min(...group.map((d) => { const s = spanOf(d); return Math.max(s[0], s[1]); }));
    group.forEach((d, index) => {
      const rLine = side * (rMax + base + index * DIMENSION_PITCH_MM);
      const [zFrom, zTo, broken] = spanOf(d);
      for (const z of [zFrom, zTo]) {
        if (Math.abs(z - zMin) < 1e-9) continue;
        if (broken && z === zTo) continue;
        pieces.push(thin(P(side * outlineR(z), z), P(rLine + side * EXTENSION_OVERRUN_MM, z)));
      }
      pieces.push(broken ? brokenRule(P(rLine, zFrom), P(rLine, zTo)) : rule(P(rLine, zFrom), P(rLine, zTo)));
      const zLabel = Math.min(zFrom, zTo) <= zBand && zBand <= Math.max(zFrom, zTo) ? zBand : (zFrom + zTo) / 2;
      pieces.push(label(rLine, zLabel, d.label, { along: ALONG_AXIS, clear: [-1, 0] }));
    });
  }

  // - Head lengths behind the head face --
  for (const [side, group] of [[-1, headLeft], [1, headRight]] as [number, Dimension[]][]) {
    group.forEach((d, index) => {
      const rLine = side * (rMax + headOffset[side]! + index * DIMENSION_PITCH_MM);
      const zFrom = d.zFrom || 0, zTo = d.zTo || 0;
      for (const z of [zFrom, zTo]) {
        if (Math.abs(z - zMin) < 1e-9) continue;
        pieces.push(thin(P(side * outlineR(z), z), P(rLine + side * EXTENSION_OVERRUN_MM, z)));
      }
      const short = view.length(Math.abs(zTo - zFrom)) < 3 * head;
      pieces.push(rule(P(rLine, zFrom), P(rLine, zTo), short));
      const zAnchor = Math.min(zFrom, zTo) - (short ? ARROW_LENGTH_MM * 2.2 : 0) - LABEL_SIZE_MM * 0.6;
      pieces.push(label(rLine, zAnchor, d.label, { along: ALONG_AXIS, extent: [0, -1] }));
    });
  }

  // - Diameters as lines across the part, symbol at the -r end --
  let previousZ: number | null = null;
  const farRight = rMax + DIMENSION_OFFSET_MM + (lengthsRight.length || headRight.length ? rightReach : 0);
  const sortedDiameters = [...lineDiameters].sort((a, b) => (a.zFrom ?? zMin) - (b.zFrom ?? zMin));
  for (const d of sortedDiameters) {
    const radius = d.radius ?? 0;
    const z = d.zFrom ?? zMin;
    const crowded: boolean = previousZ !== null && Math.abs(z - (previousZ as number)) < LABEL_SIZE_MM * 1.3;
    previousZ = crowded ? null : z;
    const labelSide = crowded ? 1 : -1;
    const far = rMax + DIMENSION_OFFSET_MM;
    const endLeft = labelSide < 0 ? P(-far, z) : step(P(-radius, z), D(1, 0), -head * 2.2);
    const endRight = labelSide > 0 ? P(farRight, z) : step(P(radius, z), D(1, 0), head * 2.2);
    pieces.push(line(endLeft, endRight, '#444', stroke));
    pieces.push(arrow(P(-radius, z), step(P(-radius, z), D(1, 0), -1)));
    pieces.push(arrow(P(radius, z), step(P(radius, z), D(1, 0), 1)));
    pieces.push(label(labelSide > 0 ? farRight : -far, z, d.label, { along: ACROSS, clear: [0, 1], extent: [-labelSide, 0] }));
  }

  // - Head diameters behind the head face --
  below.forEach((d, index) => {
    const z = zMin - DIMENSION_OFFSET_MM - index * DIMENSION_PITCH_MM;
    const radius = d.radius ?? 0;
    for (const sign of [-1, 1]) {
      pieces.push(thin(P(sign * radius, zMin - EXTENSION_GAP_MM), P(sign * radius, z - EXTENSION_OVERRUN_MM)));
    }
    pieces.push(rule(P(-radius, z), P(radius, z), 2 * view.length(radius) < 3 * head));
    pieces.push(label(0, z, d.label, { along: ACROSS, clear: [0, 1] }));
  });

  // - Angles as arcs about their vertex --
  for (const angle of angles) {
    let arc = angle.arcMm, flankMm = angle.flankMm, flankFrom = 0;
    const a0 = radians(angle.startDeg), a1 = radians(angle.endDeg);
    if (angle.apexZ > zBreak) {
      arc = Math.min(arc, angle.apexZ - (zMin + 0.35 * (zMax - zMin)));
      if (flankMm > 0) {
        flankMm = arc + 2.0;
        const half = Math.abs(Math.sin(a0)) || 1.0;
        flankFrom = (angle.apexZ - zBreak) / half;
      }
    }
    const onArc = (a: number, distance = arc): Pt => P(angle.apexR + distance * Math.cos(a), angle.apexZ + distance * Math.sin(a));
    const arcR = view.length(arc);
    const p0 = onArc(a0), p1 = onArc(a1);
    const sweep = angle.endDeg > angle.startDeg ? 0 : 1;
    pieces.push(
      `<path d="M${f3(p0[0])},${f3(p0[1])} A${f3(arcR)},${f3(arcR)} 0 0 ${sweep} ${f3(p1[0])},${f3(p1[1])}" fill="none" stroke="#444" stroke-width="${f4(stroke)}"/>`
    );
    for (let k = 0; k <= 10; k++) {
      const [x, y] = onArc(a0 + ((a1 - a0) * k) / 10);
      box.add(x, y);
    }
    const inward = (a1 - a0) * 0.3;
    pieces.push(arrow(p0, onArc(a0 + inward)));
    pieces.push(arrow(p1, onArc(a1 - inward)));
    if (flankMm > 0) {
      [a0, a1].forEach((a, i) => {
        if (angle.flanks[i]) pieces.push(thin(onArc(a, flankFrom), onArc(a, flankMm)));
      });
    }
    const mid = angle.labelDeg == null ? (a0 + a1) / 2 : radians(angle.labelDeg);
    const distance = angle.labelInside ? arc - LABEL_SIZE_MM * 1.1 : arc + LABEL_SIZE_MM * 0.9;
    pieces.push(label(angle.apexR + distance * Math.cos(mid), angle.apexZ + distance * Math.sin(mid), GREEK[angle.label] ?? angle.label, { along: null }));
  }

  // - Fillet radii, pointed at from the corner they round --
  for (const c of callouts) {
    const direction: Pt = [c.side / Math.SQRT2, (c.up ? 1 : -1) / Math.SQRT2];
    const corner: Pt = [c.side * c.r, c.z];
    const far: Pt = [corner[0] + direction[0] * LEADER_MM, corner[1] + direction[1] * LEADER_MM];
    pieces.push(thin(P(corner[0], corner[1]), P(far[0], far[1])));
    pieces.push(arrow(P(corner[0], corner[1]), P(far[0], far[1])));
    const gap = LABEL_SIZE_MM * 0.3;
    pieces.push(label(far[0] + direction[0] * gap, far[1] + direction[1] * gap, c.label, { along: direction, extent: direction, colour: c.colour }));
  }

  // - The values table, when asked for --
  if (dimensions.length && showTable) {
    const xSymbol = box.maxX + view.length(3.0);
    const xEquals = xSymbol + view.length(TABLE_EQUALS_MM);
    const xValue = xSymbol + view.length(TABLE_VALUE_MM);
    const xUnit = xSymbol + view.length(TABLE_UNIT_MM);
    const xTolerance = xSymbol + view.length(TABLE_TOLERANCE_MM);
    const xRuleEnd = xSymbol + view.length(TABLE_WIDTH_MM);
    const row = view.length(TABLE_ROW_MM);
    let y = box.minY + font;
    tableRows(dimensions, angles, callouts).forEach(([symbol, value, unitText, tolerance, heading], index) => {
      if (heading) {
        if (index > 0) y += row * 0.6;
        pieces.push(text(xSymbol, y, symbol, 'start', 0, { bold: true }));
        pieces.push(line([xSymbol, y + font * 0.45], [xRuleEnd, y + font * 0.45], INK_RULE, stroke * 0.7));
        y += row * 0.15;
      } else {
        pieces.push(text(xSymbol, y, symbol, 'start', 0, { cls: 'symbol' }));
        pieces.push(text(xEquals, y, '=', 'middle'));
        pieces.push(text(xValue, y, value, 'end'));
        if (unitText) pieces.push(text(xUnit, y, unitText, 'start', 0, { colour: INK_NOTE }));
        if (tolerance) pieces.push(text(xTolerance, y, `${tolerance} ${unitText}`.trim()));
      }
      y += row;
    });
  }

  return [`<g class="${ANNOTATIONS_CLASS}">${pieces.join('')}</g>`, box.box()];
}

/** The margins `page_margins` returns, in mm, as `viewportFor` takes them. */
interface PageMargins {
  marginLeftMm: number;
  marginRightMm: number;
  marginTopMm: number;
  marginBottomMm: number;
}

/**
 * `page_margins`: how much the page grows on each side for what sits outside the part. Measured:
 * the layer is laid out once on a probe viewport at one unit per millimetre, and the page grows
 * by however far its box reaches past the part.
 */
export function pageMargins(
  dimensions: Dimension[],
  angles: AngleMark[],
  callouts: Callout[],
  profiles: Profile[],
  showTable = false,
  frame: Frame = 'upright'
): PageMargins {
  const points = profiles.flat();
  let rMax = -Infinity, zMin = Infinity, zMax = -Infinity;
  for (const [r, z] of points) {
    if (r > rMax) rMax = r;
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  if (!dimensions.length && !angles.length && !callouts.length) {
    return { marginLeftMm: PAGE_MARGIN_MM, marginRightMm: PAGE_MARGIN_MM, marginTopMm: 0, marginBottomMm: PAGE_MARGIN_MM };
  }
  const probe = new Viewport(zMin, zMax, rMax, { scale: 1, marginMm: 0, frame });
  const [, box] = annotate(dimensions, angles, callouts, points, probe, showTable);
  if (!box) return { marginLeftMm: 0, marginRightMm: 0, marginTopMm: 0, marginBottomMm: 0 };
  const [minX, minY, maxX, maxY] = box;
  const breathing = 1.0;
  const grow = (overshoot: number): number => Math.max(0, overshoot + breathing - PAGE_MARGIN_MM);
  return {
    marginLeftMm: grow(-minX),
    marginRightMm: grow(maxX - probe.width),
    marginTopMm: grow(-minY),
    marginBottomMm: grow(maxY - probe.height)
  };
}
