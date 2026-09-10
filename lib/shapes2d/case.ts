/** Resolve a published record into a metallic case and its outer half-profile. */

import {
  ARC_SEGMENTS,
  applyFillet,
  arcTo,
  lineTo,
  radians,
  toDegrees,
  type Angle,
  type Profile
} from '../geom/profile';

// ---- The record, as published -------------------------------------------------------------

export interface CartridgeRecord {
  key: string;
  name: string;
  family: 'rimless' | 'rimmed' | 'belted' | 'pistol' | 'rimfire' | 'other' | 'shotshell';
  annotations?: {
    category?: 'rifle' | 'pistol' | 'shotgun' | 'rimfire' | null;
    primerType?: string | null;
    defaultBulletShape?: 'pointy' | 'rounded' | 'flat' | 'shot' | 'wadcutter' | 'semi_wadcutter' | null;
    /** Water capacity with its source. */
    publishedCapacity?: { grH2O: number; source?: string | null; url?: string | null; note?: string | null } | null;
  };
  cartridge: {
    lengths?: Partial<Record<'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6', number | null>>;
    caseHead?: {
      R?: number | null; R1?: number | null; R3?: number | null; E?: number | null; E1?: number | null;
      eMin?: number | null; delta?: Angle | null; f?: number | null; beta?: Angle | null; r0?: number | null;
    };
    powderChamber?: { P0?: number | null; P1?: number | null; P2?: number | null };
    junctionCone?: { alpha?: Angle | null; S?: number | null; r1Min?: number | null; r2?: number | null } | null;
    collar?: { H1?: number | null; H2?: number | null };
    projectile?: { G?: number | null; G1?: number | null; G2?: number | null; F?: number | null; L3PlusG?: number | null; L1PlusG?: number | null };
  };
  chamber?: {
    lengths?: Partial<Record<'L0' | 'L1' | 'L2' | 'L3', number | null>>;
    breech?: { R?: number | null; R1?: number | null; R2?: number | null; R3?: number | null; r?: number | null };
    powderChamber?: { E?: number | null; P0?: number | null; P1?: number | null; P2?: number | null };
    junctionCone?: { alpha?: Angle | null; S?: number | null; r1Max?: number | null; r2?: number | null } | null;
    collar?: { H1?: number | null; H2?: number | null };
    rifling?: { G1?: number | null; G?: number | null; alpha1?: Angle | null };
    barrel?: { F?: number | null; Z?: number | null };
  };
}

export class MissingDimensionError extends Error {
  constructor(key: string, field: string, neededFor: string) {
    super(`${key}: ${field} is not published, and it is needed for ${neededFor}`);
  }
}

function require(value: number | null | undefined, key: string, field: string, neededFor: string): number {
  if (value == null) throw new MissingDimensionError(key, field, neededFor);
  return value;
}

// ---- Derived values ---------------------------------------------------

const BODY_WALL_FACTOR = 1.3;
const BODY_WALL_MIN_MM = 0.6;
export const BODY_WALL_MAX_FRACTION = 0.35;
const WEB_FRACTION_OF_BODY_RADIUS = 0.25;
const WEB_MIN_MM = 2.5;
/** Brass between the pocket floor and the cavity floor (`derived.WEB_ABOVE_POCKET_MM`, 2026-09-06). */
const WEB_ABOVE_POCKET_MM = 1.5;
/** A shot cartridge's head keeps the thin clearance. */
export const PRIMER_POCKET_CLEARANCE_MM = 0.5;
/** The web taper and the floor fillet of the powder space. */
export const WEB_TAPER_FACTOR = 1.6;
export const WEB_TAPER_CALIBRES = 0.5;
export const FLOOR_FILLET_FRACTION = 0.25;
const METALLIC_CRIMP_DEPTH_MM = 1.2;
export const TAPER_CRIMP_DIAMETER_REDUCTION_MM = 0.1;
const HEELED_TOLERANCE_MM = 0.015;
const RIM_PROUD_RATIO = 1.05;
const RIM_REBATED_RATIO = 0.98;

/** Primer pocket depth by the annotation's size code. */
const POCKET_DEPTH: Record<string, number> = {
  sp: 3.04, spm: 3.04, sr: 3.04, lp: 3.04, lpm: 3.04, lr: 3.3, lrm: 3.3, '209': 3.18
};

function bodyWallThickness(neckWall: number, bodyRadius: number): number {
  const wall = Math.max(neckWall * BODY_WALL_FACTOR, BODY_WALL_MIN_MM);
  return Math.min(wall, bodyRadius * BODY_WALL_MAX_FRACTION);
}

