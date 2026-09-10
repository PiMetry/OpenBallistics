/**
 * The interior solve: charge, chamber and bore in; a pressure curve and a muzzle velocity out.
 *
 * The lumped-parameter model described by Carlucci & Jacobson.
 * Three states and one algebraic pressure:
 *
 * ```
 *   burn      dz/dt = Ba · φ(z) · (p / p₀)^α                       z clamped to [0, 1]
 *   gas       p     = mc·z·F / V_free
 *             V_free = V₀ + A·x - mc·z·b - mc·(1-z)/ρ
 *   motion    dv/dt = A·(p - p_resist) / m_eff                     only once p > p_start
 *             dx/dt = v
 *   stop      x reaches the muzzle
 * ```
 *
 * `V_free` is the whole model in one line: the chamber, plus what the bullet has vacated, less the
 * covolume of the gas made so far, less the solid propellant not yet burned. Get a term of it
 * wrong and the curve still looks like a pressure curve.
 *
 * **The closed-vessel identity is the test that matters.** Hold the projectile still and burn the
 * charge to completion and the pressure must come out at Noble-Abel's `p = δF/(1 - δb)`. That is
 * an independent closed form, it exercises the EOS and the volume bookkeeping together, and
 * `interior.test.ts` checks it to twelve digits. A solver that passes it is at least solving the
 * equations it claims to.
 *
 * **What it will not do.** It computes one load that the caller states. It does not search for a
 * charge, it does not compare against a pressure limit and pass judgement, and every result
 * carries the caveat that a computed pressure is not a pressure test. Results describe the stated
 * inputs and do not provide load advice.
 */

import { CONSTANT_SURFACE, checkFormFunction, type FormFunction } from './formFunction';
import {
  InteriorRefusal,
  type InteriorPoint,
  type InteriorResult,
  type Load
} from './types';

/** The sentence every result carries, first, whatever else it says. */
export const NOT_A_PRESSURE_TEST =
  'This is a computed pressure from a lumped model fed fitted propellant figures. A tuned lumped model lands within about 10-15 % on pressure, and that is not a safety margin: it is not a pressure test, and it can be wrong by more than the difference between a working load and a damaged firearm.';

export interface SolveOptions {
  /** The burning-surface model. Defaults to constant surface, which is stated in the output. */
  readonly formFunction?: FormFunction;
  /** Time step, seconds. */
  readonly stepS?: number;
  /** Keep every nth step in the returned series; the solve itself is unaffected. */
  readonly sampleEvery?: number;
  /**
   * Hold the projectile still: the closed-vessel case.
   *
   * Not a curiosity - it is how the solver is checked against Noble-Abel's closed form, and how a
   * manometric bomb is modelled.
   */
  readonly locked?: boolean;
  /** Give up after this long. A load that has not left the barrel by then is not converging. */
  readonly maxTimeS?: number;
}

/**
 * A time step of a microsecond.
 *
 * Interior ballistics happens in about a millisecond, so this is a thousand steps across the
 * event; the convergence test halves it and requires the muzzle velocity to move by less than
 * 0.1 m/s.
 */
export const DEFAULT_STEP_S = 1e-6;

function check(load: Load, form: FormFunction): void {
  const p = load.propellant;
  // Every one of these is a property of a real product. A solver that defaults any of them
  // produces a confident answer for a powder that does not exist.
  if (!(p.impetusJPerKg > 0)) throw new InteriorRefusal(`${p.name}: no impetus, so no pressure can be computed`);
  if (!(p.vivacityPerS > 0)) throw new InteriorRefusal(`${p.name}: no vivacity, so the burn rate is unknown`);
  if (!(p.solidDensityKgPerM3 > 0)) throw new InteriorRefusal(`${p.name}: no solid density`);
  if (!(p.referencePressurePa > 0)) throw new InteriorRefusal(`${p.name}: the vivacity has no reference pressure, so it has no units`);
  if (!(p.covolumeM3PerKg >= 0)) throw new InteriorRefusal(`${p.name}: a negative covolume is not a gas`);
  if (!(load.chargeKg > 0)) throw new InteriorRefusal('a charge mass is required');
  if (!(load.projectile.massKg > 0)) throw new InteriorRefusal('a projectile mass is required');
  if (!(load.projectile.boreAreaM2 > 0)) throw new InteriorRefusal('a bore area is required');
  if (!(load.chamber.freeVolumeM3 > 0)) throw new InteriorRefusal('a chamber volume is required');
  if (!(load.chamber.travelM > 0)) throw new InteriorRefusal('a barrel travel is required');

  // The charge has to fit in the case before it can be burned in one.
  const solidVolume = load.chargeKg / p.solidDensityKgPerM3;
  if (solidVolume >= load.chamber.freeVolumeM3) {
    throw new InteriorRefusal(
      `the charge occupies ${(solidVolume * 1e6).toFixed(3)} cm³ of solid propellant in a ${(load.chamber.freeVolumeM3 * 1e6).toFixed(3)} cm³ space: it does not fit, so there is nothing to solve`
    );
  }

  const problems = checkFormFunction(form);
  if (problems.length) throw new InteriorRefusal(problems[0]!);
}

