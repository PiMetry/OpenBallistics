/**
 * What the solver has to get right before anything is shown to a shooter.
 *
 * Three kinds of test here, and the distinction matters:
 *
 * 1. **Transcription.** The drag tables are somebody else's data; the test is that they are the
 *    data, unchanged, at the endpoints and in count.
 * 2. **Physics with a closed form.** Drag switched off, a trajectory is a parabola and the drop
 *    at twice the zero range is exactly `2·D·tan θ`. That checks the integrator, the frame and
 *    the zeroing against arithmetic rather than against a previous run of itself.
 * 3. **Convergence.** Halving the integration step must not change the 1000 m result beyond
 *    the precision used for display.
 *
 * What is deliberately *not* here is a golden trajectory table. Checking the solver against
 * published output is Phase B's release gate (ROADMAP, "Validation before release") and it needs
 * a published table cited properly, not a number pasted from a run of this code.
 */

import { describe, expect, it } from 'vitest';
import { G1_TABLE, G7_TABLE } from './dragTables';
import { BC_SI_PER_CUSTOMARY, G1, G7, dragDeceleration, modelFor, tableDrag } from './drag';
import {
  STANDARD_SEA_LEVEL,
  density,
  densityAltitude,
  saturationVapourPressure,
  speedOfSound,
  standardAtmosphere
} from './atmosphere';
import { DEFAULT_STEP_S, G, SolverRefusal, solve, type Shot } from './trajectory';
import { aerodynamicJump, millerStability, spinDrift } from './stability';

describe('the standard drag tables are the published ones', () => {
  it('has the counts the source files have', () => {
    expect(G1_TABLE).toHaveLength(79);
    expect(G7_TABLE).toHaveLength(84);
  });

  it('starts and ends where McCoy’s tables do', () => {
    expect(G1_TABLE[0]).toEqual([0, 0.2629]);
    expect(G1_TABLE[G1_TABLE.length - 1]).toEqual([5, 0.4988]);
    expect(G7_TABLE[0]).toEqual([0, 0.1198]);
    expect(G7_TABLE[G7_TABLE.length - 1]).toEqual([5, 0.1618]);
  });

  it('is strictly ascending in Mach, which the interpolation depends on', () => {
    for (const table of [G1_TABLE, G7_TABLE]) {
      for (let i = 1; i < table.length; i += 1) {
        expect(table[i]![0]).toBeGreaterThan(table[i - 1]![0]);
      }
    }
  });

  it('shows the transonic rise that separates the two references', () => {
    // G7's reference is a boat-tail, so its subsonic Cd is far lower and its transonic rise far
    // sharper. If these ever swapped, a table had been pasted into the wrong constant.
    expect(G7.cd(0.5)).toBeLessThan(G1.cd(0.5));
    expect(G7.cd(1.05) / G7.cd(0.5)).toBeGreaterThan(G1.cd(1.05) / G1.cd(0.5));
  });
});

describe('drag interpolation', () => {
  const toy = tableDrag('toy', [
    [0, 1],
    [1, 2],
    [2, 4]
  ]);

  it('interpolates linearly between points', () => {
    expect(toy.cd(0.5)).toBeCloseTo(1.5, 12);
    expect(toy.cd(1.5)).toBeCloseTo(3, 12);
  });

  it('returns the table value exactly on a point', () => {
    expect(toy.cd(1)).toBe(2);
  });

  it('clamps outside the table rather than extrapolating a curve it does not have', () => {
    expect(toy.cd(-3)).toBe(1);
    expect(toy.cd(99)).toBe(4);
  });

  it('refuses a table it cannot interpolate', () => {
    expect(() => tableDrag('short', [[0, 1]])).toThrow(/two points/);
  });

  it('names itself, because every number it produces has to say which model made it', () => {
    expect(modelFor({ value: 0.243, model: 'G7' }).name).toBe('G7');
    expect(modelFor({ value: 0.475, model: 'G1' }).name).toBe('G1');
  });
});

