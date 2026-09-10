/**
 * The interior solver, checked against closed forms and against its own refusals.
 *
 * The load below uses illustrative, rounded parameters to test the arithmetic.
 * It does not describe a commercial propellant or a recommended load.
 *
 * The test that carries the most weight is the closed-vessel one. Hold the projectile still, burn
 * the charge out, and Noble-Abel gives the answer in closed form - `p = δF/(1 - δb)` - with no
 * integration involved. It exercises the equation of state and the free-volume bookkeeping
 * together, and those two are where a lumped-parameter solver goes quietly wrong.
 */

import { describe, expect, it } from 'vitest';
import {
  CONSTANT_SURFACE,
  InteriorRefusal,
  NOT_A_PRESSURE_TEST,
  checkFormFunction,
  chemicalEnergyJ,
  closedVesselPressure,
  degressive,
  parametric,
  piecewiseLinear,
  solve,
  tabulated,
  tubular,
  type Load
} from './index';

const propellant = {
  name: 'illustrative',
  impetusJPerKg: 900_000,
  covolumeM3PerKg: 0.001,
  solidDensityKgPerM3: 1600,
  vivacityPerS: 1600,
  referencePressurePa: 1e8,
  pressureExponent: 1,
  gamma: 1.2
};

const load: Load = {
  propellant,
  chargeKg: 0.00028,
  projectile: { massKg: 0.00804, boreAreaM2: 62.61e-6 },
  chamber: { freeVolumeM3: 0.42e-6, travelM: 0.1 },
  startPressurePa: 15e6,
  chargeMassFraction: 0.75
};

describe('the closed-vessel identity', () => {
  it('reproduces Noble-Abel exactly when the projectile cannot move', () => {
    // No integration in the reference: p = δF/(1 - δb), straight from the equation of state.
    const solved = solve(load, { locked: true });
    const abel = closedVesselPressure(
      load.chargeKg,
      load.chamber.freeVolumeM3,
      propellant.impetusJPerKg,
      propellant.covolumeM3PerKg
    );
    expect(solved.points.at(-1)!.pressurePa).toBeCloseTo(abel, 6);
    expect(solved.points.at(-1)!.burned).toBeCloseTo(1, 9);
  });

  it('is not the same as ignoring the covolume, which is the mistake it catches', () => {
    // Dropping the (1 - δb) term is the classic slip. At this loading density it is worth ~50 %,
    // so a solver that made it would fail the test above by a mile rather than by a rounding.
    const withCovolume = closedVesselPressure(load.chargeKg, load.chamber.freeVolumeM3, 900_000, 0.001);
    const ideal = closedVesselPressure(load.chargeKg, load.chamber.freeVolumeM3, 900_000, 0);
    expect(withCovolume / ideal).toBeGreaterThan(1.4);
  });

  it('refuses a loading density the equation of state cannot represent', () => {
    // Once the covolume alone fills the vessel, Noble-Abel has no answer - and returning a
    // negative or enormous pressure would look like one.
    expect(() => closedVesselPressure(0.001, 0.5e-6, 900_000, 0.001)).toThrow(InteriorRefusal);
  });
});

describe('a solved shot', () => {
  const solved = solve(load);

  it('rises to a peak early in the barrel and falls after it', () => {
    // Every real interior curve does this: pressure peaks in the first centimetres and the bullet
    // spends most of the barrel on falling pressure.
    expect(solved.peakAtM).toBeGreaterThan(0);
    expect(solved.peakAtM).toBeLessThan(load.chamber.travelM / 3);
    expect(solved.points.at(-1)!.pressurePa).toBeLessThan(solved.peakPressurePa);
  });

  it('accelerates the whole way, because the pressure never goes negative', () => {
    const moving = solved.points.filter((p) => p.velocityMps > 0);
    for (let i = 1; i < moving.length; i += 1) {
      expect(moving[i]!.velocityMps).toBeGreaterThanOrEqual(moving[i - 1]!.velocityMps);
    }
  });

  it('conserves the volume bookkeeping: free volume only grows once the bullet moves', () => {
    const moving = solved.points.filter((p) => p.travelM > 0);
    for (let i = 1; i < moving.length; i += 1) {
      expect(moving[i]!.freeVolumeM3).toBeGreaterThan(moving[i - 1]!.freeVolumeM3);
    }
  });

  it('does not give the projectile more energy than the charge released', () => {
    // The available energy is `mc·z·F/(γ-1)`, **not** `mc·z·F`: the impetus is the
    // pressure-producing constant and the energy is that over `γ-1`. Written against `mc·z·F` at
    // first, this test failed with the bullet apparently carrying twice the energy that existed -
    // which was the test's error, not the solver's, and is why the relation is now a function.
    const kinetic = 0.5 * load.projectile.massKg * solved.muzzleVelocityMps ** 2;
    const chemical = chemicalEnergyJ(
      load.chargeKg,
      solved.burnedAtMuzzle,
      propellant.impetusJPerKg,
      propellant.gamma
    );
    expect(kinetic).toBeGreaterThan(0);
    expect(kinetic).toBeLessThan(chemical);
    // And it is a plausible share of it rather than a rounding error: pistols are inefficient,
    // but not to one part in a thousand.
    expect(kinetic / chemical).toBeGreaterThan(0.1);
  });

  it('states the impetus-to-energy relation rather than leaving it to be rediscovered', () => {
    expect(chemicalEnergyJ(1, 1, 900_000, 1.2)).toBeCloseTo(900_000 / 0.2, 6);
    expect(() => chemicalEnergyJ(1, 1, 900_000, 1)).toThrow(/specific heats/);
  });

  it('leaves the barrel in about a millisecond, as a pistol does', () => {
    expect(solved.muzzleTimeS).toBeGreaterThan(0.0002);
    expect(solved.muzzleTimeS).toBeLessThan(0.005);
  });
});

