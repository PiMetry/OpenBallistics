/**
 * The reticle, and the arithmetic that makes a second-focal-plane one honest.
 *
 * A first-focal-plane reticle's
 * subtensions hold at every magnification, because the reticle grows with the image. A
 * second-focal-plane reticle's hold only at the magnification it was calibrated at; at any other
 * power every hold and every ranging made with it is wrong, silently, by the ratio of the two
 * magnifications. So an SFP record without a rated magnification is refused rather than used with
 * a guess.
 *
 * The marks themselves are 2D vector geometry - the same thing `lib/render2d` already draws --
 * so a reticle can be rendered, printed at true scale and have a trajectory laid over it. That
 * part is the designer's; what is here is only the part that must not be got wrong.
 *
 * ⚠️ Reticle *patterns* are commonly trademarked and some are patented. This module models a
 * reticle so a user can record their own scope's subtensions for their own use; named commercial
 * patterns do not become dataset records. Same reasoning as everywhere else in this project.
 */

import { fromAngularUnit, type AngularUnit } from './angles';

export type FocalPlane = 'FFP' | 'SFP';

export interface Reticle {
  readonly id: string;
  readonly name: string;
  readonly focalPlane: FocalPlane;
  /** Required for SFP, meaningless for FFP. */
  readonly ratedMagnification?: number;
  /** Subtensions are in this unit and no other. */
  readonly unit: AngularUnit;
}

export class ReticleRefusal extends Error {}

/**
 * The subtension a mark *actually* covers at the magnification in use.
 *
 * FFP: the nominal value, at every power. SFP: the nominal value scaled by
 * `ratedMagnification / currentMagnification` - read a mil-marked SFP reticle at half its rated
 * power and each mark covers two mils.
 */
export function observedSubtension(
  reticle: Reticle,
  nominal: number,
  currentMagnification?: number
): number {
  if (reticle.focalPlane === 'FFP') return nominal;
  const rated = reticle.ratedMagnification;
  if (!(rated && rated > 0)) {
    throw new ReticleRefusal(
      `${reticle.name} is second focal plane but has no rated magnification: its subtensions cannot be used`
    );
  }
  if (!(currentMagnification && currentMagnification > 0)) {
    throw new ReticleRefusal(
      `${reticle.name} is second focal plane: its subtensions are only correct at ${rated}x, so the magnification in use is required`
    );
  }
  return (nominal * rated) / currentMagnification;
}

/**
 * Range from a reticle reading: the stadiametric formula, in whichever unit the reticle is marked.
 *
 *     metric, mils:  range = size x 1000 / mils
 *     MOA:           range = size / tan(reading · 1 MOA)
 *
 * The mil form is the small-angle approximation everybody uses and it is written here as the
 * division it is; both go through the same exact `angleSubtended` inverse so they cannot disagree.
 *
 * The error in this is the reading, not the arithmetic: a 10 % misread of the reticle is a 10 %
 * error in the range, which at 800 m is 80 m. Callers should show that rather than a bare number.
 */
export function rangeFromReticle(
  targetSize: number,
  reading: number,
  reticle: Reticle,
  currentMagnification?: number
): number {
  if (!(reading > 0)) throw new ReticleRefusal('a reticle reading must be greater than zero');
  if (!(targetSize > 0)) throw new ReticleRefusal('a target size must be greater than zero');
  // An SFP reticle read at the wrong power reads a different angle than its marks claim, and the
  // ranging error is the full ratio of the magnifications. Hence the same correction as a hold.
  const trueReading = observedSubtension(reticle, reading, currentMagnification);
  return targetSize / Math.tan(fromAngularUnit(trueReading, reticle.unit));
}