describe('the ballistic coefficient in SI', () => {
  it('is the exact conversion of lb/in², not a pasted 703', () => {
    expect(BC_SI_PER_CUSTOMARY).toBeCloseTo(703.0696, 4);
  });

  it('retards a known bullet by about what it is known to lose', () => {
    // A .308 175 gr match bullet, G7 BC 0.243, at 800 m/s in standard air. Such a load gives up
    // roughly 100 m/s over 150 m, which is about 500 m/s². This is the check that the reference
    // area and the mass really did cancel in the formula.
    const rho = density(STANDARD_SEA_LEVEL);
    const mach = 800 / speedOfSound(STANDARD_SEA_LEVEL);
    const a = dragDeceleration(G7, 0.243, 800, mach, rho);
    expect(a).toBeGreaterThan(400);
    expect(a).toBeLessThan(650);
  });

  it('refuses a coefficient that is not one', () => {
    expect(() => dragDeceleration(G7, 0, 800, 2.3, 1.225)).toThrow(/positive/);
  });
});

describe('the air', () => {
  it('gives the standard sea-level density and speed of sound', () => {
    expect(density(STANDARD_SEA_LEVEL)).toBeCloseTo(1.225, 3);
    expect(speedOfSound(STANDARD_SEA_LEVEL)).toBeCloseTo(340.3, 1);
  });

  it('makes humid air lighter than dry air at the same pressure and temperature', () => {
    // Counter-intuitive and worth pinning: water vapour is lighter than the nitrogen it displaces.
    const hot = { temperatureC: 30, pressurePa: 101325, humidity: 0 };
    expect(density({ ...hot, humidity: 1 })).toBeLessThan(density(hot));
    // ...and by under 2 %, which is why it is the smallest of the atmospheric terms.
    expect(density(hot) / density({ ...hot, humidity: 1 })).toBeLessThan(1.02);
  });

  it('agrees with itself about the standard atmosphere', () => {
    expect(standardAtmosphere(0)).toEqual(STANDARD_SEA_LEVEL);
    expect(densityAltitude(STANDARD_SEA_LEVEL)).toBeCloseTo(0, 6);
    expect(densityAltitude(standardAtmosphere(1500))).toBeCloseTo(1500, 0);
  });

  it('reports hot thin air as the high density altitude it is', () => {
    const summer = { temperatureC: 35, pressurePa: 85000, humidity: 0.5 };
    expect(densityAltitude(summer)).toBeGreaterThan(2500);
  });

  it('puts saturation vapour pressure where the tables put it', () => {
    // Buck (1996) over water: ~611.2 Pa at 0 °C, ~2339 Pa at 20 °C.
    expect(saturationVapourPressure(0)).toBeCloseTo(611.2, 0);
    expect(saturationVapourPressure(20)).toBeCloseTo(2339, -1);
  });

  it('refuses air that cannot exist', () => {
    expect(() => density({ temperatureC: 50, pressurePa: 1000, humidity: 1 })).toThrow(/vapour/);
  });
});

/** A .308 175 gr match load, the worked example throughout. */
const match: Shot = {
  bullet: {
    massKg: 175 * 0.00006479891,
    diameterM: 0.00782,
    lengthM: 0.0315,
    bc: { value: 0.243, model: 'G7' }
  },
  muzzleVelocity: 792,
  sightHeightM: 0.05,
  zeroDistanceM: 100,
  air: STANDARD_SEA_LEVEL
};

describe('the integrator, checked against arithmetic', () => {
  // Drag switched off entirely: a trajectory is then a parabola with a closed form, and the
  // solver has nowhere to hide.
  const vacuum: Shot = {
    ...match,
    sightHeightM: 0,
    bullet: {
      ...match.bullet,
      drag: {
        name: 'none',
        cd: () => 0
      }
    }
  };

  it('flies a parabola: drop at twice the zero is 2·D·tan θ', () => {
    const got = solve(vacuum, [200], DEFAULT_STEP_S);
    const expected = 2 * 100 * Math.tan(got.launchAngleRad);
    expect(got.points[0]!.dropM).toBeCloseTo(expected, 4);
  });

  it('keeps time of flight at x / (v·cos θ) with no drag to slow it', () => {
    const got = solve(vacuum, [300], DEFAULT_STEP_S);
    const expected = 300 / (vacuum.muzzleVelocity * Math.cos(got.launchAngleRad));
    expect(got.points[0]!.timeS).toBeCloseTo(expected, 5);
  });

  it('conserves energy without drag: v² = v0² + 2·g·drop', () => {
    // Not "the speed does not change" - in a parabola it does, falling to a minimum at the apex
    // and rising again. What is conserved is the energy, and that is the stronger check anyway.
    const got = solve(vacuum, [500], DEFAULT_STEP_S).points[0]!;
    expect(got.velocityMps ** 2).toBeCloseTo(vacuum.muzzleVelocity ** 2 + 2 * G * got.dropM, 2);
  });

  it('uses the custom curve it was handed and says so', () => {
    expect(solve(vacuum, [100]).model).toBe('none');
  });
});

