/**
 * GEE - die günstigste Einschießentfernung - and the point-blank band it comes from.
 *
 * The question a hunter actually asks is not "how much do I dial at 240 m", it is "where do I zero
 * so that out to as far as possible I can hold dead on". The answer is a band: pick a tolerance,
 * find the zero whose trajectory never leaves that band, and the far edge of the band is the
 * useful number. In German-speaking practice the tolerance is **±4 cm** and the far edge is the
 * *GEE*; English-language sources call the same construction the maximum point-blank range.
 *
 * **The construction, precisely.** The bullet starts a sight height below the line of sight,
 * crosses it going up, reaches a highest point, and comes back down through it. Raise the zero
 * distance and the highest point rises with it. The optimum zero is the one where **the highest
 * point touches +tolerance exactly** - any higher and the bullet leaves the band early, any lower
 * and the band ends sooner than it needed to. The GEE is then where the falling trajectory reaches
 * -tolerance.
 *
 * **The bullet is flown once.** Searching for that zero looks like it needs a flight per candidate,
 * and the obvious implementation costs about two dozen of them. It does not need any: raising the
 * zero only tilts the launch, and tilting the launch adds a *straight line* to the trajectory --
 * `height(x) + x·k`. Everything after the single flight is arithmetic over a sampled array. The
 * approximation is that drag does not notice the change in launch angle, which over the fraction of
 * a degree a rifle uses is worth **under 2 µm at 400 m**; `pointBlank.test.ts` measures it against
 * a full re-solve rather than asserting it. The saving is real - 17 ms to under 1 - and it is the
 * difference between a figure that appears as the tolerance is typed and one that lags behind.
 *
 * Two things this deliberately does not do:
 *
 * - It does not pick the tolerance. ±4 cm is a convention for deer-sized game with a rifle, not a
 *   law of nature, and a different quarry or a different standard of care is a different number.
 *   It is a parameter with a documented default, not a constant.
 * - It does not treat the result as a licence. The band says where the *trajectory* stays within
 *   4 cm of the aim. It says nothing about whether the shooter, the rifle or the conditions do.
 */

import { SolverRefusal, solve, TRANSONIC_MACH, type Shot } from './trajectory';

/** The tolerance German hunting practice uses: ±4 cm around the line of sight. */
export const GEE_TOLERANCE_M = 0.04;

export interface PointBlank {
  /** The zero distance to sight in at, metres. */
  readonly zeroDistanceM: number;
  /** The GEE: the far edge of the band, where the bullet falls `tolerance` below the aim. */
  readonly farDistanceM: number;
  /**
   * Where the rising bullet first enters the band, metres. Short of this it is still low.
   *
   * Zero when the sight sits within the tolerance of the bore - iron sights, a very low mount --
   * because then the bullet never was below the band.
   */
  readonly nearDistanceM: number;
  /** Where the trajectory is highest, and by how much - the tolerance, by construction. */
  readonly apexM: number;
  readonly apexHeightM: number;
  /**
   * How high the bullet strikes at 100 m with this zero, metres above the aim.
   *
   * The number a hunter can actually use at the range: sighting in is done on paper at 100 m, not
   * at some computed odd zero distance. This is what to set the group to.
   */
  readonly heightAt100M: number;
  /** The tolerance the band was built from, echoed so no result travels without it. */
  readonly toleranceM: number;
  /** True when the far edge lies below Mach 1.2, where the drag model is least trustworthy. */
  readonly transonic: boolean;
}

interface Sample {
  readonly rangeM: number;
  /** Above the line of sight is positive; the solver reports drop, which is the opposite. */
  readonly heightM: number;
  readonly mach: number;
}

const STEP_M = 2;

/** Fly once, as far as the load will go, and read heights above the line of sight. */
function flyOnce(shot: Shot, limitM: number): { samples: Sample[]; tanLaunch: number } {
  let limit = limitM;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const ranges: number[] = [];
    for (let r = STEP_M; r <= limit + 1e-9; r += STEP_M) ranges.push(r);
    if (!ranges.length) break;
    try {
      const solved = solve(shot, ranges);
      return {
        samples: solved.points.map((p) => ({
          rangeM: p.rangeM,
          heightM: -p.dropM,
          mach: p.mach
        })),
        tanLaunch: Math.tan(solved.launchAngleRad)
      };
    } catch (error) {
      if (!(error instanceof SolverRefusal)) throw error;
      limit *= 0.75;
    }
  }
  throw new SolverRefusal('this load does not fly far enough to have a point-blank band');
}

