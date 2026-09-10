/** Resolve a default projectile and construct its half-profile. */

import type { MetallicCase } from './case';
import { EPSILON, lineTo, ProfileError, radians, truncateBehind, type Profile } from '../geom/profile';

export type BulletCategory =
  | 'rifle_spitzer' | 'rifle_vld' | 'rifle_round_nose' | 'rifle_flat_nose'
  | 'pistol_round_nose' | 'pistol_jhp' | 'pistol_fmj_truncated' | 'pistol_semi_wadcutter'
  | 'pistol_wadcutter' | 'pistol_flat_nose';
export type OgiveType = 'tangent' | 'secant' | 'hybrid' | 'elliptical' | 'conical' | 'parabolic';
export type TipType = 'sharp' | 'open_meplat' | 'polymer' | 'hollow_point' | 'flat';
export type BaseType = 'flat' | 'boat_tail' | 'hollow_base' | 'rebated_boat_tail';
export type JacketType = 'fmj' | 'tmj' | 'partial' | 'unjacketed' | 'plated' | 'copper_solid';
/** The materials a drawing colours by: sRGB 0..1, and the hex the SVGs carry. */
export type Material = 'BRASS' | 'COPPER' | 'GILDING_METAL' | 'LEAD' | 'POLYMER_RED';
const MATERIAL_RGB: Record<Material, [number, number, number]> = {
  BRASS: [0.71, 0.651, 0.259],
  COPPER: [0.722, 0.451, 0.2],
  GILDING_METAL: [0.78, 0.52, 0.24],
  LEAD: [0.412, 0.412, 0.412],
  POLYMER_RED: [0.753, 0.224, 0.169]
};
export const MATERIAL_HEX: Record<Material, string> = {
  BRASS: '#b5a642', COPPER: '#b87333', GILDING_METAL: '#c78540', LEAD: '#696969', POLYMER_RED: '#c0392b'
};
type DefaultBulletShape = 'pointy' | 'rounded' | 'flat' | 'shot' | 'wadcutter' | 'semi_wadcutter';

// ---- Defaults ---------------------------------------------------------

const SEATING_DEPTH_CALIBRES: Record<BulletCategory, number> = {
  rifle_spitzer: 1.0, rifle_vld: 1.0, rifle_round_nose: 0.8, rifle_flat_nose: 0.8,
  pistol_round_nose: 0.4, pistol_jhp: 0.4, pistol_fmj_truncated: 0.4, pistol_flat_nose: 0.4,
  pistol_semi_wadcutter: 0.6, pistol_wadcutter: 0.6
};
export const SHANK_FRACTION: Record<BulletCategory, number> = {
  rifle_spitzer: 0.4, rifle_vld: 0.45, rifle_round_nose: 0.55, rifle_flat_nose: 0.6,
  pistol_round_nose: 0.65, pistol_jhp: 0.7, pistol_fmj_truncated: 0.7, pistol_flat_nose: 0.72,
  pistol_semi_wadcutter: 0.78, pistol_wadcutter: 0.92
};
const MEPLAT_FRACTION: Record<BulletCategory, number> = {
  rifle_spitzer: 0.08, rifle_vld: 0.05, rifle_round_nose: 0.15, rifle_flat_nose: 0.55,
  pistol_round_nose: 0.15, pistol_jhp: 0.35, pistol_fmj_truncated: 0.55, pistol_flat_nose: 0.6,
  pistol_semi_wadcutter: 0.6, pistol_wadcutter: 0.95
};
const POINTED = new Set<BulletCategory>(['rifle_spitzer', 'rifle_vld', 'rifle_round_nose', 'pistol_round_nose']);
const OGIVE_TYPE: Record<BulletCategory, OgiveType> = {
  rifle_spitzer: 'tangent', rifle_vld: 'secant', rifle_round_nose: 'elliptical', rifle_flat_nose: 'conical',
  pistol_round_nose: 'elliptical', pistol_jhp: 'tangent', pistol_fmj_truncated: 'conical',
  pistol_flat_nose: 'conical', pistol_semi_wadcutter: 'conical', pistol_wadcutter: 'conical'
};
const TIP_TYPE: Record<BulletCategory, TipType> = {
  rifle_spitzer: 'open_meplat', rifle_vld: 'sharp', rifle_round_nose: 'open_meplat', rifle_flat_nose: 'flat',
  pistol_round_nose: 'open_meplat', pistol_jhp: 'hollow_point', pistol_fmj_truncated: 'flat',
  pistol_flat_nose: 'flat', pistol_semi_wadcutter: 'flat', pistol_wadcutter: 'flat'
};
export const JACKET_THICKNESS_CALIBRES = 0.055;
export const MEPLAT_TOOLING_MM = 1.27;
export const RT_OVER_R: Partial<Record<OgiveType, number>> = { tangent: 1.0, secant: 0.55, hybrid: 0.75 };
export const HOLLOW_POINT_DEPTH_CALIBRES = 0.3;
const CANNELURE_DEPTH_CALIBRES = 0.02;
const CANNELURE_WIDTH_CALIBRES = 0.1;
export const HOLLOW_BASE_DEPTH_CALIBRES = 0.25;
const ENCLOSED_LENGTH_CALIBRES = 1.75;
const MIN_SHANK_CALIBRES = 0.1;
export const BOAT_TAIL_ANGLE_DEG = 8.0;
export const BOAT_TAIL_LENGTH_CALIBRES = 0.77;
const BOAT_TAILED = new Set<BulletCategory>(['rifle_spitzer', 'rifle_vld']);

