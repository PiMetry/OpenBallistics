/** Profile primitives for lines, arcs and rounded outlines. */

export type Point = [number, number];
export type Profile = Point[];

/** Polyline segments per arc; the chord error at 16 over 90 degrees is 0.2 % of the radius. */
export const ARC_SEGMENTS = 16;

/** Points closer than this in both r and z are the same point. */
export const EPSILON = 1e-9;

export class ProfileError extends Error {}

function same(a: Point, b: Point): boolean {
  return Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;
}

/** Append a point, skipping it if it repeats the current position. */
export function lineTo(profile: Profile, r: number, z: number): void {
  const last = profile[profile.length - 1];
  if (last && same(last, [r, z])) return;
  profile.push([r, z]);
}

/**
 * Append a circular arc, in radians, taking the short way round. The start point is assumed
 * already present, so only the interior and end points are emitted.
 */
export function arcTo(
  profile: Profile,
  centreR: number,
  centreZ: number,
  radius: number,
  angleStart: number,
  angleEnd: number,
  segments = ARC_SEGMENTS
): void {
  let sweep = angleEnd - angleStart;
  if (sweep > Math.PI) sweep -= 2 * Math.PI;
  else if (sweep < -Math.PI) sweep += 2 * Math.PI;
  for (let i = 1; i <= segments; i++) {
    const angle = angleStart + sweep * (i / segments);
    lineTo(profile, centreR + radius * Math.cos(angle), centreZ + radius * Math.sin(angle));
  }
}

/**
 * Replace a corner with a tangent arc of the given radius: the points from the tangent point on
 * the incoming leg to the one on the outgoing leg, inclusive. `[corner]` unchanged when the radius
 * is zero, the legs are collinear, or the radius does not fit on either leg.
 */
function filletCorner(
  corner: Point,
  previous: Point,
  following: Point,
  radius: number,
  segments = ARC_SEGMENTS
): Profile {
  if (radius <= 0) return [corner];
  const [cr, cz] = corner;
  const vIn: Point = [previous[0] - cr, previous[1] - cz];
  const vOut: Point = [following[0] - cr, following[1] - cz];
  const lenIn = Math.hypot(vIn[0], vIn[1]);
  const lenOut = Math.hypot(vOut[0], vOut[1]);
  if (lenIn < EPSILON || lenOut < EPSILON) return [corner];
  const uIn: Point = [vIn[0] / lenIn, vIn[1] / lenIn];
  const uOut: Point = [vOut[0] / lenOut, vOut[1] / lenOut];
  const cosBetween = Math.max(-1, Math.min(1, uIn[0] * uOut[0] + uIn[1] * uOut[1]));
  const angleBetween = Math.acos(cosBetween);
  if (angleBetween < 1e-6 || Math.abs(angleBetween - Math.PI) < 1e-6) return [corner];
  const tangentDistance = radius / Math.tan(angleBetween / 2);
  if (tangentDistance > lenIn - EPSILON || tangentDistance > lenOut - EPSILON) return [corner];
  const start: Point = [cr + uIn[0] * tangentDistance, cz + uIn[1] * tangentDistance];
  const end: Point = [cr + uOut[0] * tangentDistance, cz + uOut[1] * tangentDistance];
  const bisector: Point = [uIn[0] + uOut[0], uIn[1] + uOut[1]];
  const bisectorLength = Math.hypot(bisector[0], bisector[1]);
  if (bisectorLength < EPSILON) return [corner];
  const centreDistance = radius / Math.sin(angleBetween / 2);
  const centre: Point = [
    cr + (bisector[0] / bisectorLength) * centreDistance,
    cz + (bisector[1] / bisectorLength) * centreDistance
  ];
  const angleStart = Math.atan2(start[1] - centre[1], start[0] - centre[0]);
  const angleEnd = Math.atan2(end[1] - centre[1], end[0] - centre[0]);
  const points: Profile = [start];
  arcTo(points, centre[0], centre[1], radius, angleStart, angleEnd, segments);
  return points;
}

/** A copy of the profile with the corner at `index` rounded. */
export function applyFillet(profile: Profile, index: number, radius: number): Profile {
  if (radius <= 0 || index <= 0 || index >= profile.length - 1) return [...profile];
  const rounded = filletCorner(profile[index]!, profile[index - 1]!, profile[index + 1]!, radius);
  return [...profile.slice(0, index), ...rounded, ...profile.slice(index + 1)];
}

/** Clip a monotonic profile at `z`, interpolating the point where it crosses. */
export function truncateForward(profile: Profile, z: number): Profile {
  const clipped: Profile = [];
  for (let index = 0; index < profile.length; index++) {
    const [r, pointZ] = profile[index]!;
    if (pointZ <= z + EPSILON) {
      clipped.push([r, pointZ]);
      continue;
    }
    if (index === 0) break;
    const [previousR, previousZ] = profile[index - 1]!;
    const span = pointZ - previousZ;
    if (span > EPSILON) {
      const fraction = (z - previousZ) / span;
      clipped.push([previousR + (r - previousR) * fraction, z]);
    }
    break;
  }
  if (clipped.length < 2) throw new ProfileError(`nothing of the profile lies behind z=${z}`);
  return clipped;
}

/** Clip a monotonic profile to the part at or forward of `z`, interpolating the crossing. */
export function truncateBehind(profile: Profile, z: number): Profile {
  const clipped: Profile = [];
  for (let index = 0; index < profile.length; index++) {
    const [r, pointZ] = profile[index]!;
    if (pointZ >= z - EPSILON) {
      const crosses =
        clipped.length === 0 &&
        index > 0 &&
        profile[index - 1]![1] < z - EPSILON &&
        pointZ > z + EPSILON;
      if (crosses) {
        const [previousR, previousZ] = profile[index - 1]!;
        const span = pointZ - previousZ;
        if (span > EPSILON) {
          const fraction = (z - previousZ) / span;
          clipped.push([previousR + (r - previousR) * fraction, z]);
        }
      }
      clipped.push([r, pointZ]);
    }
  }
  if (clipped.length < 2) throw new ProfileError(`nothing of the profile lies forward of z=${z}`);
  return clipped;
}

/** Decimal degrees from either notation CIP publishes; `null` stays `null`. */
export type Angle = number | { degrees?: number | null; minutes?: number | null; seconds?: number | null };

export function toDegrees(value: Angle | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  return (value.degrees ?? 0) + (value.minutes ?? 0) / 60 + (value.seconds ?? 0) / 3600;
}

export const radians = (degrees: number): number => (degrees * Math.PI) / 180;