/**
 * Noble-Abel closed-vessel pressure for a loading density.
 *
 * `p = δ·F / (1 - δ·b)`, the standard form. Exported because it is the reference the solver is
 * checked against rather than an internal detail.
 */
export function closedVesselPressure(
  chargeKg: number,
  volumeM3: number,
  impetusJPerKg: number,
  covolumeM3PerKg: number
): number {
  const density = chargeKg / volumeM3;
  const denominator = 1 - density * covolumeM3PerKg;
  if (denominator <= 0) {
    throw new InteriorRefusal(
      'the charge fills the space with gas covolume alone: Noble-Abel gives no pressure for that loading density'
    );
  }
  return (density * impetusJPerKg) / denominator;
}

/**
 * The chemical energy a charge can actually do work with, joules.
 *
 * **Not `mc·F`.** The impetus `F = R·T_flame` is the *pressure-producing* constant; the energy
 * available is `F/(γ-1)` per unit mass, which for a γ of 1.2 is five times larger. Confusing the
 * two is easy - they differ by a factor that looks like a plausible efficiency - so the relation
 * lives here rather than in whoever needs it next.
 */
export function chemicalEnergyJ(chargeKg: number, burned: number, impetusJPerKg: number, gamma: number): number {
  if (!(gamma > 1)) throw new InteriorRefusal('a ratio of specific heats must exceed 1');
  return (chargeKg * burned * impetusJPerKg) / (gamma - 1);
}

interface State {
  t: number;
  z: number;
  x: number;
  v: number;
}

