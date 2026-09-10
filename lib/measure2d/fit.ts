/** Compare cartridge and chamber dimensions to report fit. */

import type { Bullet } from '../shapes2d/bullet';
import type { Chamber } from '../shapes2d/chamber';
import { leadeRun } from '../shapes2d/chamber';
import { radiusAt } from './interior';
import { EPSILON, type Profile } from '../geom/profile';

export type Region = 'body' | 'junction_cone' | 'neck' | 'free_bore' | 'bore';

interface Clearance {
  z: number;
  region: Region;
  chamberRadius: number;
  cartridgeRadius: number;
  /** Radial gap in mm; negative is interference. */
  gap: number;
}

function radiusOrNull(profile: Profile, z: number): number | null {
  let low = Infinity, high = -Infinity;
  for (const [, pz] of profile) {
    if (pz < low) low = pz;
    if (pz > high) high = pz;
  }
  if (!(low - 1e-9 <= z && z <= high + 1e-9)) return null;
  return radiusAt(profile, z);
}

/** The outside of the loaded round: the case, and the bullet standing out of it; the wider wins. */
export function loadedSilhouette(caseProfile: Profile, bulletProfile: Profile): Profile {
  const zs = [...new Set([...caseProfile.map(([, z]) => z), ...bulletProfile.map(([, z]) => z)])].sort((a, b) => a - b);
  const merged: Profile = [];
  for (const z of zs) {
    const radii = [radiusOrNull(caseProfile, z), radiusOrNull(bulletProfile, z)].filter((r): r is number => r !== null);
    if (radii.length) merged.push([Math.max(...radii), z]);
  }
  return merged;
}

function regionOf(chamber: Chamber, z: number): Region {
  const coneFrom = chamber.bodyEndZ - (chamber.neckStartZ != null ? chamber.coneFilletBody : 0);
  if (z <= coneFrom) return 'body';
  if (chamber.neckStartZ != null && z < chamber.neckStartZ) return 'junction_cone';
  if (z <= chamber.mouthZ) return 'neck';
  if (z <= chamber.freeBoreEndZ) return 'free_bore';
  return 'bore';
}

/** The gap between the round and its chamber at every station either one defines. */
export function clearances(bore: Profile, roundProfile: Profile, chamber: Chamber): Clearance[] {
  const zs = [...new Set([...bore.map(([, z]) => z), ...roundProfile.map(([, z]) => z)])].sort((a, b) => a - b);
  const out: Clearance[] = [];
  for (const z of zs) {
    const chamberRadius = radiusOrNull(bore, z);
    const cartridgeRadius = radiusOrNull(roundProfile, z);
    if (chamberRadius === null || cartridgeRadius === null) continue;
    out.push({ z, region: regionOf(chamber, z), chamberRadius, cartridgeRadius, gap: chamberRadius - cartridgeRadius });
  }
  return out;
}

export function tightest(measured: Clearance[], region: Region): Clearance | null {
  const here = measured.filter((c) => c.region === region);
  if (!here.length) return null;
  return here.reduce((best, c) => (c.gap < best.gap ? c : best));
}

/** How far the bearing surface reaches past the free bore, mm; positive is into the rifling. */
export function bearingOverrun(bullet: Bullet, chamber: Chamber): number | null {
  if (!chamber.throat) return null;
  return bullet.cylinder.endZ - chamber.freeBoreEndZ;
}

interface Jump {
  /** Axial travel before the ogive touches the leade, mm; negative means it is already in it. */
  jump: number;
  /** Radius at which the two first meet. */
  contactRadius: number;
  /** Where on the bullet, and where on the chamber, that radius sits. */
  bulletZ: number;
  chamberZ: number;
}

/**
 * The bullet's jump to the lands: how far the round moves forward before its ogive meets the
 * leade cone. Both surfaces are monotonic in radius there - the ogive narrows toward the tip, the
 * leade narrows toward the bore - so for every radius between the bore's lands and the throat
 * there is one axial position on each, and the jump is the least difference between them. Nothing
 * is said about the chamber's real throat, only about the published minimum; the page calls it an
 * estimate. `null` where the chamber publishes no throat or the bullet never reaches bore diameter.
 */
export function jumpToLands(bullet: Bullet, bulletProfile: Profile, chamber: Chamber): Jump | null {
  const throat = chamber.throat;
  if (!throat) return null;
  const landR = throat.landDiameter / 2;
  const throatR = throat.diameter / 2;
  const leadeStartZ = chamber.freeBoreEndZ;
  const leadeEndZ = leadeStartZ + leadeRun(chamber);
  const shankR = bullet.cylinder.diameter / 2;
  const tipR = bullet.ogive.endDiameter / 2;
  if (shankR <= landR) return null;
  // Radii the two can share: from the lands up to the narrower of the throat and the shank.
  const rLow = Math.max(landR, tipR);
  const rHigh = Math.min(throatR, shankR);
  if (rHigh <= rLow) {
    // A shank narrower than the lands' start or wider than the throat: contact is at the leade's
    // start or end, whichever the shank meets.
    const r = Math.min(Math.max(shankR, landR), throatR);
    const bulletZ = zAtRadiusOnNose(bulletProfile, bullet, r);
    const chamberZ = leadeZAt(r, landR, throatR, leadeStartZ, leadeEndZ);
    return { jump: chamberZ - bulletZ, contactRadius: r, bulletZ, chamberZ };
  }
  let best: Jump | null = null;
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const r = rLow + ((rHigh - rLow) * i) / steps;
    const bulletZ = zAtRadiusOnNose(bulletProfile, bullet, r);
    const chamberZ = leadeZAt(r, landR, throatR, leadeStartZ, leadeEndZ);
    const jump = chamberZ - bulletZ;
    if (!best || jump < best.jump) best = { jump, contactRadius: r, bulletZ, chamberZ };
  }
  return best;
}

/** Where the leade cone has radius `r`: linear between the throat at its start and the lands at its end. */
function leadeZAt(r: number, landR: number, throatR: number, startZ: number, endZ: number): number {
  if (throatR - landR < EPSILON) return endZ;
  const t = (throatR - r) / (throatR - landR);
  return startZ + (endZ - startZ) * Math.min(1, Math.max(0, t));
}

/** The axial position on the nose where the bullet's radius falls to `r`. */
function zAtRadiusOnNose(profile: Profile, bullet: Bullet, r: number): number {
  const from = bullet.ogive.startZ;
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, z0] = profile[i]!, [r1, z1] = profile[i + 1]!;
    if (z1 < from - EPSILON) continue;
    if ((r0 >= r && r1 <= r) || (r0 <= r && r1 >= r)) {
      if (Math.abs(r1 - r0) < EPSILON) return z1;
      return z0 + ((z1 - z0) * (r0 - r)) / (r0 - r1);
    }
  }
  return bullet.tipZ;
}
