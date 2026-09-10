/** Calculate the internal case profile and powder-space volume. */

import type { Bullet } from '../shapes2d/bullet';
import { BODY_WALL_MAX_FRACTION, FLOOR_FILLET_FRACTION, WEB_TAPER_CALIBRES, WEB_TAPER_FACTOR, type MetallicCase } from '../shapes2d/case';
import { applyFillet, EPSILON, lineTo, ProfileError, type Profile } from '../geom/profile';

function lerp(z0: number, v0: number, z1: number, v1: number, z: number): number {
  if (Math.abs(z1 - z0) < EPSILON) return v1;
  if (z === z0) return v0;
  if (z === z1) return v1;
  return v0 + ((v1 - v0) * (z - z0)) / (z1 - z0);
}

function boreOuterRadius(c: MetallicCase, z: number): number {
  const body = c.body;
  if (z <= body.startZ) return body.radiusBase;
  if (z <= body.endZ) {
    if (body.midZ != null && body.diameterMid != null) {
      if (z <= body.midZ) return lerp(body.startZ, body.radiusBase, body.midZ, body.diameterMid / 2, z);
      return lerp(body.midZ, body.diameterMid / 2, body.endZ, body.radiusForward, z);
    }
    return lerp(body.startZ, body.radiusBase, body.endZ, body.radiusForward, z);
  }
  const { shoulder, neck } = c;
  if (shoulder && neck) {
    const neckStartRadius = neck.diameterShoulderEnd / 2;
    if (z <= shoulder.endZ) return lerp(shoulder.startZ, body.radiusForward, shoulder.endZ, neckStartRadius, z);
    return lerp(neck.startZ, neckStartRadius, neck.endZ, neck.radiusMouth, z);
  }
  if (neck) return lerp(neck.startZ, neck.diameterShoulderEnd / 2, neck.endZ, neck.radiusMouth, z);
  if (shoulder) return lerp(shoulder.startZ, body.radiusForward, shoulder.endZ, c.mouth.outsideDiameter / 2, z);
  return body.radiusForward;
}

/** How far above the cavity floor the wall is still thickening toward the web, in mm. */
function webTaperLength(c: MetallicCase, floorZ: number): number {
  return Math.min(WEB_TAPER_CALIBRES * c.body.diameterBase, c.mouth.z - floorZ);
}

/** `_web_taper`: the full extra at the floor, nothing at the taper's end, linear between. */
function webTaper(c: MetallicCase, z: number): number {
  const floorZ = c.cavityFloorZ;
  const length = webTaperLength(c, floorZ);
  if (z < floorZ || z >= floorZ + length || length < EPSILON) return 0;
  const bodyWall = c.body.wallThickness;
  const extra = Math.min(bodyWall * (WEB_TAPER_FACTOR - 1), Math.max(0, c.body.radiusBase * BODY_WALL_MAX_FRACTION - bodyWall));
  return extra * (1 - (z - floorZ) / length);
}

/** `_wall`: the wall between the components, and the web taper over it. */
function wall(c: MetallicCase, z: number): number {
  return wallBetweenComponents(c, z) + webTaper(c, z);
}

function wallBetweenComponents(c: MetallicCase, z: number): number {
  const bodyWall = c.body.wallThickness;
  const mouthWall = c.mouthWallThickness;
  if (c.neck) {
    const neckWall = c.neck.wallThickness;
    if (c.shoulder) {
      if (z <= c.shoulder.startZ) return bodyWall;
      if (z >= c.shoulder.endZ) return neckWall;
      return lerp(c.shoulder.startZ, bodyWall, c.shoulder.endZ, neckWall, z);
    }
    if (z <= c.neck.startZ) return bodyWall;
    return lerp(c.neck.startZ, bodyWall, c.neck.endZ, neckWall, z);
  }
  const floorZ = c.cavityFloorZ;
  if (z <= floorZ) return bodyWall;
  return lerp(floorZ, bodyWall, c.mouth.z, mouthWall, z);
}

/** Interior radius at an axial position, the wall moved by `inset`. */
function innerRadius(c: MetallicCase, z: number, inset = 0): number {
  const radius = boreOuterRadius(c, z) - wall(c, z) - inset;
  if (radius <= 0) throw new ProfileError(`${c.key}: the derived wall closes the powder space at z=${z}`);
  return radius;
}

function breakpoints(c: MetallicCase, floorZ: number): number[] {
  const zs = new Set<number>([floorZ]);
  for (const candidate of [
    floorZ + webTaperLength(c, floorZ), c.body.startZ, c.body.midZ, c.body.endZ, c.shoulder?.endZ ?? null, c.mouth.z
  ]) {
    if (candidate != null && floorZ + EPSILON < candidate && candidate <= c.mouth.z + EPSILON) zs.add(candidate);
  }
  return [...zs].sort((a, b) => a - b);
}

/** `case_inner_profile`: the powder space from the cavity floor to the mouth, monotonic in z. */
export function caseInnerProfile(c: MetallicCase): Profile {
  return profileWithInset(c, publishedInset(c));
}

