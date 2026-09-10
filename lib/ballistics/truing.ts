/**
 * Truing: bending the solve to fit what the rifle actually did.
 *
 * Truing adjusts model inputs to match observed impacts. The trajectory remains a prediction
 * based on the drag curve, muzzle velocity and atmospheric conditions.
 *
 * **Which knob, and when.** They are not interchangeable, and turning the wrong one hides an
 * error rather than fixing it:
 *
 * - **Muzzle velocity** dominates close in, where the bullet has not had time to lose much to
 *   drag. True it against an observation in the middle distance - far enough for the drop to be
 *   measurable, near enough that drag has not yet dominated.
 * - **Ballistic coefficient** dominates far out, where drag has been integrating for a while.
 *   True it against a long observation, and only after the muzzle velocity is settled.
 *
 * Doing them in the other order lets a wrong velocity be absorbed into the coefficient, which
 * then predicts everything else slightly wrong, and nothing in the output looks amiss.
 *
 * **What this refuses.** A truing that has to move an input a long way is not a better number, it
 * is a different problem - a misread target, a mismeasured range, a wrong zero. So each function
 * reports how far it moved the input and flags the move when it is larger than the input's own
 * plausible measurement error. And an observation from inside the transonic band cannot true a
 * coefficient at all: that is the region the standard curve fits worst, so fitting to it drags
 * the whole trajectory to match the one place the model is least trustworthy.
 */

import { TRANSONIC_MACH, solve, SolverRefusal, type Shot } from './trajectory';

export interface Observation {
  /** Slant range the group was shot at, metres. */
  readonly rangeM: number;
  /** Observed drop below the line of sight, metres, positive down. */
  readonly dropM: number;
}

export interface Truing {
  /** The value after truing. */
  readonly value: number;
  /** What it was before. */
  readonly was: number;
  /** The change as a fraction of the original: 0.02 is two percent. */
  readonly change: number;
  /**
   * Set when the change is larger than the input's own plausible error, with the reason. Truing
   * still returns the number - refusing to answer would be worse - but it is not silent.
   */
  readonly warning?: string;
}

/** Muzzle velocity from a chronograph is good to a percent or two; more than 5 % is a problem. */
const MV_PLAUSIBLE = 0.05;
/** Published BCs disagree with each other by ten percent routinely; twenty is another matter. */
const BC_PLAUSIBLE = 0.2;

/**
 * Secant iteration on one input until the predicted drop matches the observed one.
 *
 * Shared by both knobs because the shape of the problem is identical: one scalar in, one drop
 * out, monotone over any range worth truing at.
 */
function fit(
  initial: number,
  observed: number,
  dropFor: (value: number) => number,
  label: string
): number {
  let a = initial;
  let b = initial * 1.02;
  let fa = dropFor(a) - observed;
  let fb = dropFor(b) - observed;
  for (let i = 0; i < 40; i += 1) {
    if (Math.abs(fb) < 1e-5) return b;
    if (fb === fa) break;
    const next = b - (fb * (b - a)) / (fb - fa);
    if (!Number.isFinite(next) || next <= 0) break;
    a = b;
    fa = fb;
    b = next;
    fb = dropFor(b) - observed;
  }
  if (!Number.isFinite(b) || b <= 0) {
    throw new SolverRefusal(`no ${label} makes this shot match that observation`);
  }
  return b;
}

/**
 * Find the muzzle velocity that reproduces an observed drop.
 *
 * The zero is re-solved at each candidate velocity, because it has to be: the rifle was zeroed
 * with the velocity it actually has, not the one that was typed in.
 */
export function trueMuzzleVelocity(shot: Shot, observed: Observation): Truing {
  const dropFor = (mv: number) =>
    solve({ ...shot, muzzleVelocity: mv }, [observed.rangeM]).points[0]!.dropM;
  const value = fit(shot.muzzleVelocity, observed.dropM, dropFor, 'muzzle velocity');
  const change = value / shot.muzzleVelocity - 1;
  return {
    value,
    was: shot.muzzleVelocity,
    change,
    warning:
      Math.abs(change) > MV_PLAUSIBLE
        ? `truing moved the muzzle velocity by ${(change * 100).toFixed(1)} %, which is more than a chronograph is wrong by: check the range, the zero and the sight height before believing it`
        : undefined
  };
}