describe('the gas cools as it works, which is the energy balance', () => {
  it('still reduces to Noble-Abel when nothing is moving', () => {
    // The energy term is the work already done. With the projectile held there is none, so the
    // closed-vessel identity is untouched - which is why that test still means what it did.
    const locked = solve(load, { locked: true });
    const abel = closedVesselPressure(
      load.chargeKg,
      load.chamber.freeVolumeM3,
      propellant.impetusJPerKg,
      propellant.covolumeM3PerKg
    );
    expect(locked.points.at(-1)!.pressurePa).toBeCloseTo(abel, 6);
  });

  it('gives less pressure at the muzzle than a gas that never cooled would', () => {
    // The isothermal form this replaced computes mc·z·F/V_free. The energy form subtracts what the
    // gas has already spent on the bullet, and at the muzzle the bullet is carrying most of it.
    const solved = solve(load);
    const last = solved.points.at(-1)!;
    const isothermal =
      (load.chargeKg * last.burned * propellant.impetusJPerKg) / last.freeVolumeM3;
    expect(last.pressurePa).toBeLessThan(isothermal);
    // And not by a little: this is the term that took a 33 % pressure error out of the model.
    expect(last.pressurePa / isothermal).toBeLessThan(0.9);
  });

  it('costs almost nothing at the peak, where the bullet is still slow', () => {
    // The correction scales with v², so early in the barrel it is nearly absent. If it moved the
    // peak much, the term would be in the wrong place.
    const peak = solve(load).points.find((p) => p.velocityMps > 0)!;
    expect(peak.velocityMps).toBeLessThan(50);
  });

  it('takes a heat loss, and refuses to invent one', () => {
    // Zero by default: a real loss whose size depends on the barrel, so it is supplied rather than
    // assumed. Given one, it lowers everything.
    const plain = solve(load);
    const lossy = solve({ ...load, heatLossFraction: 0.2 });
    expect(lossy.peakPressurePa).toBeLessThan(plain.peakPressurePa);
    expect(lossy.muzzleVelocityMps).toBeLessThan(plain.muzzleVelocityMps);
  });

  it('never reports a negative pressure, whatever it is given', () => {
    // A gas cannot spend more than it released. If the inputs say otherwise the answer is zero
    // pressure and a projectile that does not reach the muzzle, not a negative number.
    const absurd = { ...load, chargeMassFraction: 40 };
    try {
      const solved = solve(absurd);
      for (const point of solved.points) expect(point.pressurePa).toBeGreaterThanOrEqual(0);
    } catch (error) {
      expect(error).toBeInstanceOf(InteriorRefusal);
    }
  });
});

describe('the step size is settled by convergence, not by feel', () => {
  it('does not move the muzzle velocity when halved', () => {
    const coarse = solve(load, { stepS: 1e-6 });
    const fine = solve(load, { stepS: 5e-7 });
    expect(Math.abs(coarse.muzzleVelocityMps - fine.muzzleVelocityMps)).toBeLessThan(0.1);
    expect(Math.abs(coarse.peakPressurePa - fine.peakPressurePa) / coarse.peakPressurePa).toBeLessThan(
      0.001
    );
  });
});

