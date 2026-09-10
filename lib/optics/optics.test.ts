/**
 * The scope arithmetic, against the numbers everybody quotes.
 *
 * These constants are the ones printed on the side of turret caps and in every manual, so they
 * are the right thing to test against: 1 MOA is 2.908 cm at 100 m, 1 mrad is exactly 10 cm at
 * 100 m, and 1 mrad is 3.438 MOA. If any of those moves, a conversion has been rounded.
 *
 * The remaining tests cover SFP reticles at different magnifications and conversions between
 * mil reticles and MOA turrets, where incorrect scaling can silently produce wrong answers.
 */

import { describe, expect, it } from 'vitest';
import { MOA, MRAD, angleSubtended, fromAngularUnit, subtension, toAngularUnit } from './angles';
import { clicksFor, residualAt, unitsMatch, type Turret } from './turret';
import { ReticleRefusal, observedSubtension, rangeFromReticle, type Reticle } from './reticle';
import { comeUpTable, elevationIn } from './comeup';
import { STANDARD_SEA_LEVEL, solve, type Shot } from '../ballistics';

describe('the angular units are the definitions, not a table', () => {
  it('puts 1 MOA at 2.9089 cm and 1 mrad at exactly 10 cm, at 100 m', () => {
    // The figure quoted everywhere is "2.908 cm"; the definition gives 2.90888. Taking the
    // definition and not the quotation is the point of computing these from MOA and MRAD.
    expect(subtension(MOA, 100) * 100).toBeCloseTo(2.9089, 3);
    expect(subtension(MRAD, 100) * 100).toBeCloseTo(10, 3);
  });

  it('puts 1 MOA at 1.047 inches at 100 yards', () => {
    const hundredYards = 91.44;
    expect(subtension(MOA, hundredYards) / 0.0254).toBeCloseTo(1.047, 3);
  });

  it('makes 1 mrad 3.438 MOA', () => {
    expect(toAngularUnit(MRAD, 'moa')).toBeCloseTo(3.438, 3);
  });

  it('round-trips both units', () => {
    for (const unit of ['moa', 'mrad'] as const) {
      expect(toAngularUnit(fromAngularUnit(2.75, unit), unit)).toBeCloseTo(2.75, 12);
    }
  });

  it('inverts subtension exactly', () => {
    expect(angleSubtended(subtension(0.004, 640), 640)).toBeCloseTo(0.004, 12);
  });

  it('refuses to compute an angle at no range', () => {
    expect(() => angleSubtended(1, 0)).toThrow(/range/);
  });
});

describe('the turret moves in whole clicks', () => {
  const quarterMoa: Turret = { unit: 'moa', clickValue: 0.25 };
  const tenthMil: Turret = { unit: 'mrad', clickValue: 0.1 };

  it('rounds to a click and reports what the rounding left', () => {
    // 7.3 quarter-MOA clicks is not a thing a turret does. 7 is, and 0.3 of a click is left.
    const wanted = 7.3 * fromAngularUnit(0.25, 'moa');
    const dial = clicksFor(wanted, quarterMoa);
    expect(dial.clicks).toBe(7);
    expect(dial.dialled).toBeCloseTo(1.75, 12);
    expect(toAngularUnit(dial.residualRad, 'moa')).toBeCloseTo(0.075, 12);
  });

  it('shows the residual as the distance it actually is on the target', () => {
    // At 1000 m a quarter-MOA click is about 7 cm, which is the difference between the top and
    // the bottom of a plate. This is why the residual is a column and not a footnote.
    const dial = clicksFor(9.6 * fromAngularUnit(0.25, 'moa'), quarterMoa);
    expect(Math.abs(residualAt(dial, 1000))).toBeGreaterThan(0.02);
    expect(Math.abs(residualAt(dial, 1000))).toBeLessThan(0.04);
  });

  it('dials down as readily as up', () => {
    const down = clicksFor(-fromAngularUnit(1.2, 'mrad'), tenthMil);
    expect(down.clicks).toBe(-12);
    expect(down.residualRad).toBeCloseTo(0, 12);
  });

  it('refuses a turret with no click size', () => {
    expect(() => clicksFor(0.001, { unit: 'mrad', clickValue: 0 })).toThrow(/positive/);
  });

  it('spots a mil reticle over MOA turrets, which is the silent mistake', () => {
    expect(unitsMatch('mrad', tenthMil)).toBe(true);
    expect(unitsMatch('mrad', quarterMoa)).toBe(false);
  });
});