/** `_profile_with_inset`: the interior with every wall thickened by `inset` (thinned when negative). */
function profileWithInset(c: MetallicCase, inset: number): Profile {
  const floorZ = c.cavityFloorZ;
  if (floorZ >= c.mouth.z) throw new ProfileError(`${c.key}: the web fills the case to its mouth`);
  if (c.groove) {
    const cutEndZ = c.belt ? c.belt.fullDiameterZ : c.groove.endZ;
    if (floorZ < cutEndZ - EPSILON) throw new ProfileError(`${c.key}: the cavity floor lies inside the extractor groove`);
  }
  const points: Profile = [];
  for (const z of breakpoints(c, floorZ)) lineTo(points, innerRadius(c, z, inset), z);
  // The floor's corner, rounded: laid in from the axis for the fillet to stand on, and out again.
  const fillet = FLOOR_FILLET_FRACTION * points[0]![0];
  return applyFillet([[0, floorZ], ...points], 1, fillet).slice(1);
}

/** How far a published capacity may move the wall, as a fraction of the body wall. */
const PUBLISHED_INSET_MAX_FRACTION = 0.35;
/** Bisection steps for the inset; fixed, so this port's answer is the renderer's to the bit. */
const PUBLISHED_INSET_STEPS = 60;

/**
 * `published_inset`: the radial figure the wall is moved by so the interior holds the published
 * capacity; zero where none is collected. Bounded, and solved by bisection on the full profile.
 */
function publishedInset(c: MetallicCase): number {
  const target = c.publishedCapacityMm3;
  if (target == null) return 0;
  const bound = PUBLISHED_INSET_MAX_FRACTION * c.body.wallThickness;
  const volume = (inset: number): number => revolvedVolume(profileWithInset(c, inset));
  let low = -bound, high = bound;
  if (volume(low) <= target) return low;
  if (volume(high) >= target) return high;
  for (let i = 0; i < PUBLISHED_INSET_STEPS; i++) {
    const mid = (low + high) / 2;
    if (volume(mid) > target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** The volume of a half-profile revolved about the axis, as a sum of frusta, in mm^3. */
export function revolvedVolume(profile: Profile): number {
  let total = 0;
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, z0] = profile[i]!, [r1, z1] = profile[i + 1]!;
    total += (Math.PI / 3) * (z1 - z0) * (r0 * r0 + r0 * r1 + r1 * r1);
  }
  return total;
}

/** Radius of a monotonic profile at `z`, interpolated; the nearer end beyond its extent. */
export function radiusAt(profile: Profile, z: number): number {
  if (z <= profile[0]![1]) return profile[0]![0];
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, z0] = profile[i]!, [r1, z1] = profile[i + 1]!;
    if (z <= z1) return lerp(z0, r0, z1, r1, z);
  }
  return profile[profile.length - 1]![0];
}

/** The part of a monotonic profile between two axial positions, with both ends interpolated. */
function between(profile: Profile, z0: number, z1: number): Profile {
  if (z1 <= z0) return [];
  const out: Profile = [[radiusAt(profile, z0), z0]];
  for (const [r, z] of profile) if (z > z0 + EPSILON && z < z1 - EPSILON) lineTo(out, r, z);
  lineTo(out, radiusAt(profile, z1), z1);
  return out;
}

/** One cubic millimetre of water weighs a milligram: grains of water per mm^3. */
export { GRAINS_H2O_PER_MM3 } from '../shapes2d/case';

/**
 * The space a charge has under a seated bullet, in mm^3: the interior from the cavity floor to the
 * mouth, less whatever of the bullet lies inside the case. The bullet's own silhouette is
 * subtracted - a boat tail leaves a ring of space beside itself, a heel is narrower than the
 * bullet - so this is the volume, not a cylinder guessed from the seating depth.
 */
export function usableVolume(inner: Profile, bullet: Bullet | null, bulletProfile: Profile | null, mouthZ: number): number {
  const floorZ = inner[0]![1];
  let volume = revolvedVolume(inner);
  if (bullet && bulletProfile) {
    const from = Math.max(bullet.baseZ, floorZ);
    const to = Math.min(bullet.tipZ, mouthZ);
    if (to > from) volume -= revolvedVolume(between(bulletProfile, from, to));
  }
  return volume;
}

/**
 * Where a settled charge of `volume` mm^3 reaches, poured into the space under the bullet: the z
 * at which the space below it holds exactly that volume. The space is the interior less the bullet,
 * swept from the floor; returns the mouth when the charge overflows even an empty case.
 */
export function fillLevel(inner: Profile, bullet: Bullet | null, bulletProfile: Profile | null, mouthZ: number, volume: number): number {
  const floorZ = inner[0]![1];
  if (volume <= 0) return floorZ;
  // Walk the interior in fine steps; the space is monotonic in z, so a bisection would do, but a
  // sweep is simpler to read and 400 steps of a 60 mm case are well under a tenth of a millimetre.
  const steps = 400;
  let filled = 0;
  let previousZ = floorZ;
  for (let i = 1; i <= steps; i++) {
    const z = floorZ + ((mouthZ - floorZ) * i) / steps;
    let slab = revolvedVolume(between(inner, previousZ, z));
    if (bullet && bulletProfile) {
      const from = Math.max(bullet.baseZ, previousZ);
      const to = Math.min(bullet.tipZ, z);
      if (to > from) slab -= revolvedVolume(between(bulletProfile, from, to));
    }
    if (filled + slab >= volume) {
      const fraction = slab > 0 ? (volume - filled) / slab : 1;
      return previousZ + (z - previousZ) * fraction;
    }
    filled += slab;
    previousZ = z;
  }
  return mouthZ;
}