describe('the step size is chosen by convergence, not by feel', () => {
  it('does not move a 1000 m answer by more than a millimetre when halved', () => {
    const coarse = solve(match, [1000], DEFAULT_STEP_S).points[0]!;
    const fine = solve(match, [1000], DEFAULT_STEP_S / 2).points[0]!;
    expect(Math.abs(coarse.dropM - fine.dropM)).toBeLessThan(0.001);
    expect(Math.abs(coarse.timeS - fine.timeS)).toBeLessThan(0.0005);
  });
});

describe('a solved trajectory', () => {
  const got = solve(match, [0, 100, 300, 600, 1000]);

  it('is on the line of sight at the zero and below it far out', () => {
    expect(got.points[1]!.dropM).toBeCloseTo(0, 3);
    expect(got.points[4]!.dropM).toBeGreaterThan(got.points[3]!.dropM);
  });

  it('starts one sight height below the line of sight, because the bore is under the scope', () => {
    expect(got.points[0]!.dropM).toBeCloseTo(match.sightHeightM, 3);
  });

  it('slows down, and loses energy with the square of it', () => {
    expect(got.points[4]!.velocityMps).toBeLessThan(got.points[1]!.velocityMps);
    const p = got.points[3]!;
    expect(p.energyJ).toBeCloseTo(0.5 * match.bullet.massKg * p.velocityMps ** 2, 6);
  });

  it('flags the transonic band rather than quietly answering through it', () => {
    expect(got.points[1]!.transonic).toBe(false);
    const far = solve(match, [1200]).points[0]!;
    expect(far.mach).toBeLessThan(1.2);
    expect(far.transonic).toBe(true);
  });

  it('echoes the air it used, so no number can be shown without its conditions', () => {
    expect(got.air).toBe(STANDARD_SEA_LEVEL);
    expect(got.model).toBe('G7');
  });
});

describe('wind', () => {
  const still = solve(match, [1000]).points[0]!;

  it('pushes the bullet the way it blows, and not the other way', () => {
    const fromLeft = solve({ ...match, wind: { speedMps: 4.5, directionDeg: 90 } }, [1000]);
    expect(fromLeft.points[0]!.windageM).toBeGreaterThan(0.5);
    const fromRight = solve({ ...match, wind: { speedMps: 4.5, directionDeg: 270 } }, [1000]);
    expect(fromRight.points[0]!.windageM).toBeCloseTo(-fromLeft.points[0]!.windageM, 6);
  });

  it('moves nothing sideways when there is none', () => {
    expect(still.windageM).toBeCloseTo(0, 9);
  });

  it('changes time of flight with a head or tail wind, not the drop', () => {
    const tail = solve({ ...match, wind: { speedMps: 10, directionDeg: 0 } }, [1000]).points[0]!;
    expect(tail.timeS).toBeLessThan(still.timeS);
    expect(tail.windageM).toBeCloseTo(0, 9);
  });
});