describe('focal plane is arithmetic, not a label', () => {
  const ffp: Reticle = { id: 'r1', name: 'FFP mil', focalPlane: 'FFP', unit: 'mrad' };
  const sfp: Reticle = {
    id: 'r2',
    name: 'SFP mil',
    focalPlane: 'SFP',
    ratedMagnification: 25,
    unit: 'mrad'
  };

  it('holds an FFP subtension at every magnification', () => {
    expect(observedSubtension(ffp, 1, 6)).toBe(1);
    expect(observedSubtension(ffp, 1, 25)).toBe(1);
  });

  it('doubles an SFP subtension at half the rated power', () => {
    expect(observedSubtension(sfp, 1, 12.5)).toBeCloseTo(2, 12);
    expect(observedSubtension(sfp, 1, 25)).toBeCloseTo(1, 12);
  });

  it('refuses an SFP reticle with no magnification given, rather than assuming the rated one', () => {
    expect(() => observedSubtension(sfp, 1)).toThrow(ReticleRefusal);
    expect(() => observedSubtension(sfp, 1)).toThrow(/only correct at 25x/);
  });

  it('refuses an SFP record with no rated magnification at all', () => {
    const broken: Reticle = { ...sfp, ratedMagnification: undefined };
    expect(() => observedSubtension(broken, 1, 10)).toThrow(/cannot be used/);
  });
});

describe('ranging with the reticle', () => {
  const mil: Reticle = { id: 'r1', name: 'FFP mil', focalPlane: 'FFP', unit: 'mrad' };
  const moa: Reticle = { id: 'r3', name: 'FFP MOA', focalPlane: 'FFP', unit: 'moa' };

  it('is size x 1000 / mils, as the formula everybody uses', () => {
    // A 1.8 m man filling 2.5 mils: 720 m.
    expect(rangeFromReticle(1.8, 2.5, mil)).toBeCloseTo(720, 0);
  });

  it('agrees with itself in MOA', () => {
    const inMil = rangeFromReticle(0.5, 1, mil);
    const inMoa = rangeFromReticle(0.5, toAngularUnit(MRAD, 'moa'), moa);
    expect(inMoa).toBeCloseTo(inMil, 6);
  });

  it('is wrong by the full magnification ratio on an SFP scope, which is why it is corrected', () => {
    const sfp: Reticle = {
      id: 'r2',
      name: 'SFP mil',
      focalPlane: 'SFP',
      ratedMagnification: 20,
      unit: 'mrad'
    };
    // The same reading at half power is really twice the angle, so the target is half as far --
    // to within the tangent's own curvature, which is what the tolerance here is measuring.
    const atRated = rangeFromReticle(1.8, 2.5, sfp, 20);
    const atHalf = rangeFromReticle(1.8, 2.5, sfp, 10);
    expect(atHalf / (atRated / 2)).toBeCloseTo(1, 4);
  });

  it('refuses a reading of nothing', () => {
    expect(() => rangeFromReticle(1.8, 0, mil)).toThrow(ReticleRefusal);
    expect(() => rangeFromReticle(0, 2.5, mil)).toThrow(ReticleRefusal);
  });
});

