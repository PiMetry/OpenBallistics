/**
 * The turret: an angle the user can actually dial.
 *
 * A turret moves in whole clicks, so the answer is a whole number of clicks and the remaining
 * angular correction.
 * The residual is not a footnote: at 1000 m a quarter-MOA click is about 7 cm, and whether the
 * rounding went up or down is the difference between the top and the bottom of a target.
 *
 * The other thing this file exists for is the mismatch check. A rifle set up with a mil reticle
 * and MOA turrets is a real and common configuration, and it is fine as long as the shooter knows
 * - what is not fine is a hold read off the reticle in mils and dialled as if it were MOA. The
 * app is expected to say so loudly, so `unitsMatch` is here rather than in a component.
 */

import { fromAngularUnit, subtension, toAngularUnit, type AngularUnit } from './angles';

export interface Turret {
  readonly unit: AngularUnit;
  /** One click, in that unit: 0.25 or 0.125 for MOA, 0.1 for mrad. */
  readonly clickValue: number;
}

export interface Dial {
  /** Whole clicks, signed: positive is up (or right). */
  readonly clicks: number;
  /** The angle those clicks actually give, radians. */
  readonly dialledRad: number;
  /** What the rounding left over, radians. Positive means the shot still lands high of centre. */
  readonly residualRad: number;
  readonly unit: AngularUnit;
  /** The dialled angle expressed in the turret's own unit, for a label. */
  readonly dialled: number;
}

export function clicksFor(radians: number, turret: Turret): Dial {
  const per = fromAngularUnit(turret.clickValue, turret.unit);
  if (!(per > 0)) throw new Error('a turret click must be a positive angle');
  const clicks = Math.round(radians / per);
  const dialledRad = clicks * per;
  return {
    clicks,
    dialledRad,
    residualRad: radians - dialledRad,
    unit: turret.unit,
    dialled: toAngularUnit(dialledRad, turret.unit)
  };
}

/** What the rounding costs at a range, in the length unit the range is in. Usually metres. */
export function residualAt(dial: Dial, range: number): number {
  return subtension(dial.residualRad, range);
}

/**
 * True when the reticle and the turret speak the same language.
 *
 * False is not an error - plenty of scopes are built this way - but it is something the user has
 * to be told, because every hold read off the reticle then needs converting before it is dialled.
 */
export function unitsMatch(reticleUnit: AngularUnit, turret: Turret): boolean {
  return reticleUnit === turret.unit;
}