function webThickness(
  bodyRadius: number,
  pocketDepth: number | null,
  headCutEndZ: number | null,
  bodyWall: number,
  abovePocket: number = WEB_ABOVE_POCKET_MM
): number {
  let web = Math.max(WEB_MIN_MM, bodyRadius * WEB_FRACTION_OF_BODY_RADIUS);
  if (pocketDepth != null) web = Math.max(web, pocketDepth + abovePocket);
  if (headCutEndZ != null) web = Math.max(web, headCutEndZ + bodyWall);
  return web;
}

function extractorGrooveFloor(
  rimThickness: number,
  bodyStartZ: number,
  grooveDiameter: number,
  bodyDiameter: number,
  rampAngle: number | null
): number {
  const span = bodyStartZ - rimThickness;
  if (rampAngle == null || rampAngle <= 0) return Math.max(0, span);
  const run = (bodyDiameter - grooveDiameter) / 2 / Math.tan(radians(rampAngle));
  return Math.max(0, span - run);
}

type CrimpType = 'none' | 'taper' | 'roll' | 'star';
type RimType = 'rimmed' | 'semi_rimmed' | 'rimless' | 'rebated' | 'belted' | 'rimfire';

function defaultCrimp(
  family: CartridgeRecord['family'],
  category: string | null | undefined,
  rimType: RimType
): CrimpType {
  if (family === 'shotshell') return 'star';
  if (family === 'rimfire') return 'none';
  const isHandgun = category === 'pistol' || family === 'pistol';
  if (rimType === 'rimmed' || rimType === 'semi_rimmed') return 'roll';
  if (isHandgun) return 'taper';
  return 'none';
}

// ---- The resolved case -----------------------------------

export interface MetallicCase {
  key: string;
  name: string;
  family: CartridgeRecord['family'];
  category: string | null;
  rim: { diameter: number; thickness: number; filletRadius: number; rimType: RimType; radius: number; topZ: number };
  head: { diameter: number; webThickness: number; chamferAngle: number | null; chamferHeight: number; radius: number };
  groove: {
    diameter: number; width: number; rampAngle: number | null; startZ: number; fullDiameterZ: number;
    radius: number; endZ: number; floorEndZ: number;
  } | null;
  belt: { diameter: number; startZ: number; fullDiameterZ: number; topZ: number; radius: number } | null;
  body: {
    diameterBase: number; diameterForward: number; diameterMid: number | null; midZ: number | null;
    startZ: number; endZ: number; wallThickness: number; radiusBase: number; radiusForward: number;
  };
  shoulder: {
    fullAngle: number; halfAngle: number; startZ: number; endZ: number; filletBodySide: number; filletNeckSide: number;
    /** CIP `S`, the cone's theoretical apex from the head face, where the sheet publishes it. */
    apexZ: number | null;
  } | null;
  neck: {
    diameterShoulderEnd: number; diameterMouth: number; bulletDiameter: number; startZ: number; endZ: number;
    wallThickness: number; radiusMouth: number;
  } | null;
  mouth: { z: number; outsideDiameter: number; insideDiameter: number; crimp: CrimpType; crimpDepth: number; crimpStartZ: number };
  isHeeled: boolean;
  mouthWallThickness: number;
  mouthBoreDiameter: number;
  /** Where the powder cavity's floor lies, from the head face: the web's thickness. */
  cavityFloorZ: number;
  /** Every published tolerance, keyed by its column (`adapter._tolerances`): `{ R: -0.25 }`. */
  tolerances: Record<string, number>;
  /** The references' capacity in mm^3 where one is collected; the interior is corrected to it. */
  publishedCapacityMm3: number | null;
}

/** Grains of water per cubic millimetre: a grain is 0.06479891 g, water 1 g/cm^3. */
export const GRAINS_H2O_PER_MM3 = 1 / 0.06479891 / 1000;

/**
 * `adapter._tolerances`: every `<column>Tol` field in the record's cartridge sections, keyed by
 * the column. Walked rather than listed, so a column that gains a tolerance is carried.
 */
function tolerancesOf(record: CartridgeRecord): Record<string, number> {
  const found: Record<string, number> = {};
  const cart = record.cartridge as Record<string, unknown>;
  for (const section of ['lengths', 'caseHead', 'powderChamber', 'collar', 'projectile']) {
    const fields = cart[section];
    if (!fields || typeof fields !== 'object') continue;
    for (const [field, value] of Object.entries(fields as Record<string, unknown>)) {
      if (field.endsWith('Tol') && typeof value === 'number') found[field.slice(0, -3)] = value;
    }
  }
  return found;
}