describe('the form function is the largest assumption, so it is named and checked', () => {
  it('says which one made the answer', () => {
    expect(solve(load).formFunction).toBe('constant surface');
    expect(solve(load, { formFunction: degressive() }).formFunction).toMatch(/degressive/);
    expect(solve(load, { formFunction: tubular(0.2) }).formFunction).toMatch(/tubular/);
  });

  it('warns when it is the default rather than the propellant’s own', () => {
    expect(solve(load).caveats.join(' ')).toMatch(/default constant-surface/);
    expect(solve(load, { formFunction: degressive() }).caveats.join(' ')).not.toMatch(/default/);
  });

  it('burns a degressive grain more slowly at the end than a neutral one', () => {
    // A sphere loses surface as it goes, so the tail of the burn is slower and less of the charge
    // is gone at the muzzle. If this came out the other way the sign of the model would be wrong.
    const neutral = solve(load, { formFunction: CONSTANT_SURFACE });
    const sphere = solve(load, { formFunction: degressive() });
    expect(sphere.burnedAtMuzzle).toBeLessThan(neutral.burnedAtMuzzle);
  });

  it('makes a progressive tubular grain peak later than a degressive one', () => {
    const sphere = solve(load, { formFunction: degressive() });
    const progressive = solve(load, { formFunction: tubular(1) });
    expect(progressive.peakAtM).toBeGreaterThan(sphere.peakAtM);
  });

  it('takes a piecewise-linear one, which is what a measured curve comes back as', () => {
    const measured = piecewiseLinear([0.47, 0.83], [1, 0.9, 1.18], [0.3, 0.1, -0.2], 'measured');
    expect(measured.phi(0)).toBeCloseTo(1, 12);
    expect(measured.phi(0.5)).toBeCloseTo(0.95, 12);
    expect(solve(load, { formFunction: measured }).formFunction).toBe('measured');
  });

  it('takes a measured table, which is what the interface exists for', () => {
    // A real propellant's surface is not a textbook shape. Inverted out of a pressure trace it
    // comes back as points, and those go straight in.
    const measured = tabulated(
      [
        [0.04, 1.09],
        [0.29, 0.80],
        [0.61, 0.49],
        [0.86, 0.12]
      ],
      'BA 9-ish'
    );
    expect(measured.phi(0.04)).toBeCloseTo(1.09, 12);
    expect(measured.phi(0.45)).toBeCloseTo(0.8 + (0.49 - 0.8) * ((0.45 - 0.29) / (0.61 - 0.29)), 9);
    expect(solve(load, { formFunction: measured }).formFunction).toBe('BA 9-ish');
  });

  it('holds the end values rather than extrapolating off the evidence', () => {
    // A measured trace rarely reaches z = 0 or z = 1: both ends are noise. Extrapolating a burning
    // surface past where it was measured would be inventing one, and a linear extrapolation of a
    // falling curve goes negative, which is not a surface at all.
    const measured = tabulated([
      [0.2, 1],
      [0.8, 0.2]
    ]);
    expect(measured.phi(0)).toBe(1);
    expect(measured.phi(1)).toBe(0.2);
    expect(measured.phi(0.9)).toBe(0.2);
  });

  it('refuses a table that is not one', () => {
    expect(() => tabulated([[0.5, 1]])).toThrow(/at least two points/);
    expect(() => tabulated([[0, 1], [1, -0.5]])).toThrow(/cannot be negative/);
  });

  it('refuses a piecewise definition that does not describe stages', () => {
    expect(() => piecewiseLinear([0.5], [1], [0])).toThrow(/one more stage/);
    expect(() => piecewiseLinear([0.8, 0.4], [1, 1, 1], [0, 0, 0])).toThrow(/ascend/);
  });

  it('rejects a form function that is not a surface', () => {
    expect(checkFormFunction({ name: 'negative', phi: () => -1 })[0]).toMatch(/negative/);
    expect(checkFormFunction({ name: 'dead', phi: (z) => (z > 0.5 ? 0 : 1) })[0]).toMatch(
      /burn stops/
    );
    expect(checkFormFunction(CONSTANT_SURFACE)).toEqual([]);
  });
});

describe('the parametric form, which published data is fitted to', () => {
  // Kneubuehl 3.3:23, phi(z) = mu*(1 + lambda*z)^n. The first three tests check
  // that this expression reduces exactly to the neutral, spherical and tubular forms.

  it('is the neutral grain at lambda = 0', () => {
    const neutral = parametric(1, 0, 1);
    for (const z of [0, 0.3, 0.7, 1]) expect(neutral.phi(z)).toBeCloseTo(1, 12);
  });

  it('is exactly the sphere at mu=1, lambda=-1, n=2/3', () => {
    const sphere = parametric(1, -1, 2 / 3);
    const closed = degressive(2 / 3);
    for (const z of [0, 0.25, 0.5, 0.75, 0.99]) {
      expect(sphere.phi(z)).toBeCloseTo(closed.phi(z), 12);
    }
  });

  it('is exactly the tube at n=1', () => {
    const tube = parametric(1, 0.4, 1);
    const known = tubular(0.4);
    for (const z of [0, 0.3, 0.6, 1]) expect(tube.phi(z)).toBeCloseTo(known.phi(z), 12);
  });

  it('goes progressive for positive lambda and degressive for negative', () => {
    expect(parametric(1, 0.5, 1).phi(1)).toBeGreaterThan(1);
    expect(parametric(1, -0.5, 1).phi(1)).toBeLessThan(1);
  });

  it('returns zero rather than NaN when the parameters say the grain is gone', () => {
    // A negative base under a fractional power is not a surface. NaN here would propagate
    // silently through the integration and come out as a plausible-looking refusal.
    const gone = parametric(1, -2, 0.5);
    expect(gone.phi(0.9)).toBe(0);
    expect(Number.isNaN(gone.phi(0.9))).toBe(false);
  });

  it('is accepted by the solver and named in the result', () => {
    expect(solve(load, { formFunction: parametric(1, -1, 2 / 3) }).formFunction)
      .toMatch(/parametric/);
  });
});