// Drawing constants.
const HYBRID_TANGENT_FRACTION = 0.45;
const HYBRID_SECANT_FACTOR = 1.5;
const NOSE_SEGMENTS = 32;
const CANNELURE_WIDTH_PER_DEPTH = 5.0;

export interface Bullet {
  category: BulletCategory;
  base: { baseType: BaseType; diameter: number; startZ: number; endZ: number; boatTailAngle: number | null; hollowDepth: number | null };
  cylinder: { diameter: number; startZ: number; endZ: number; cannelureZ: number | null; cannelureDepth: number; heeled: boolean };
  ogive: { ogiveType: OgiveType; radiusCalibres: number; startZ: number; endZ: number; startDiameter: number; endDiameter: number };
  tip: { tipType: TipType; startZ: number; endZ: number; meplatDiameter: number; cavityDepth: number };
  /** Jacket, core and what the outside shows. */
  construction: { jacket: JacketType; jacketMaterial: Material; coreMaterial: Material };
  jacketThickness: number;
  seatingDepth: number;
  baseZ: number;
  tipZ: number;
  length: number;
}

class ImplausibleDimensionError extends Error {}

const isBoatTailed = (base: BaseType): boolean => base === 'boat_tail' || base === 'rebated_boat_tail';

function construction(category: BulletCategory, family: MetallicCase['family']): Bullet['construction'] {
  if (family === 'rimfire') return { jacket: 'plated', jacketMaterial: 'COPPER', coreMaterial: 'LEAD' };
  if (category === 'pistol_wadcutter' || category === 'pistol_semi_wadcutter') {
    return { jacket: 'unjacketed', jacketMaterial: 'LEAD', coreMaterial: 'LEAD' };
  }
  return { jacket: 'fmj', jacketMaterial: 'GILDING_METAL', coreMaterial: 'LEAD' };
}

/** The surface material: the jacket, or the core when bare. */
export function surfaceMaterial(bullet: Bullet): Material {
  return bullet.construction.jacket === 'unjacketed' ? bullet.construction.coreMaterial : bullet.construction.jacketMaterial;
}