function rimTypeOf(family: CartridgeRecord['family'], rimDiameter: number, bodyDiameter: number): RimType {
  if (family === 'belted') return 'belted';
  if (family === 'rimfire') return 'rimfire';
  const ratio = rimDiameter / bodyDiameter;
  if (ratio >= RIM_PROUD_RATIO) return 'rimmed';
  if (ratio < RIM_REBATED_RATIO) return 'rebated';
  return 'rimless';
}

/** `adapter.adapt_metallic`, for the record as the site publishes it. */
export function adaptMetallic(record: CartridgeRecord): MetallicCase {
  const key = record.key;
  const cart = record.cartridge;
  const head = cart.caseHead ?? {};
  const chamber = cart.powderChamber ?? {};
  const lengths = cart.lengths ?? {};
  const collar = cart.collar ?? {};
  const projectile = cart.projectile ?? {};
  const notes = record.annotations ?? {};
  const category = notes.category ?? null;

  const rimDiameter = require(head.R1, key, 'R1', 'the rim');
  const rimThickness = require(head.R, key, 'R', 'the rim');
  const bodyBaseDiameter = require(chamber.P1, key, 'P1', 'the case body');
  const caseLength = require(lengths.L3, key, 'L3', 'the case mouth');
  const mouthOutside = require(collar.H2, key, 'H2', 'the case mouth');
  const bulletDiameter = require(projectile.G1, key, 'G1', 'the neck wall thickness');
  let grippedDiameter = bulletDiameter;
  if (bulletDiameter >= mouthOutside && projectile.G2 != null && projectile.G2 < mouthOutside) {
    grippedDiameter = projectile.G2;
  }

  const rimType = rimTypeOf(record.family, rimDiameter, bodyBaseDiameter);
  const rim = {
    diameter: rimDiameter,
    thickness: rimThickness,
    filletRadius: head.r0 ?? 0,
    rimType,
    radius: rimDiameter / 2,
    topZ: rimThickness
  };

  let groove: MetallicCase['groove'] = null;
  let belt: MetallicCase['belt'] = null;
  if (head.E1 != null && head.E != null) {
    const rampAngle = toDegrees(head.delta);
    let width = head.eMin;
    if (width == null) {
      width = extractorGrooveFloor(
        rim.thickness,
        head.E,
        head.E1,
        record.family === 'belted' && head.R3 ? head.R3 : bodyBaseDiameter,
        rampAngle
      );
    }
    groove = {
      diameter: head.E1,
      width,
      rampAngle,
      startZ: rim.topZ,
      fullDiameterZ: head.E,
      radius: head.E1 / 2,
      endZ: head.E,
      floorEndZ: rim.topZ + width
    };
  }
  if (record.family === 'belted') {
    const beltDiameter = require(head.R3, key, 'R3', 'the belt');
    if (groove === null) throw new MissingDimensionError(key, 'E1', 'the belt, which sits forward of the groove');
    let rampRun = 0;
    if (groove.rampAngle) rampRun = (beltDiameter - groove.diameter) / 2 / Math.tan(radians(groove.rampAngle));
    belt = {
      diameter: beltDiameter,
      startZ: groove.floorEndZ,
      fullDiameterZ: groove.floorEndZ + rampRun,
      topZ: groove.fullDiameterZ,
      radius: beltDiameter / 2
    };
    if (!(belt.startZ <= belt.fullDiameterZ && belt.fullDiameterZ <= belt.topZ)) {
      throw new Error(`${key}: belt ramp reaches full diameter at z=${belt.fullDiameterZ}, outside the belt`);
    }
  }
  const bodyStartZ = groove ? groove.endZ : rim.topZ;

  const junction = cart.junctionCone ?? null;
  const alpha = junction ? toDegrees(junction.alpha) : null;
  const hasShoulder = alpha != null && lengths.L1 != null && lengths.L2 != null;
  const hasNeck = hasShoulder && (lengths.L2 as number) < caseLength;

  let shoulder: MetallicCase['shoulder'] = null;
  let neck: MetallicCase['neck'] = null;
  let neckWall: number;
  let bodyEndZ: number;
  let bodyForwardDiameter: number;
  if (hasShoulder) {
    shoulder = {
      fullAngle: alpha as number,
      halfAngle: (alpha as number) / 2,
      apexZ: junction?.S ?? null,
      startZ: lengths.L1 as number,
      endZ: lengths.L2 as number,
      filletBodySide: junction?.r1Min ?? 0,
      filletNeckSide: junction?.r2 ?? 0
    };
    if (hasNeck) {
      const h1 = require(collar.H1, key, 'H1', 'the neck at the shoulder');
      if (mouthOutside <= grippedDiameter) {
        throw new Error(`${key}: neck outside diameter H2=${mouthOutside} must exceed bullet diameter G1=${grippedDiameter}`);
      }
      neck = {
        diameterShoulderEnd: h1,
        diameterMouth: mouthOutside,
        bulletDiameter: grippedDiameter,
        startZ: shoulder.endZ,
        endZ: caseLength,
        wallThickness: (mouthOutside - grippedDiameter) / 2,
        radiusMouth: mouthOutside / 2
      };
      neckWall = neck.wallThickness;
    } else {
      neckWall = (mouthOutside - grippedDiameter) / 2;
    }
    bodyEndZ = shoulder.startZ;
    bodyForwardDiameter = require(chamber.P2, key, 'P2', 'the body at the shoulder');
  } else {
    bodyEndZ = caseLength;
    bodyForwardDiameter = mouthOutside;
    neckWall = (mouthOutside - grippedDiameter) / 2;
  }

  if (bodyEndZ <= bodyStartZ) throw new Error(`${key}: case body must have positive length`);
  const midZ = lengths.L0 ?? null;
  const diameterMid = chamber.P0 ?? null;
  if (midZ != null && !(bodyStartZ < midZ && midZ < bodyEndZ)) {
    throw new Error(`${key}: double-taper break z=${midZ} must lie inside the body`);
  }
  const body = {
    diameterBase: bodyBaseDiameter,
    diameterForward: bodyForwardDiameter,
    diameterMid,
    midZ,
    startZ: bodyStartZ,
    endZ: bodyEndZ,
    wallThickness: bodyWallThickness(neckWall, bodyBaseDiameter / 2),
    radiusBase: bodyBaseDiameter / 2,
    radiusForward: bodyForwardDiameter / 2
  };

  // The primer: none for a rimfire; a centrefire record requires one.
  let pocketDepth: number | null = null;
  const primerType = notes.primerType ?? null;
  if (primerType !== 'rimfire') {
    if (primerType == null) {
      if (record.family !== 'rimfire') {
        throw new MissingDimensionError(key, 'primerType', 'the primer pocket of a centrefire case');
      }
    } else {
      pocketDepth = POCKET_DEPTH[primerType] ?? null;
    }
  }
  const headCutEndZ = belt ? belt.fullDiameterZ : groove ? groove.endZ : null;
  const web = webThickness(bodyBaseDiameter / 2, pocketDepth, headCutEndZ, body.wallThickness);
  const beta = toDegrees(head.beta);
  const headModel = {
    diameter: bodyBaseDiameter,
    webThickness: web,
    chamferAngle: beta == null || beta >= 90 ? null : beta,
    chamferHeight: head.f ?? 0,
    radius: bodyBaseDiameter / 2
  };

  const crimp = defaultCrimp(record.family, category, rimType);
  const crimpDepth = crimp === 'none' ? 0 : METALLIC_CRIMP_DEPTH_MM;
  const mouth = {
    z: caseLength,
    outsideDiameter: mouthOutside,
    insideDiameter: bulletDiameter,
    crimp,
    crimpDepth,
    crimpStartZ: caseLength - crimpDepth
  };

  const isHeeled = mouthOutside - bulletDiameter <= HEELED_TOLERANCE_MM;
  const mouthWallThickness = isHeeled
    ? neck ? neck.wallThickness : body.wallThickness
    : (mouthOutside - bulletDiameter) / 2;
  const mouthBoreDiameter = isHeeled ? mouthOutside - 2 * mouthWallThickness : bulletDiameter;

  return {
    key,
    name: record.name,
    family: record.family,
    category,
    rim,
    head: headModel,
    groove,
    belt,
    body,
    shoulder,
    neck,
    mouth,
    isHeeled,
    mouthWallThickness,
    mouthBoreDiameter,
    cavityFloorZ: web,
    tolerances: tolerancesOf(record),
    publishedCapacityMm3: notes.publishedCapacity?.grH2O != null ? notes.publishedCapacity.grH2O / GRAINS_H2O_PER_MM3 : null
  };
}