/** Linear crossing of a level between two heights. */
function crossing(x0: number, h0: number, x1: number, h1: number, level: number): number {
  const span = h1 - h0;
  if (span === 0) return x0;
  return x0 + ((level - h0) * (x1 - x0)) / span;
}

/**
 * The most favourable zero, and the band it buys.
 *
 * One flight, then a bisection on the tilt `k` that the launch angle adds. `k` is monotone in the
 * apex height, so twenty-odd halvings settle it far below the precision anything is shown to.
 */
export function pointBlankZero(shot: Shot, toleranceM = GEE_TOLERANCE_M): PointBlank {
  if (!(toleranceM > 0)) throw new SolverRefusal('a point-blank band needs a positive tolerance');

  // Far enough to contain the far edge of any band worth having, and shrunk automatically if the
  // load will not fly it.
  const { samples, tanLaunch } = flyOnce(shot, 900);
  const height = (i: number, k: number) => samples[i]!.heightM + samples[i]!.rangeM * k;

  const apexOf = (k: number) => {
    let best = 0;
    for (let i = 1; i < samples.length; i += 1) if (height(i, k) > height(best, k)) best = i;
    return best;
  };

  // Bisect the tilt. The upper bound is a launch angle no sporting rifle would use; if the apex
  // has not reached the tolerance by then, this load has no band.
  let low = -tanLaunch; // a bore laid exactly along the line of sight
  let high = 0.03;
  if (height(apexOf(high), high) < toleranceM) {
    throw new SolverRefusal(
      'this load never rises a tolerance above the line of sight within a sensible zero: it has no point-blank band'
    );
  }
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    if (height(apexOf(mid), mid) < toleranceM) low = mid;
    else high = mid;
  }
  const k = (low + high) / 2;
  const apex = apexOf(k);

  const at = (i: number) => height(i, k);

  // The zero: where the falling trajectory comes back through the line of sight.
  let zeroDistanceM: number | undefined;
  let farDistanceM: number | undefined;
  let farMach = samples[samples.length - 1]!.mach;
  for (let i = apex + 1; i < samples.length; i += 1) {
    const x0 = samples[i - 1]!.rangeM;
    const x1 = samples[i]!.rangeM;
    if (zeroDistanceM === undefined && at(i - 1) >= 0 && at(i) < 0) {
      zeroDistanceM = crossing(x0, at(i - 1), x1, at(i), 0);
    }
    if (at(i - 1) >= -toleranceM && at(i) < -toleranceM) {
      farDistanceM = crossing(x0, at(i - 1), x1, at(i), -toleranceM);
      farMach = samples[i]!.mach;
      break;
    }
  }
  if (zeroDistanceM === undefined || farDistanceM === undefined) {
    throw new SolverRefusal('the far edge of the band is beyond where this load still flies');
  }

  // Where the rising bullet first enters the band. With iron sights or a very low mount the sight
  // can sit inside the tolerance of the bore, in which case the bullet never was below the band
  // and the near edge is the muzzle - an answer, not a special case.
  let nearDistanceM = shot.sightHeightM <= toleranceM ? 0 : samples[0]!.rangeM;
  for (let i = 1; i <= apex; i += 1) {
    if (at(i - 1) < -toleranceM && at(i) >= -toleranceM) {
      nearDistanceM = crossing(samples[i - 1]!.rangeM, at(i - 1), samples[i]!.rangeM, at(i), -toleranceM);
      break;
    }
  }

  // The strike at 100 m, read off the same shifted curve rather than solved again.
  let heightAt100M = at(0);
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i]!.rangeM >= 100) {
      const x0 = samples[i - 1]!.rangeM;
      const x1 = samples[i]!.rangeM;
      heightAt100M = at(i - 1) + ((at(i) - at(i - 1)) * (100 - x0)) / (x1 - x0);
      break;
    }
  }

  return {
    zeroDistanceM,
    farDistanceM,
    nearDistanceM,
    apexM: samples[apex]!.rangeM,
    apexHeightM: at(apex),
    heightAt100M,
    toleranceM,
    transonic: farMach < TRANSONIC_MACH
  };
}
