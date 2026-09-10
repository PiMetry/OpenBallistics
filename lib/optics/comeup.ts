/**
 * The come-up table: what the shooter dials, and what dialling it leaves behind.
 *
 * Converts trajectory corrections into turret clicks at each range, with three rules:
 *
 * - **Clicks are whole, and the residual is shown.** A turret does not move by 7.3 clicks.
 * - **Every term stays named.** Elevation, wind, spin drift and aerodynamic jump are separate
 *   columns as well as a total, because a shooter who does not believe one of them must be able
 *   to leave it out, and because a total that hides a vertical wind term teaches nothing.
 * - **The transonic flag travels with the row.** A number computed through the transonic band is
 *   still shown, but it is never shown unmarked.
 */

import { aerodynamicJump, spinDrift } from '../ballistics/stability';
import type { TwistHand } from '../ballistics/stability';
import type { TrajectoryPoint } from '../ballistics/trajectory';
import { angleSubtended, toAngularUnit, type AngularUnit } from './angles';
import { clicksFor, residualAt, type Dial, type Turret } from './turret';

export interface ComeUpOptions {
  readonly turret: Turret;
  /**
   * The stability factor at the muzzle, if spin drift and aerodynamic jump are wanted. Without it
   * both are omitted and said to be omitted - neither is guessed from calibre.
   */
  readonly stability?: number;
  readonly twistHand?: TwistHand;
  /** Bullet length in metres; aerodynamic jump needs it. */
  readonly bulletLengthM?: number;
  /** The component of wind across the line of fire, m/s, positive left-to-right. */
  readonly crosswindMps?: number;
}

export interface ComeUpRow {
  readonly rangeM: number;
  readonly timeS: number;
  readonly velocityMps: number;
  readonly mach: number;
  readonly energyJ: number;
  readonly dropM: number;
  /** Elevation needed for the drop alone, radians. */
  readonly elevationRad: number;
  /** Windage from the wind alone, radians, positive right. */
  readonly windRad: number;
  /** Spin drift, radians, positive right. Absent when there is no stability figure to base it on. */
  readonly spinDriftRad?: number;
  /** Aerodynamic jump, radians, positive up. Vertical, and absent for the same reason. */
  readonly jumpRad?: number;
  /** Everything vertical, as clicks on this turret plus what the rounding left. */
  readonly elevation: Dial;
  /** Everything horizontal, likewise. */
  readonly windage: Dial;
  /** What the elevation rounding costs at this range, metres. */
  readonly elevationResidualM: number;
  readonly windageResidualM: number;
  readonly transonic: boolean;
}

export interface ComeUpTable {
  readonly unit: AngularUnit;
  readonly rows: readonly ComeUpRow[];
  /** What was left out, in the user's words, so the table is never read as more than it is. */
  readonly omitted: readonly string[];
}

/**
 * Turn solved trajectory points into dialled clicks.
 *
 * Elevation is `atan(drop / range)` and not `drop / range`: at the ranges where the difference
 * shows, so does everything else in this table.
 */
export function comeUpTable(
  points: readonly TrajectoryPoint[],
  options: ComeUpOptions
): ComeUpTable {
  const omitted: string[] = [];
  const wantsSpin = options.stability !== undefined && options.twistHand !== undefined;
  const wantsJump =
    options.stability !== undefined &&
    options.bulletLengthM !== undefined &&
    options.crosswindMps !== undefined;

  // Each omission names the input that is missing, because "spin drift not shown" is a shrug and
  // "no twist direction recorded" is something the user can go and fix.
  if (!wantsSpin) {
    omitted.push(
      options.stability === undefined
        ? 'spin drift: no stability factor, and one is not guessed from calibre'
        : 'spin drift: the barrel’s twist direction is not recorded'
    );
  }
  if (!wantsJump) {
    omitted.push(
      options.crosswindMps === undefined
        ? 'aerodynamic jump: no crosswind, so there is none'
        : options.stability === undefined
          ? 'aerodynamic jump: no stability factor, and one is not guessed from calibre'
          : 'aerodynamic jump: the bullet’s length is not recorded'
    );
  }

  const rows = points
    .filter((p) => p.rangeM > 0)
    .map((p): ComeUpRow => {
      const elevationRad = angleSubtended(p.dropM, p.rangeM);
      const windRad = angleSubtended(p.windageM, p.rangeM);
      const spinDriftRad = wantsSpin
        ? angleSubtended(spinDrift(options.stability!, p.timeS, options.twistHand!), p.rangeM)
        : undefined;
      // Jump is a muzzle constant - an angle, not a distance - so it is the same at every range.
      const jumpRad = wantsJump
        ? aerodynamicJump(options.stability!, options.bulletLengthM!, options.crosswindMps!)
        : undefined;

      const elevation = clicksFor(elevationRad - (jumpRad ?? 0), options.turret);
      const windage = clicksFor(windRad + (spinDriftRad ?? 0), options.turret);
      return {
        rangeM: p.rangeM,
        timeS: p.timeS,
        velocityMps: p.velocityMps,
        mach: p.mach,
        energyJ: p.energyJ,
        dropM: p.dropM,
        elevationRad,
        windRad,
        spinDriftRad,
        jumpRad,
        elevation,
        windage,
        elevationResidualM: residualAt(elevation, p.rangeM),
        windageResidualM: residualAt(windage, p.rangeM),
        transonic: p.transonic
      };
    });

  return { unit: options.turret.unit, rows, omitted };
}

/** A row's elevation in the turret's unit, for a label that is not a click count. */
export function elevationIn(row: ComeUpRow, unit: AngularUnit): number {
  return toAngularUnit(row.elevationRad, unit);
}