function bulletCategory(
  shape: DefaultBulletShape | null | undefined,
  family: MetallicCase['family'],
  consumer: string | null | undefined
): BulletCategory {
  let isHandgun = consumer === 'pistol' || family === 'pistol';
  if (family === 'rimfire') isHandgun = true;
  if (shape === 'semi_wadcutter') return 'pistol_semi_wadcutter';
  if (shape === 'wadcutter') return 'pistol_wadcutter';
  if (shape === 'flat') return isHandgun ? 'pistol_fmj_truncated' : 'rifle_flat_nose';
  if (shape === 'rounded') return isHandgun ? 'pistol_round_nose' : 'rifle_round_nose';
  if (shape === 'pointy') return 'rifle_spitzer';
  return isHandgun ? 'pistol_round_nose' : 'rifle_spitzer';
}

function noseForm(preferred: OgiveType, noseLength: number, radialDrop: number): OgiveType {
  if (preferred === 'tangent' || preferred === 'secant' || preferred === 'hybrid') {
    if (noseLength <= radialDrop) return 'elliptical';
  }
  return preferred;
}

function tangentRadius(shankRadius: number, meplatRadius: number, noseLength: number): number {
  const drop = shankRadius - meplatRadius;
  if (drop <= 0) return shankRadius;
  return (noseLength * noseLength + drop * drop) / (2 * drop);
}

export function arcRadius(ogiveType: OgiveType, diameter: number, meplat: number, noseLength: number): number {
  const tangent = tangentRadius(diameter / 2, meplat / 2, noseLength);
  const ratio = RT_OVER_R[ogiveType];
  if (ratio == null || ratio <= 0) return tangent;
  return tangent / ratio;
}

interface BulletOptions {
  overallLength: number;
  freeBoreEndZ?: number | null;
  shape?: DefaultBulletShape | null;
  category?: BulletCategory | null;
  seatingDepth?: number | null;
}