// ---- The outer profile --------------------------------------------

function rimProfile(c: MetallicCase, nextRadius: number): Profile {
  const points: Profile = [];
  const { rim, head } = c;
  if (rim.rimType === 'rimfire') {
    // A fold: a half-round through the whole rim thickness, never past what follows the rim.
    let radius = Math.min(rim.thickness / 2, rim.radius / 2);
    radius = Math.min(radius, Math.max(rim.radius - nextRadius, 0));
    const centreR = rim.radius - radius;
    lineTo(points, centreR, 0);
    arcTo(points, centreR, radius, radius, -Math.PI / 2, Math.PI / 2, ARC_SEGMENTS * 2);
    lineTo(points, centreR, rim.thickness);
  } else if (head.chamferAngle && head.chamferHeight) {
    const inset = Math.min(head.chamferHeight * Math.tan(radians(head.chamferAngle)), rim.radius * 0.5);
    lineTo(points, rim.radius - inset, 0);
    lineTo(points, rim.radius, head.chamferHeight);
    lineTo(points, rim.radius, rim.topZ);
  } else if (rim.filletRadius > 0) {
    const edge = Math.min(rim.filletRadius, rim.thickness);
    lineTo(points, rim.radius - edge, 0);
    arcTo(points, rim.radius - edge, edge, edge, -Math.PI / 2, 0, ARC_SEGMENTS);
    lineTo(points, rim.radius, rim.thickness);
  } else {
    lineTo(points, rim.radius, 0);
    lineTo(points, rim.radius, rim.topZ);
  }
  return points;
}

