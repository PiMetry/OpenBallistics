/**
 * What a shot inside the barrel is made of.
 *
 * This module implements the lumped-parameter interior-ballistics model described by
 * Carlucci & Jacobson. The form function is an interface, like drag in `lib/ballistics`,
 * allowing the caller to supply measured propellant behaviour.
 *
 * **Two things this model is not, stated here because they govern every use of it.**
 *
 * A computed pressure is **not a pressure test**. It is the output of a lumped model fed
 * propellant parameters that are themselves usually fitted, and it can be wrong by more than the
 * margin between a working load and a damaged rifle. This library does not recommend charges
 * or provide load advice.
 *
 * And it computes **one load that the user states**. It does not search for a charge, and it will
 * not be given a function that does.
 */

/**
 * A propellant's burn model.
 *
 * Every figure here is a property of a specific product and usually a *fitted* one - derived
 * backwards from closed-vessel or chronograph data rather than measured directly. None of it is
 * ever defaulted: a solver that invents an impetus produces a confident pressure for a powder that
 * does not exist.
 */
export interface Propellant {
  readonly name: string;
  /** Impetus / specific energy, J/kg. `F = R·T_flame/MW`. */
  readonly impetusJPerKg: number;
  /** Covolume, m³/kg - the Noble-Abel correction. */
  readonly covolumeM3PerKg: number;
  /** Solid density of the propellant grain, kg/m³. */
  readonly solidDensityKgPerM3: number;
  /**
   * Vivacity: the burn-rate coefficient in Vieille's law `br = β·Pᵅ`, as `dz/dt = Ba·φ(z)·(P/P0)ᵅ`.
   * Units are 1/s at the reference pressure.
   */
  readonly vivacityPerS: number;
  /** The reference pressure the vivacity is normalised at, Pa. */
  readonly referencePressurePa: number;
  /**
   * The pressure exponent α.
   *
   * This is a property of the propellant and must be supplied with its burn-rate parameters.
   */
  readonly pressureExponent: number;
  /** Ratio of specific heats, for the impetus/energy relation. */
  readonly gamma: number;
}

export interface Projectile {
  readonly massKg: number;
  /** Bore area the pressure acts on, m². The effective one including grooves, not π/4·d². */
  readonly boreAreaM2: number;
}

export interface Chamber {
  /**
   * Free volume behind the projectile before it moves, m³: the case capacity less the seated
   * portion of the bullet.
   */
  readonly freeVolumeM3: number;
  /** How far the base of the projectile travels to the muzzle, m. */
  readonly travelM: number;
}

export interface Load {
  readonly propellant: Propellant;
  /** Charge mass, kg. */
  readonly chargeKg: number;
  readonly projectile: Projectile;
  readonly chamber: Chamber;
  /**
   * Start pressure, Pa: the pressure at which the projectile begins to move.
   *
   * Engraving and crimp, lumped into one number as this class of model does. It matters more than
   * its obscurity suggests, and it is required rather than defaulted.
   */
  readonly startPressurePa: number;
  /**
   * The fraction of the charge mass added to the accelerated mass to stand for gas motion -
   * the Lagrange correction. Typically 0.3 to 0.5.
   */
  readonly chargeMassFraction: number;
  /** Constant retarding pressure from friction and air ahead of the bullet, Pa. Optional. */
  readonly resistancePa?: number;
  /**
   * The share of the released chemical energy lost as heat to the tube, case and projectile.
   *
   * A real loss, and one this model would otherwise ignore entirely. **Zero by default**: its size
   * depends on the barrel and the load and we do not know it, so it is a parameter to be supplied
   * rather than a constant to be invented. Values in the literature for small arms sit in the
   * region of 0.1 to 0.3.
   */
  readonly heatLossFraction?: number;
}

/** One point of the solved series. */
export interface InteriorPoint {
  readonly timeS: number;
  /** Travel from rest, m. */
  readonly travelM: number;
  readonly velocityMps: number;
  /** Mean chamber pressure, Pa. */
  readonly pressurePa: number;
  /** Fraction of the charge burned, 0..1. */
  readonly burned: number;
  /** Free gas volume at this instant, m³. */
  readonly freeVolumeM3: number;
}

export interface InteriorResult {
  readonly points: readonly InteriorPoint[];
  /** Peak mean pressure and where it happened. */
  readonly peakPressurePa: number;
  readonly peakAtM: number;
  /** At the muzzle. */
  readonly muzzleVelocityMps: number;
  readonly muzzleTimeS: number;
  /** How much of the charge had burned by the muzzle. Below 1 means powder left the barrel. */
  readonly burnedAtMuzzle: number;
  /** The form function that produced this, named, because it is the model's largest assumption. */
  readonly formFunction: string;
  /**
   * Everything the caller must be told about this answer before using it, in words.
   *
   * Never empty: the first entry always says a computed pressure is not a pressure test.
   */
  readonly caveats: readonly string[];
}

export class InteriorRefusal extends Error {}
