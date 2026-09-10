/**
 * Scoring a group against the face it was actually shot on, and describing it honestly.
 *
 * Two separate things live here, and the second is the one worth having.
 *
 * **Scoring** is a convention, not arithmetic, and the convention is the part people get wrong.
 * A shot scores the higher ring if the *hole* touches the line - not if its centre does. So the
 * calibre matters: the same centre scores differently for a 4.5 mm pellet and a 7.62 mm bullet,
 * which is why `scoreShot` will not accept a group without being told what shot it.
 *
 * **Describing a group** is where most tools mislead. Extreme spread - the widest pair - is what
 * everyone quotes and is a poor estimator: it uses two shots and throws the rest away, and it grows
 * with shot count, so a five-shot group and a ten-shot group of the same rifle are not comparable
 * numbers. **Mean radius** uses every shot, is stable, and is rarely offered anywhere. Both are
 * returned, with the shot count beside them, because a spread without its count is not a
 * measurement.
 */

import { outerDiameterMm, ringsInward, type TargetFace } from './types';

export interface Shot {
  /** Millimetres right of the centre of the face. */
  readonly xMm: number;
  /** Millimetres above it. */
  readonly yMm: number;
}

export interface ScoredShot extends Shot {
  /** 0 for a miss. */
  readonly score: number;
  /** Distance of the shot's centre from the middle of the face. */
  readonly radiusMm: number;
  /** True when the shot also counts as an inner ten, where the face defines one by diameter. */
  readonly innerTen: boolean;
}

/**
 * Score one shot.
 *
 * `calibreMm` is the bullet's diameter, and it is required: the touching-the-line rule means a
 * score cannot be computed without it, and defaulting it would quietly invent a result.
 */
export function scoreShot(face: TargetFace, shot: Shot, calibreMm: number): ScoredShot {
  if (!(calibreMm > 0)) {
    throw new Error('scoring needs the calibre: a shot scores the ring its hole touches, not its centre');
  }
  const radiusMm = Math.hypot(shot.xMm, shot.yMm);
  // The edge of the hole nearest the middle is what reaches into a ring.
  const reach = face.scoringMethod === 'centre' ? radiusMm : radiusMm - calibreMm / 2;
  let score = 0;
  for (const ring of ringsInward(face)) {
    if (reach <= ring.diameterMm / 2) {
      score = ring.score;
      break;
    }
  }
  const innerTen =
    face.innerTenMm !== undefined && score === 10 && reach <= face.innerTenMm / 2;
  return { ...shot, score, radiusMm, innerTen };
}

export interface GroupStats {
  readonly shots: readonly ScoredShot[];
  readonly total: number;
  readonly innerTens: number;
  readonly misses: number;
  /** The widest centre-to-centre distance in the group, millimetres. */
  readonly extremeSpreadMm: number;
  /** The mean distance of the shots from the group's own centre. The better estimator. */
  readonly meanRadiusMm: number;
  /** Where the group actually sits, relative to the middle of the face. */
  readonly centreMm: { readonly xMm: number; readonly yMm: number };
  /** How many shots the numbers above are built from. Never omitted from a report. */
  readonly count: number;
}

/**
 * Score a group and describe it.
 *
 * The spread and the mean radius are measured about the **group's own centre**, not the middle of
 * the face: they describe how well the rifle shoots, and where the group sits is a separate fact
 * that `centreMm` carries. Conflating the two turns a sighting error into a precision problem.
 */
export function scoreGroup(
  face: TargetFace,
  shots: readonly Shot[],
  calibreMm: number
): GroupStats {
  const scored = shots.map((shot) => scoreShot(face, shot, calibreMm));
  const count = scored.length;
  if (count === 0) {
    return {
      shots: [],
      total: 0,
      innerTens: 0,
      misses: 0,
      extremeSpreadMm: 0,
      meanRadiusMm: 0,
      centreMm: { xMm: 0, yMm: 0 },
      count: 0
    };
  }

  const centreX = scored.reduce((sum, s) => sum + s.xMm, 0) / count;
  const centreY = scored.reduce((sum, s) => sum + s.yMm, 0) / count;

  let extremeSpreadMm = 0;
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const a = scored[i]!;
      const b = scored[j]!;
      const d = Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm);
      if (d > extremeSpreadMm) extremeSpreadMm = d;
    }
  }

  const meanRadiusMm =
    scored.reduce((sum, s) => sum + Math.hypot(s.xMm - centreX, s.yMm - centreY), 0) / count;

  return {
    shots: scored,
    total: scored.reduce((sum, s) => sum + s.score, 0),
    innerTens: scored.filter((s) => s.innerTen).length,
    misses: scored.filter((s) => s.score === 0).length,
    extremeSpreadMm,
    meanRadiusMm,
    centreMm: { xMm: centreX, yMm: centreY },
    count
  };
}

/** A group's size as an angle at the distance it was shot, radians. */
export function groupAngle(sizeMm: number, distanceM: number): number {
  if (!(distanceM > 0)) throw new Error('a group angle needs the distance it was shot at');
  return Math.atan(sizeMm / 1000 / distanceM);
}

/**
 * Whether a shot lands on the paper at all, which is not the same as scoring.
 *
 * `undefined` when the face's rulebook does not give a card size: that is "cannot say", and it is
 * a different answer from "no". Returning `false` there would report a shot as off the paper on
 * the strength of a figure nobody published.
 */
export function onCard(face: TargetFace, shot: Shot): boolean | undefined {
  if (!face.cardMm) return undefined;
  return (
    Math.abs(shot.xMm) <= face.cardMm.width / 2 && Math.abs(shot.yMm) <= face.cardMm.height / 2
  );
}

/** The scoring area's radius, for a drawing that has to fit it. */
export function scoringRadiusMm(face: TargetFace): number {
  return outerDiameterMm(face) / 2;
}
