/**
 * Drag, as a function the solver is handed rather than one it contains.
 *
 * The solver takes `cd(mach)`, allowing standard tables and measured Cd-vs-Mach curves to share
 * the same interface without changes to the integration code.
 *
 * The other half of drag is the ballistic coefficient, which is how a real bullet is mapped onto
 * one of these reference shapes. Two rules from B.1b are enforced here rather than remembered:
 * a BC belongs to a model and carries it around, and there is no conversion between models.
 */

import { G1_TABLE, G7_TABLE, type DragTable } from './dragTables';

export interface DragModel {
  /** 'G1', 'G7', or the name of a measured curve. Shown with every number it produces. */
  readonly name: string;
  cd(mach: number): number;
}

/**
 * A ballistic coefficient, and which reference it is against.
 *
 * The model travels with the number because a BC without one is meaningless, and because using a
 * G1 figure against the G7 curve is a mistake that produces plausible, wrong answers rather than
 * an error.
 */
export interface BallisticCoefficient {
  /** In the customary lb/in², which is how every published BC is quoted. */
  readonly value: number;
  readonly model: 'G1' | 'G7';
}

/**
 * Linear interpolation over a table, clamped at both ends.
 *
 * Clamping is safe here and stated rather than assumed: both tables run to Mach 5, so the upper
 * clamp is unreachable by a firearm, and the lower one holds the subsonic value of a curve that
 * is nearly flat below Mach 0.6.
 */
export function tableDrag(name: string, table: DragTable): DragModel {
  if (table.length < 2) throw new Error(`drag table ${name} needs at least two points`);
  return {
    name,
    cd(mach: number): number {
      if (!Number.isFinite(mach)) throw new Error(`mach must be finite, got ${mach}`);
      const first = table[0]!;
      const last = table[table.length - 1]!;
      if (mach <= first[0]) return first[1];
      if (mach >= last[0]) return last[1];
      // Binary search: the tables are short, but this is called several thousand times per solve.
      let lo = 0;
      let hi = table.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (table[mid]![0] <= mach) lo = mid;
        else hi = mid;
      }
      const [m0, c0] = table[lo]!;
      const [m1, c1] = table[hi]!;
      return c0 + ((c1 - c0) * (mach - m0)) / (m1 - m0);
    }
  };
}

export const G1: DragModel = tableDrag('G1', G1_TABLE);
export const G7: DragModel = tableDrag('G7', G7_TABLE);

/** The model a BC is quoted against. There is no other way to get one. */
export function modelFor(bc: BallisticCoefficient): DragModel {
  return bc.model === 'G7' ? G7 : G1;
}

const LB_KG = 0.45359237;
const IN_M = 0.0254;

/**
 * A ballistic coefficient in SI: kg/m², from the customary lb/in².
 *
 * Exact, from the two definitions above - 703.0696…, a number worth deriving rather than pasting.
 */
export const BC_SI_PER_CUSTOMARY = LB_KG / (IN_M * IN_M);

/**
 * Retardation from drag, in m/s², for a bullet moving at `speed` through air of that density.
 *
 *     a = (π/8)·ρ·v²·Cd(M) / (BC · 703.0696)
 *
 * which is the drag force 0.5·ρ·v²·Cd·A over mass, with the reference area and the mass folded
 * into the coefficient exactly as the definition BC = m/(i·d²) allows. Sanity, since a formula
 * this compact is easy to get wrong: a .308 175 gr match bullet, G7 BC 0.243, at 800 m/s in
 * standard air comes out near 500 m/s², which is the ~100 m/s per 150 m that such a load loses.
 */
export function dragDeceleration(
  model: DragModel,
  bcValue: number,
  speed: number,
  mach: number,
  density: number
): number {
  if (bcValue <= 0) throw new Error('a ballistic coefficient must be positive');
  return (Math.PI / 8) * density * speed * speed * model.cd(mach) / (bcValue * BC_SI_PER_CUSTOMARY);
}