describe('physical consistency checks for the illustrative load', () => {
  // Broad bounds catch unit errors and changes in the shape of this solution.
  // They are regression checks for these inputs, not universal bounds for every load.
  const solved = solve(load, { formFunction: parametric(1, -1, 2 / 3) });

  it('puts peak pressure within the first few centimetres of travel', () => {
    expect(solved.peakAtM).toBeGreaterThan(0);
    expect(solved.peakAtM).toBeLessThan(0.05);
  });

  it('gets the projectile out of the barrel in well under a millisecond', () => {
    expect(solved.muzzleTimeS).toBeLessThan(0.001);
  });

  it('takes roughly twice the time a constant muzzle velocity would', () => {
    // Transit time ~ 2L/v0: the bullet averages about half its muzzle velocity down the barrel.
    // A model that accelerated it instantly, or barely at all, fails this and little else.
    const naive = load.chamber.travelM / solved.muzzleVelocityMps;
    expect(solved.muzzleTimeS / naive).toBeGreaterThan(1.3);
    expect(solved.muzzleTimeS / naive).toBeLessThan(3);
  });

  it('converts about a third of the charge’s energy into muzzle kinetic energy', () => {
    // Wide bounds accommodate this load and model while catching an order-of-magnitude error.
    const kinetic = 0.5 * load.projectile.massKg * solved.muzzleVelocityMps ** 2;
    const chemical = chemicalEnergyJ(load.chargeKg, 1, propellant.impetusJPerKg, propellant.gamma);
    expect(kinetic / chemical).toBeGreaterThan(0.1);
    expect(kinetic / chemical).toBeLessThan(0.6);
  });

  it('has a peak two to four times the mean pressure over the travel', () => {
    // 2-3 for a handgun, 3-4 for a rifle. A flat curve means the burn is not being resolved.
    const moving = solved.points.filter((p) => p.travelM > 0);
    const mean = moving.reduce((sum, p) => sum + p.pressurePa, 0) / moving.length;
    const ratio = solved.peakPressurePa / mean;
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(5);
  });
});

describe('what it refuses to guess', () => {
  it.each([
    ['impetusJPerKg', /no impetus/],
    ['vivacityPerS', /no vivacity/],
    ['solidDensityKgPerM3', /no solid density/],
    ['referencePressurePa', /no reference pressure/]
  ])('refuses a propellant with no %s', (field, message) => {
    const broken = { ...load, propellant: { ...propellant, [field]: 0 } };
    expect(() => solve(broken as Load)).toThrow(InteriorRefusal);
    expect(() => solve(broken as Load)).toThrow(message);
  });

  it('refuses a charge that does not fit in the case', () => {
    // 2 g of propellant at 1600 kg/m³ is 1.25 cm³ of solid in a 0.42 cm³ space.
    expect(() => solve({ ...load, chargeKg: 0.002 })).toThrow(/does not fit/);
  });

  it('refuses a load that never leaves the barrel rather than reporting a muzzle velocity', () => {
    // A charge far too small to reach the start pressure: there is no answer, and zero would look
    // like one.
    expect(() => solve({ ...load, chargeKg: 1e-7 })).toThrow(/did not reach the muzzle/);
  });
});

describe('what every answer says about itself', () => {
  it('always leads with the fact that it is not a pressure test', () => {
    expect(solve(load).caveats[0]).toBe(NOT_A_PRESSURE_TEST);
    expect(solve(load, { formFunction: degressive() }).caveats[0]).toBe(NOT_A_PRESSURE_TEST);
    expect(NOT_A_PRESSURE_TEST).toMatch(/not a pressure test/);
  });

  it('says when the powder was still burning as the bullet left', () => {
    // A slow powder in a short barrel throws burning propellant out of the muzzle, and the model
    // stops there. Reporting the velocity without saying so would overstate what it knows.
    const slow = { ...load, propellant: { ...propellant, vivacityPerS: 400 } };
    const solved = solve(slow);
    expect(solved.burnedAtMuzzle).toBeLessThan(0.999);
    expect(solved.caveats.join(' ')).toMatch(/had not burned when the bullet left/);
  });
});