function extend(points: Profile, addition: Profile): void {
  for (const [r, z] of addition) lineTo(points, r, z);
}

/** `case_profile.case_outer_profile`: the case as manufactured, head face to mouth, no crimp. */
export function caseOuterProfile(c: MetallicCase): Profile {
  const following = c.groove ? c.groove.radius : c.belt ? c.belt.radius : c.body.radiusBase;
  let points: Profile = rimProfile(c, following);

  if (c.groove) {
    const groove = c.groove;
    const exitRadius = c.belt ? groove.radius : c.body.radiusBase;
    let groovePoints: Profile = [];
    lineTo(groovePoints, points[points.length - 1]![0], groove.startZ);
    lineTo(groovePoints, groove.radius, groove.startZ);
    lineTo(groovePoints, groove.radius, groove.floorEndZ);
    lineTo(groovePoints, exitRadius, groove.endZ);
    if (c.belt) groovePoints = groovePoints.filter((p) => p[1] <= (c.belt as NonNullable<typeof c.belt>).startZ);
    extend(points, groovePoints);
    if (c.belt) {
      const belt = c.belt;
      const beltPoints: Profile = [];
      lineTo(beltPoints, points[points.length - 1]![0], belt.startZ);
      lineTo(beltPoints, belt.radius, belt.fullDiameterZ);
      lineTo(beltPoints, belt.radius, belt.topZ);
      lineTo(beltPoints, c.body.radiusBase, belt.topZ);
      extend(points, beltPoints);
    }
  } else {
    lineTo(points, c.body.radiusBase, c.rim.topZ);
  }

  // The body.
  {
    const body = c.body;
    const entryRadius = points[points.length - 1]![0];
    const bodyPoints: Profile = [];
    lineTo(bodyPoints, entryRadius, body.startZ);
    if (entryRadius !== body.radiusBase) lineTo(bodyPoints, body.radiusBase, body.startZ);
    if (body.diameterMid != null && body.midZ != null) lineTo(bodyPoints, body.diameterMid / 2, body.midZ);
    lineTo(bodyPoints, body.radiusForward, body.endZ);
    extend(points, bodyPoints);
  }

  if (c.shoulder && c.neck) {
    const bodyCorner = points.length - 1;
    extend(points, [
      [c.body.radiusForward, c.shoulder.startZ],
      [c.neck.diameterShoulderEnd / 2, c.shoulder.endZ]
    ]);
    const neckCorner = points.length - 1;
    extend(points, neckProfile(c.neck, points[points.length - 1]![0]));
    points = applyFillet(points, neckCorner, c.shoulder.filletNeckSide);
    points = applyFillet(points, bodyCorner, c.shoulder.filletBodySide);
  } else if (c.shoulder) {
    const bodyCorner = points.length - 1;
    extend(points, [
      [c.body.radiusForward, c.shoulder.startZ],
      [c.mouth.outsideDiameter / 2, c.shoulder.endZ]
    ]);
    points = applyFillet(points, bodyCorner, c.shoulder.filletBodySide);
  } else if (c.neck) {
    extend(points, neckProfile(c.neck, points[points.length - 1]![0]));
  }

  lineTo(points, c.mouth.outsideDiameter / 2, c.mouth.z);
  return points;
}

function neckProfile(neck: NonNullable<MetallicCase['neck']>, entryRadius: number): Profile {
  const points: Profile = [];
  lineTo(points, entryRadius, neck.startZ);
  if (entryRadius !== neck.diameterShoulderEnd / 2) lineTo(points, neck.diameterShoulderEnd / 2, neck.startZ);
  lineTo(points, neck.radiusMouth, neck.endZ);
  return points;
}