/** Construct the default bullet used in a cartridge drawing. */
export function defaultBullet(c: MetallicCase, options: BulletOptions): Bullet {
  const category = options.category ?? bulletCategory(options.shape, c.family, c.category);
  const diameter = c.mouth.insideDiameter;
  const mouthZ = c.mouth.z;
  const tipZ = options.overallLength;

  const enclosed = tipZ <= mouthZ;
  let seating: number;
  if (options.seatingDepth != null) seating = options.seatingDepth;
  else if (enclosed) seating = mouthZ - tipZ + ENCLOSED_LENGTH_CALIBRES * diameter;
  else seating = SEATING_DEPTH_CALIBRES[category] * diameter;

  const baseZ = mouthZ - seating;
  const length = tipZ - baseZ;

  let shankEndZ = baseZ + SHANK_FRACTION[category] * length;
  const freeBoreEndZ = options.freeBoreEndZ ?? null;
  if (freeBoreEndZ != null && freeBoreEndZ < shankEndZ) shankEndZ = Math.max(freeBoreEndZ, mouthZ);
  let noseLength = tipZ - shankEndZ;

  let meplat = MEPLAT_FRACTION[category] * diameter;
  if (POINTED.has(category)) meplat = Math.max(meplat, MEPLAT_TOOLING_MM);
  let ogiveType = noseForm(OGIVE_TYPE[category], noseLength, (diameter - meplat) / 2);
  let tipType = TIP_TYPE[category];

  const heelDiameter = c.isHeeled ? c.mouthBoreDiameter : null;
  const isHeeled = heelDiameter != null;
  let baseType: BaseType;
  if (category === 'pistol_wadcutter') baseType = 'hollow_base';
  else if (BOAT_TAILED.has(category) && c.family !== 'pistol' && c.family !== 'rimfire') baseType = 'boat_tail';
  else baseType = 'flat';
  const boatTail = isBoatTailed(baseType) && !isHeeled;
  let baseEndZ: number;
  let baseDiameter: number;
  if (boatTail) {
    const boatTailLength = BOAT_TAIL_LENGTH_CALIBRES * diameter;
    baseEndZ = baseZ + boatTailLength;
    baseDiameter = diameter - 2 * boatTailLength * Math.tan(radians(BOAT_TAIL_ANGLE_DEG));
  } else {
    baseEndZ = isHeeled ? mouthZ : baseZ;
    baseDiameter = heelDiameter ?? diameter;
  }
  if (baseEndZ >= shankEndZ - MIN_SHANK_CALIBRES * diameter) {
    shankEndZ = baseEndZ + MIN_SHANK_CALIBRES * diameter;
    noseLength = tipZ - shankEndZ;
    if (noseLength <= 0) {
      if (tipZ <= baseEndZ) {
        throw new ImplausibleDimensionError(
          `${c.key}: the base segment ends at ${baseEndZ.toFixed(2)} mm, at or past the tip at ${tipZ.toFixed(2)} mm`
        );
      }
      shankEndZ = tipZ;
      noseLength = 0;
      meplat = diameter;
      ogiveType = 'conical';
      tipType = 'flat';
    } else {
      ogiveType = noseForm(OGIVE_TYPE[category], noseLength, (diameter - meplat) / 2);
    }
  }

  let wantsCannelure = c.mouth.crimp === 'roll';
  const grooveHalfWidth = (CANNELURE_WIDTH_CALIBRES * diameter) / 2;
  const fits = baseEndZ + grooveHalfWidth <= mouthZ && mouthZ <= shankEndZ - grooveHalfWidth;
  if (wantsCannelure && !fits) wantsCannelure = false;
  const cannelureZ = wantsCannelure ? mouthZ : null;
  const cannelureDepth = cannelureZ != null ? CANNELURE_DEPTH_CALIBRES * diameter : 0;

  return {
    category,
    base: {
      baseType,
      diameter: baseDiameter,
      startZ: baseZ,
      endZ: baseEndZ,
      boatTailAngle: boatTail ? BOAT_TAIL_ANGLE_DEG : null,
      hollowDepth: baseType === 'hollow_base' ? HOLLOW_BASE_DEPTH_CALIBRES * diameter : null
    },
    cylinder: { diameter, startZ: baseEndZ, endZ: shankEndZ, cannelureZ, cannelureDepth, heeled: isHeeled },
    ogive: {
      ogiveType,
      radiusCalibres: arcRadius(ogiveType, diameter, meplat, noseLength) / diameter,
      startZ: shankEndZ,
      endZ: tipZ,
      startDiameter: diameter,
      endDiameter: meplat
    },
    tip: {
      tipType,
      startZ: tipZ,
      endZ: tipZ,
      meplatDiameter: meplat,
      cavityDepth: tipType === 'hollow_point' ? HOLLOW_POINT_DEPTH_CALIBRES * diameter : 0
    },
    construction: construction(category, c.family),
    jacketThickness: JACKET_THICKNESS_CALIBRES * diameter,
    seatingDepth: seating,
    baseZ,
    tipZ,
    length: tipZ - baseZ
  };
}

/**
 * `interface/build._check_seating`: the seated projectile has to fit the case. The base cannot
 * reach the cavity floor and cannot reach the tip; the tip need not clear the mouth.
 */
export function checkSeating(c: MetallicCase, bullet: Bullet): void {
  const floor = c.cavityFloorZ;
  if (bullet.baseZ <= floor) {
    throw new ImplausibleDimensionError(
      `${c.key}: seating ${bullet.seatingDepth.toFixed(2)} mm puts the bullet base at z=${bullet.baseZ.toFixed(2)}, below the cavity floor at ${floor.toFixed(2)}`
    );
  }
  if (bullet.tipZ <= bullet.baseZ) {
    throw new ImplausibleDimensionError(`${c.key}: the projectile has no length`);
  }
}

// ---- The profile ------------------------------------------------------

function basePoints(bullet: Bullet, points: Profile): void {
  const base = bullet.base;
  const fullRadius = bullet.cylinder.diameter / 2;
  const startRadius = base.diameter / 2;
  lineTo(points, startRadius, base.startZ);
  if (base.endZ > base.startZ + EPSILON) {
    if (base.baseType === 'boat_tail' || base.baseType === 'rebated_boat_tail') lineTo(points, fullRadius, base.endZ);
    else lineTo(points, startRadius, base.endZ);
  }
  if (Math.abs(startRadius - fullRadius) > EPSILON) lineTo(points, fullRadius, base.endZ);
}