describe('a come-up table', () => {
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
  const turret: Turret = { unit: 'mrad', clickValue: 0.1 };
  const solved = solve(match, [100, 200, 300, 600, 900]);

  it('needs nothing dialled at the zero, and more the further out', () => {
    const table = comeUpTable(solved.points, { turret });
    expect(table.rows[0]!.elevation.clicks).toBe(0);
    const clicks = table.rows.map((r) => r.elevation.clicks);
    expect(clicks).toEqual([...clicks].sort((a, b) => a - b));
    expect(clicks[clicks.length - 1]).toBeGreaterThan(clicks[1]!);
  });

  it('gives whole clicks and the residual on the target, never a fractional click', () => {
    const row = comeUpTable(solved.points, { turret }).rows[3]!;
    expect(Number.isInteger(row.elevation.clicks)).toBe(true);
    // Rounding to a tenth of a mil can never be out by more than half of one, which is 3 cm at
    // 600 m. If this grows, the rounding is being done somewhere it should not be.
    expect(Math.abs(row.elevationResidualM)).toBeLessThan(0.031);
  });

  it('drops the range the rifle is zeroed under, keeping only real rows', () => {
    const withMuzzle = solve(match, [0, 100]);
    expect(comeUpTable(withMuzzle.points, { turret }).rows).toHaveLength(1);
  });

  it('says what it left out, and names the input that is missing', () => {
    const bare = comeUpTable(solved.points, { turret });
    expect(bare.omitted.join(' ')).toMatch(/spin drift: no stability factor/);
    expect(bare.rows[0]!.spinDriftRad).toBeUndefined();

    const noHand = comeUpTable(solved.points, { turret, stability: 1.9 });
    expect(noHand.omitted.join(' ')).toMatch(/twist direction is not recorded/);
  });

  it('drifts the shot the way the rifling turns, once it is told which way that is', () => {
    const right = comeUpTable(solved.points, { turret, stability: 1.9, twistHand: 'right' });
    const left = comeUpTable(solved.points, { turret, stability: 1.9, twistHand: 'left' });
    expect(right.rows[4]!.spinDriftRad!).toBeGreaterThan(0);
    expect(left.rows[4]!.spinDriftRad!).toBeCloseTo(-right.rows[4]!.spinDriftRad!, 12);
    // It grows with time of flight, so it is worth almost nothing close in and real far out.
    expect(right.rows[0]!.spinDriftRad!).toBeLessThan(right.rows[4]!.spinDriftRad!);
  });

  it('puts aerodynamic jump in the elevation, where it belongs, not the windage', () => {
    const still = comeUpTable(solved.points, {
      turret,
      stability: 1.9,
      bulletLengthM: 0.0315,
      crosswindMps: 0
    });
    const windy = comeUpTable(solved.points, {
      turret,
      stability: 1.9,
      bulletLengthM: 0.0315,
      crosswindMps: 4.5
    });
    // A left-to-right wind throws the shot up, so less elevation is needed, not more.
    expect(windy.rows[4]!.jumpRad!).toBeGreaterThan(0);
    expect(windy.rows[4]!.elevation.dialledRad).toBeLessThanOrEqual(
      still.rows[4]!.elevation.dialledRad
    );
    // And it is a muzzle constant: the same angle at every range.
    expect(windy.rows[0]!.jumpRad!).toBeCloseTo(windy.rows[4]!.jumpRad!, 12);
  });

  it('carries the transonic flag into the row that has it', () => {
    const far = solve(match, [1200]);
    expect(comeUpTable(far.points, { turret }).rows[0]!.transonic).toBe(true);
  });

  it('can label a row in the turret’s own unit as well as in clicks', () => {
    const row = comeUpTable(solved.points, { turret }).rows[3]!;
    expect(elevationIn(row, 'mrad')).toBeCloseTo(row.elevationRad / MRAD, 9);
    expect(elevationIn(row, 'moa')).toBeCloseTo(elevationIn(row, 'mrad') * 3.438, 2);
  });
});
