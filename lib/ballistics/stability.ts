/**
 * Gyroscopic stability, and the two effects that follow from it.
 *
 * A point mass has no axis, so nothing in `trajectory.ts` can produce spin drift or aerodynamic
 * jump. Both are supplied here as empirical corrections, kept separate so each stays named in the
 * output rather than vanishing into a drop figure the user cannot take apart.
 *
 * **These are fits, not physics, and every one of them is somebody else's fit.** They are quoted
 * here with their source and their units, and none of them is adjusted to taste:
 *
 * - Miller's stability rule, Don Miller, "A New Rule for Estimating Rifling Twist", Precision
 *   Shooting, March 2005, with his velocity and atmosphere corrections.
 * - Spin drift and aerodynamic jump as published by Bryan Litz, "Applied Ballistics for Long
 *   Range Shooting"; the closed forms are widely reproduced, e.g.
 *   https://forum.accurateshooter.com/threads/spin-drift-calculation.3862266/ (retrieved
 *   2026-09-07).
 *
 * Their accuracy is what it is: Miller's rule is a rule of thumb that is good to a few percent
 * over ordinary rifle bullets and is not meant for very short or very long ones, and the drift
 * and jump forms are fits over a similar population. That is why the solver reports them as their
 * own columns - a user who distrusts them can read the trajectory without them.
 */

const GRAIN_KG = 0.00006479891;
const IN_M = 0.0254;

export type TwistHand = 'right' | 'left';

export interface Barrel {
  /** Twist length, metres per turn. */
  readonly twistM: number;
  readonly hand: TwistHand;
}

export interface StabilityInput {
  readonly massKg: number;
  readonly diameterM: number;
  /** Overall bullet length. Without it there is no stability number, and none is invented. */
  readonly lengthM: number;
  readonly barrel: Barrel;
  /** Muzzle velocity, m/s. Miller's correction is applied at the muzzle, once. */
  readonly muzzleVelocity: number;
  readonly temperatureC: number;
  readonly pressurePa: number;
}

/**
 * The Miller gyroscopic stability factor, corrected for velocity and for the air.
 *
 * Read it as: below 1.0 the bullet tumbles, below about 1.4 it is marginal and pays for it in
 * drag and in group size, and much above 2.0 buys nothing.
 */
export function millerStability(input: StabilityInput): number {
  const d = input.diameterM / IN_M;
  const l = input.lengthM / IN_M / d; // length in calibres, which is what the rule takes
  const t = input.barrel.twistM / IN_M / d; // twist in calibres, likewise
  const m = input.massKg / GRAIN_KG;
  if (!(d > 0 && l > 0 && t > 0 && m > 0)) {
    throw new Error('stability needs a positive mass, diameter, length and twist');
  }
  const sg = (30 * m) / (t * t * d * d * d * l * (1 + l * l));

  // Miller's velocity correction, referenced to 2800 ft/s.
  const fps = input.muzzleVelocity / (IN_M * 12);
  const velocity = Math.cbrt(fps / 2800);

  // ...and his air correction, in the Fahrenheit and inches-of-mercury it was published in.
  const f = input.temperatureC * 1.8 + 32;
  const inHg = input.pressurePa / 3386.389;
  const air = ((f + 460) / 519) * (29.92 / inHg);

  return sg * velocity * air;
}

/**
 * Spin drift in metres at a given time of flight: Litz's closed form, in the direction the
 * rifling turns.
 *
 * Signed by the twist hand: a right-twist barrel drifts right. Records must carry the direction
 * as well as the rate so the drift sign does not depend on an assumed default.
 */
export function spinDrift(stability: number, timeOfFlightS: number, hand: TwistHand): number {
  const inches = 1.25 * (stability + 1.2) * Math.pow(Math.max(0, timeOfFlightS), 1.83);
  return inches * IN_M * (hand === 'left' ? -1 : 1);
}

/**
 * Aerodynamic jump, in radians, from a crosswind.
 *
 * **This one is vertical**, which is the reason it is worth having at all: a shot that lands high
 * in a left-to-right wind is routinely blamed on the wind call or on the load, and it is this.
 *
 * Litz's muzzle constant, in MOA per mph of crosswind, with the bullet length in inches:
 *
 *     jump = (Sg/100 - 0.0024·L + 0.032) · crosswind
 *
 * It is a constant at the muzzle - an angle, not a distance - so it applies to the whole
 * trajectory and is returned as an angle for the caller to convert at whatever range it wants.
 * A wind from the left (positive crosswind, the same sign convention as `Wind.directionDeg`)
 * throws the shot up.
 */
export function aerodynamicJump(
  stability: number,
  bulletLengthM: number,
  crosswindMps: number
): number {
  const lengthIn = bulletLengthM / IN_M;
  const mph = crosswindMps * 2.2369362920544;
  const moa = (stability / 100 - 0.0024 * lengthIn + 0.032) * mph;
  return (moa * Math.PI) / (180 * 60);
}