function cannelureHalfWidth(bullet: Bullet): number {
  return (bullet.cylinder.cannelureDepth * CANNELURE_WIDTH_PER_DEPTH) / 2;
}

function cylinderPoints(bullet: Bullet, points: Profile): void {
  const cylinder = bullet.cylinder;
  const radius = cylinder.diameter / 2;
  if (cylinder.cannelureZ != null && cylinder.cannelureDepth > 0) {
    const halfWidth = cannelureHalfWidth(bullet);
    const floor = radius - cylinder.cannelureDepth;
    if (floor <= 0) throw new ProfileError(`cannelure depth ${cylinder.cannelureDepth} reaches the axis`);
    lineTo(points, radius, cylinder.cannelureZ - halfWidth);
    lineTo(points, floor, cylinder.cannelureZ - halfWidth / 2);
    lineTo(points, floor, cylinder.cannelureZ + halfWidth / 2);
    lineTo(points, radius, cylinder.cannelureZ + halfWidth);
  }
  lineTo(points, radius, cylinder.endZ);
}

function landOn(points: Profile, radius: number, z: number): void {
  const last = points[points.length - 1];
  if (last && Math.abs(last[0] - radius) < 1e-6 && Math.abs(last[1] - z) < 1e-6) points[points.length - 1] = [radius, z];
  else lineTo(points, radius, z);
}

function sweep(points: Profile, z0: number, length: number, radiusAt: (u: number) => number): void {
  for (let i = 1; i <= NOSE_SEGMENTS; i++) {
    const u = i / NOSE_SEGMENTS;
    lineTo(points, radiusAt(u), z0 + length * u);
  }
}

function secantCentre(r0: number, rm: number, z0: number, length: number, radius: number): [number, number] {
  const z1 = z0 + length;
  const mid: [number, number] = [(r0 + rm) / 2, (z0 + z1) / 2];
  const chord = Math.hypot(rm - r0, length);
  if (radius < chord / 2) throw new ProfileError(`a secant radius of ${radius} mm cannot reach across a ${chord} mm nose chord`);
  const offset = Math.sqrt(radius * radius - (chord / 2) ** 2);
  let nr = -length / chord;
  let nz = (rm - r0) / chord;
  if (nr > 0) {
    nr = -nr;
    nz = -nz;
  }
  return [mid[0] + nr * offset, mid[1] + nz * offset];
}

function arcNose(points: Profile, r0: number, rm: number, z0: number, length: number, radius: number, tangent: boolean): void {
  let centre: [number, number];
  if (tangent) {
    centre = [r0 - radius, z0];
    const needed = r0 - rm;
    if (length <= needed + EPSILON) throw new ProfileError('a tangent ogive cannot span this nose');
  } else {
    centre = secantCentre(r0, rm, z0, length, radius);
  }
  const startAngle = Math.atan2(z0 - centre[1], r0 - centre[0]);
  const endAngle = Math.atan2(z0 + length - centre[1], rm - centre[0]);
  const sweepAngle = endAngle - startAngle;
  for (let i = 1; i <= NOSE_SEGMENTS; i++) {
    const angle = startAngle + sweepAngle * (i / NOSE_SEGMENTS);
    lineTo(points, centre[0] + radius * Math.cos(angle), centre[1] + radius * Math.sin(angle));
  }
}

function tangentRadiusAt(r0: number, z0: number, radius: number, z: number): number {
  const centreR = r0 - radius;
  const dz = z - z0;
  return centreR + Math.sqrt(Math.max(0, radius * radius - dz * dz));
}