/**
 * Find the ballistic coefficient that reproduces an observed drop.
 *
 * Refuses a transonic observation: the standard curve is least trustworthy there, so a fit to it
 * would pull the entire trajectory to match the one place the model is worst.
 */
export function trueBallisticCoefficient(shot: Shot, observed: Observation): Truing {
  const check = solve(shot, [observed.rangeM]).points[0]!;
  if (check.mach < TRANSONIC_MACH) {
    throw new SolverRefusal(
      `that shot is transonic at ${observed.rangeM} m (Mach ${check.mach.toFixed(2)}): a coefficient trued there fits the one part of the curve that is least trustworthy. True against a supersonic range instead`
    );
  }
  const dropFor = (bc: number) =>
    solve({ ...shot, bullet: { ...shot.bullet, bc: { ...shot.bullet.bc, value: bc } } }, [
      observed.rangeM
    ]).points[0]!.dropM;
  const value = fit(shot.bullet.bc.value, observed.dropM, dropFor, 'ballistic coefficient');
  const change = value / shot.bullet.bc.value - 1;
  return {
    value,
    was: shot.bullet.bc.value,
    change,
    warning:
      Math.abs(change) > BC_PLAUSIBLE
        ? `truing moved the ${shot.bullet.bc.model} coefficient by ${(change * 100).toFixed(1)} %, which is more than published coefficients disagree with each other by: check that the drag model matches the bullet before believing it`
        : undefined
  };
}

/**
 * Both knobs, in the order that makes them mean something: velocity against the near observation,
 * then coefficient against the far one, with the trued velocity already in place.
 *
 * **Once each is not enough, and that is worth understanding rather than papering over.** The
 * velocity is fitted while the coefficient is still wrong, so some of the coefficient's error is
 * absorbed into the velocity; fitting the coefficient afterwards then leaves the velocity a little
 * off. Measured on a shot whose real answer is known, one pass recovers 786 m/s where the truth is
 * 792. So the pair is repeated until neither moves - which takes three or four rounds and costs
 * nothing - and then both land on their real values.
 *
 * The reported change is measured against the *original* input, not against the previous round,
 * because what the user needs to see is how far the whole exercise moved their number.
 *
 * Refuses the two observations the wrong way round, because at that point the answer would be
 * arithmetically fine and physically backwards.
 */
export function trueShot(
  shot: Shot,
  near: Observation,
  far: Observation
): { readonly shot: Shot; readonly muzzleVelocity: Truing; readonly bc: Truing } {
  if (!(far.rangeM > near.rangeM)) {
    throw new SolverRefusal(
      'true the muzzle velocity at the nearer range and the coefficient at the further one: the other way round lets a wrong velocity hide inside the coefficient'
    );
  }
  let current = shot;
  let muzzleVelocity!: Truing;
  let bc!: Truing;
  for (let round = 0; round < 8; round += 1) {
    muzzleVelocity = trueMuzzleVelocity(current, near);
    current = { ...current, muzzleVelocity: muzzleVelocity.value };
    bc = trueBallisticCoefficient(current, far);
    current = {
      ...current,
      bullet: { ...current.bullet, bc: { ...current.bullet.bc, value: bc.value } }
    };
    if (Math.abs(muzzleVelocity.change) < 1e-5 && Math.abs(bc.change) < 1e-5) break;
  }
  return {
    shot: current,
    muzzleVelocity: restate(muzzleVelocity, shot.muzzleVelocity),
    bc: restate(bc, shot.bullet.bc.value)
  };
}

/** The last round's result, re-expressed against where the user started rather than where it did. */
function restate(last: Truing, original: number): Truing {
  return { ...last, was: original, change: last.value / original - 1 };
}