export function solve(load: Load, options: SolveOptions = {}): InteriorResult {
  const form = options.formFunction ?? CONSTANT_SURFACE;
  check(load, form);

  const p = load.propellant;
  const dt = options.stepS ?? DEFAULT_STEP_S;
  const sampleEvery = Math.max(1, Math.round(options.sampleEvery ?? 20));
  const maxTime = options.maxTimeS ?? 0.05;
  const area = load.projectile.boreAreaM2;
  const travel = load.chamber.travelM;
  const massEff = load.projectile.massKg + load.chargeMassFraction * load.chargeKg;
  const resistance = load.resistancePa ?? 0;
  const heatLoss = Math.min(0.9, Math.max(0, load.heatLossFraction ?? 0));

  /** Free gas volume: chamber, plus swept bore, less gas covolume, less unburnt solid. */
  const freeVolume = (z: number, x: number) =>
    load.chamber.freeVolumeM3 +
    area * x -
    load.chargeKg * z * p.covolumeM3PerKg -
    (load.chargeKg * (1 - z)) / p.solidDensityKgPerM3;

  /**
   * Mean chamber pressure, from the **energy balance** rather than from a fixed temperature.
   *
   * The gas cools as it does work on the projectile, and the standard lumped-parameter form says
   * so directly:
   *
   * ```
   *   p · V_free / (γ-1) = mc·z·Qex - ½·m_eff·v²          and  F = Qex·(γ-1)
   *   p = ( (1-h)·mc·z·F - (γ-1)·½·m_eff·v² ) / V_free
   * ```
   *
   * The subtracted term is the energy the gas has already spent. Holding `T = T_ex` instead - as
   * this did at first - overstates the pressure late in the barrel, where the bullet is fast, and
   * understates what the burn has to do early to reach a given muzzle velocity.
   *
   * With the projectile held still the term is zero and this reduces exactly to Noble-Abel's
   * closed-vessel pressure, which is why that test still passes and still means something.
   *
   * `h` is the fraction of the released energy lost as heat to the tube, case and projectile.
   * Zero by default: it is a real loss and we do not know its size, so it is a parameter to be
   * supplied rather than a constant to be invented.
   */
  const pressure = (z: number, x: number, v = 0) => {
    const free = freeVolume(z, x);
    if (free <= 0) {
      throw new InteriorRefusal(
        'the gas and the unburnt powder together fill the chamber: the model has no volume left to hold them, which means this loading density is outside what a lumped model can represent'
      );
    }
    const released = (1 - heatLoss) * load.chargeKg * z * p.impetusJPerKg;
    const spent = (p.gamma - 1) * 0.5 * massEff * v * v;
    // A gas that has spent more than it released is not a gas; it means the inputs are impossible
    // rather than that the pressure is negative.
    return Math.max(0, released - spent) / free;
  };

  const derivative = (s: State) => {
    const press = pressure(s.z, s.x, s.v);
    const burning = s.z < 1;
    const dz = burning
      ? p.vivacityPerS * form.phi(s.z) * Math.pow(press / p.referencePressurePa, p.pressureExponent)
      : 0;
    // The projectile is held until the pressure beats the start pressure, and then never stops.
    const moving = !options.locked && (s.v > 0 || press > load.startPressurePa);
    const net = press - resistance;
    const dv = moving && net > 0 ? (area * net) / massEff : 0;
    return { t: 1, z: dz, x: moving ? s.v : 0, v: dv };
  };

  const step = (s: State): State => {
    const add = (base: State, d: ReturnType<typeof derivative>, f: number): State => ({
      t: base.t + d.t * f,
      z: Math.min(1, Math.max(0, base.z + d.z * f)),
      x: base.x + d.x * f,
      v: base.v + d.v * f
    });
    const k1 = derivative(s);
    const k2 = derivative(add(s, k1, dt / 2));
    const k3 = derivative(add(s, k2, dt / 2));
    const k4 = derivative(add(s, k3, dt));
    const sum = {
      t: k1.t + 2 * k2.t + 2 * k3.t + k4.t,
      z: k1.z + 2 * k2.z + 2 * k3.z + k4.z,
      x: k1.x + 2 * k2.x + 2 * k3.x + k4.x,
      v: k1.v + 2 * k2.v + 2 * k3.v + k4.v
    };
    return add(s, sum, dt / 6);
  };

  const at = (s: State): InteriorPoint => ({
    timeS: s.t,
    travelM: s.x,
    velocityMps: s.v,
    // The velocity matters here as much as in the integration: reporting an isothermal pressure
    // beside a curve solved with the energy balance would hand back a series the solver never used.
    pressurePa: pressure(s.z, s.x, s.v),
    burned: s.z,
    freeVolumeM3: freeVolume(s.z, s.x)
  });

  // The charge cannot start at exactly zero burned: the pressure would be zero and so would the
  // burn rate, and nothing would ever happen. A primer's worth of gas is what the start pressure
  // stands for, so the initial burned fraction is whatever produces it.
  const seed = Math.min(
    0.02,
    Math.max(
      1e-9,
      (load.startPressurePa * load.chamber.freeVolumeM3) /
        (load.chargeKg * p.impetusJPerKg || 1)
    )
  );

  let s: State = { t: 0, z: seed, x: 0, v: 0 };
  const points: InteriorPoint[] = [at(s)];
  let peakPressurePa = points[0]!.pressurePa;
  let peakAtM = 0;
  let taken = 0;

  while (s.t < maxTime) {
    s = step(s);
    taken += 1;
    const press = pressure(s.z, s.x, s.v);
    if (press > peakPressurePa) {
      peakPressurePa = press;
      peakAtM = s.x;
    }
    if (taken % sampleEvery === 0) points.push(at(s));
    if (!options.locked && s.x >= travel) break;
    if (options.locked && s.z >= 1 - 1e-12) break;
  }

  const last = at(s);
  if (points[points.length - 1]!.timeS !== last.timeS) points.push(last);

  if (!options.locked && s.x < travel) {
    throw new InteriorRefusal(
      `the projectile did not reach the muzzle within ${maxTime * 1000} ms: the charge is too small to move it, or the start pressure is never reached`
    );
  }

  const caveats = [NOT_A_PRESSURE_TEST];
  if (form === CONSTANT_SURFACE) {
    caveats.push(
      'The form function is the default constant-surface one, not this propellant’s own. The burning-surface model is the largest assumption in the result.'
    );
  }
  if (last.burned < 0.999 && !options.locked) {
    caveats.push(
      `${((1 - last.burned) * 100).toFixed(1)} % of the charge had not burned when the bullet left the barrel, so it burned outside it. The model stops at the muzzle and does not account for that.`
    );
  }

  return {
    points,
    peakPressurePa,
    peakAtM,
    muzzleVelocityMps: last.velocityMps,
    muzzleTimeS: last.timeS,
    burnedAtMuzzle: last.burned,
    formFunction: form.name,
    caveats
  };
}