function ogivePoints(bullet: Bullet, points: Profile): void {
  const ogive = bullet.ogive;
  const r0 = ogive.startDiameter / 2;
  const rm = ogive.endDiameter / 2;
  const z0 = ogive.startZ;
  const nose = ogive.endZ - ogive.startZ;
  const drop = r0 - rm;

  if (nose <= EPSILON) {
    if (drop <= EPSILON) return;
    throw new ProfileError(`${bullet.category}: the nose has no length but drops ${drop} mm`);
  }
  if (ogive.ogiveType === 'conical' || drop <= EPSILON) {
    lineTo(points, rm, ogive.endZ);
    return;
  }
  if (ogive.ogiveType === 'elliptical') {
    sweep(points, z0, nose, (u) => rm + drop * Math.sqrt(Math.max(0, 1 - u * u)));
    landOn(points, rm, ogive.endZ);
    return;
  }
  if (ogive.ogiveType === 'parabolic') {
    sweep(points, z0, nose, (u) => rm + drop * (1 - u * u));
    landOn(points, rm, ogive.endZ);
    return;
  }
  const radius = ogive.radiusCalibres * ogive.startDiameter;
  if (ogive.ogiveType === 'tangent') {
    arcNose(points, r0, rm, z0, nose, radius, true);
    landOn(points, rm, ogive.endZ);
    return;
  }
  if (ogive.ogiveType === 'secant') {
    arcNose(points, r0, rm, z0, nose, radius, false);
    landOn(points, rm, ogive.endZ);
    return;
  }
  if (ogive.ogiveType === 'hybrid') {
    const breakZ = z0 + nose * HYBRID_TANGENT_FRACTION;
    const breakR = tangentRadiusAt(r0, z0, radius, breakZ);
    arcNose(points, r0, breakR, z0, breakZ - z0, radius, true);
    arcNose(points, breakR, rm, breakZ, ogive.endZ - breakZ, radius * HYBRID_SECANT_FACTOR, false);
    landOn(points, rm, ogive.endZ);
    return;
  }
  throw new ProfileError(`unsupported ogive form ${ogive.ogiveType}`);
}

/** `bullet_outer_profile`: the silhouette from the rear face to the tip, in case coordinates. */
export function bulletOuterProfile(bullet: Bullet): Profile {
  const points: Profile = [];
  basePoints(bullet, points);
  cylinderPoints(bullet, points);
  ogivePoints(bullet, points);
  return points;
}

/**
 * The part of the projectile forward of the mouth, or `null` when
 * none of it is. The crimp groove belongs to the crimp, which the drawings do not show.
 */
export function exposedProfile(bullet: Bullet, mouthZ: number): Profile | null {
  if (bullet.tipZ <= mouthZ + EPSILON) return null;
  let drawn = bullet;
  if (bullet.cylinder.cannelureZ != null) {
    drawn = { ...bullet, cylinder: { ...bullet.cylinder, cannelureZ: null, cannelureDepth: 0 } };
  }
  const exposed = truncateBehind(bulletOuterProfile(drawn), mouthZ);
  return exposed.length >= 2 ? exposed : null;
}

/**
 * The same bullet moved along the axis by `dz` - deeper into the case for a negative `dz`. A
 * drag changes where the bullet sits, not what it is: its length and nose stay, its base, tip and
 * seating depth move together, and the overall length of the round moves with the tip.
 */
export function shiftBullet(bullet: Bullet, dz: number): Bullet {
  const move = <T extends { startZ: number; endZ: number }>(s: T): T => ({ ...s, startZ: s.startZ + dz, endZ: s.endZ + dz });
  return {
    ...bullet,
    base: move(bullet.base),
    cylinder: { ...move(bullet.cylinder), cannelureZ: bullet.cylinder.cannelureZ == null ? null : bullet.cylinder.cannelureZ + dz },
    ogive: move(bullet.ogive),
    tip: move(bullet.tip),
    seatingDepth: bullet.seatingDepth - dz,
    baseZ: bullet.baseZ + dz,
    tipZ: bullet.tipZ + dz
  };
}

/** The hex a material is drawn in. */
export const MATERIAL_HEX_OF = (material: Material): string => MATERIAL_HEX[material];

/**
 * The same material, darkened, for the cut face of a section.
 *
 * Here rather than in the renderer because it is a fact about the material, and a shape that
 * draws its own section needs it without depending on the drawing layer.
 */
export function darken(material: Material): string {
  const [r, g, b] = MATERIAL_RGB[material];
  const hex = (v: number) => Math.trunc(v * 255 * 0.55).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