describe('inclined fire', () => {
  it('drops less along the sight line uphill than on the flat', () => {
    // The whole reason the frame is the line of sight: this falls out of the integration, and no
    // cosine is applied to a flat answer afterwards.
    const flat = solve(match, [600]).points[0]!;
    const uphill = solve({ ...match, lookAngleDeg: 30 }, [600]).points[0]!;
    expect(uphill.dropM).toBeLessThan(flat.dropM);
  });

  it('is not quite symmetric up and down, which a cosine rule cannot express', () => {
    // Gravity has a component along the sight line, so it slows the bullet going up and speeds it
    // going down; the flight times differ and so does the drag each one collects. The naive
    // cosine rule gives one answer for both, and this is the size of what it misses.
    const up = solve({ ...match, lookAngleDeg: 20 }, [600]).points[0]!;
    const down = solve({ ...match, lookAngleDeg: -20 }, [600]).points[0]!;
    const flat = solve(match, [600]).points[0]!;
    expect(up.dropM).not.toBeCloseTo(down.dropM, 3);
    expect(Math.abs(up.dropM - down.dropM) / flat.dropM).toBeLessThan(0.02);
  });
});

describe('what the solver refuses', () => {
  it('refuses a bullet with no ballistic coefficient rather than inferring one', () => {
    const noBc = { ...match, bullet: { ...match.bullet, bc: { value: 0, model: 'G7' as const } } };
    expect(() => solve(noBc, [100])).toThrow(SolverRefusal);
    expect(() => solve(noBc, [100])).toThrow(/only guessed/);
  });

  it('refuses a range the bullet does not reach', () => {
    const pistol: Shot = {
      ...match,
      muzzleVelocity: 340,
      bullet: { ...match.bullet, bc: { value: 0.05, model: 'G1' } }
    };
    expect(() => solve(pistol, [5000])).toThrow(/does not reach/);
  });

  it('refuses the inputs it cannot do without', () => {
    expect(() => solve({ ...match, muzzleVelocity: 0 }, [100])).toThrow(/muzzle velocity/);
    expect(() => solve({ ...match, zeroDistanceM: 0 }, [100])).toThrow(/zero distance/);
  });
});

describe('stability, and what follows from it', () => {
  const barrel = { twistM: 11.25 * 0.0254, hand: 'right' as const };
  const input = {
    massKg: match.bullet.massKg,
    diameterM: 0.308 * 0.0254,
    lengthM: 1.24 * 0.0254,
    barrel,
    muzzleVelocity: 792,
    temperatureC: 15,
    pressurePa: 101325
  };

  it('puts a .308 175 gr in a 1:11.25 barrel where Miller’s rule puts it', () => {
    // Published figures for this combination sit near 1.9, comfortably stable.
    expect(millerStability(input)).toBeCloseTo(1.9, 1);
  });

  it('calls a slow twist marginal, which is the whole point of computing it', () => {
    const slow = millerStability({ ...input, barrel: { ...barrel, twistM: 14 * 0.0254 } });
    expect(slow).toBeLessThan(1.4);
    expect(slow).toBeGreaterThan(1);
  });

  it('rises in thin air and falls in cold, as the corrections say', () => {
    expect(millerStability({ ...input, pressurePa: 85000 })).toBeGreaterThan(
      millerStability(input)
    );
    expect(millerStability({ ...input, temperatureC: -20 })).toBeLessThan(millerStability(input));
  });

  it('refuses to invent a stability number without a length', () => {
    expect(() => millerStability({ ...input, lengthM: 0 })).toThrow(/positive/);
  });

  it('reproduces Litz’s worked spin drift', () => {
    // Sg 1.8, 1.6 s time of flight: 8.9 inches, per the published example.
    expect(spinDrift(1.8, 1.6, 'right') / 0.0254).toBeCloseTo(8.9, 1);
  });

  it('signs spin drift by the twist hand, which is why a rifle record carries it', () => {
    expect(spinDrift(1.8, 1.6, 'left')).toBeCloseTo(-spinDrift(1.8, 1.6, 'right'), 12);
  });

  it('throws the shot vertically in a crosswind, and the other way in the other wind', () => {
    const up = aerodynamicJump(1.9, 0.0315, 4.5);
    expect(up).toBeGreaterThan(0);
    expect(aerodynamicJump(1.9, 0.0315, -4.5)).toBeCloseTo(-up, 12);
    // A 10 mph crosswind is worth a few tenths of a mil at most - small, but not nothing, and
    // routinely mistaken for a bad wind call.
    expect(up * 1000).toBeLessThan(0.5);
    expect(up * 1000).toBeGreaterThan(0.05);
  });
});
