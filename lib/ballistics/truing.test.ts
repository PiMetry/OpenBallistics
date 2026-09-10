/**
 * Truing, checked the only way it can be honestly checked: on a shot whose true answer is known.
 *
 * The trick throughout is to solve a shot with a *known* muzzle velocity or coefficient, take its
 * drop as the "observation", perturb the input, and require truing to find its way back. If it
 * recovers the original within a whisker, the fit is right; if it does not, no amount of agreeing
 * with a chart elsewhere would save it.
 */

import { describe, expect, it } from 'vitest';
import { STANDARD_METRO } from './atmosphere';
import { SolverRefusal, solve, type Shot } from './trajectory';
import { trueBallisticCoefficient, trueMuzzleVelocity, trueShot } from './truing';

const GRAIN_KG = 0.00006479891;

const match: Shot = {
  bullet: {
    massKg: 175 * GRAIN_KG,
    diameterM: 0.00782,
    lengthM: 0.0315,
    bc: { value: 0.243, model: 'G7' }
  },
  muzzleVelocity: 792,
  sightHeightM: 0.05,
  zeroDistanceM: 100,
  air: STANDARD_METRO
};

const dropAt = (shot: Shot, range: number) => solve(shot, [range]).points[0]!.dropM;

describe('truing the muzzle velocity', () => {
  it('recovers a velocity that was wrong by 3 %', () => {
    // The rifle really does 792 m/s; the chronograph or the box said 768.
    const truth = dropAt(match, 400);
    const guessed: Shot = { ...match, muzzleVelocity: 768 };
    const got = trueMuzzleVelocity(guessed, { rangeM: 400, dropM: truth });
    expect(got.value).toBeCloseTo(792, 0);
    expect(got.was).toBe(768);
    expect(got.change).toBeCloseTo(792 / 768 - 1, 3);
  });

  it('leaves an already-correct velocity where it is', () => {
    const got = trueMuzzleVelocity(match, { rangeM: 400, dropM: dropAt(match, 400) });
    expect(got.value).toBeCloseTo(792, 1);
    expect(got.warning).toBeUndefined();
  });

  it('re-solves the zero as it goes, because the rifle was zeroed at its real velocity', () => {
    // If the zero were held fixed while the velocity moved, the trued velocity would come out
    // wrong by roughly the amount the zero shifted. This is that check.
    const truth = dropAt(match, 300);
    const got = trueMuzzleVelocity({ ...match, muzzleVelocity: 700 }, { rangeM: 300, dropM: truth });
    expect(got.value).toBeCloseTo(792, 0);
  });

  it('says so when it has to move the velocity further than a chronograph is ever wrong', () => {
    const got = trueMuzzleVelocity({ ...match, muzzleVelocity: 600 }, {
      rangeM: 400,
      dropM: dropAt(match, 400)
    });
    expect(got.warning).toMatch(/more than a chronograph is wrong by/);
    // ...and still answers, because refusing to give the number would be less useful, not more.
    expect(got.value).toBeCloseTo(792, 0);
  });
});

describe('truing the ballistic coefficient', () => {
  it('recovers a coefficient that was 10 % optimistic', () => {
    const truth = dropAt(match, 700);
    const optimistic: Shot = {
      ...match,
      bullet: { ...match.bullet, bc: { value: 0.267, model: 'G7' } }
    };
    const got = trueBallisticCoefficient(optimistic, { rangeM: 700, dropM: truth });
    expect(got.value).toBeCloseTo(0.243, 3);
  });

  it('refuses to fit a coefficient to a transonic observation', () => {
    // The one place the standard curve is worst is the one place it must not be anchored.
    expect(() => trueBallisticCoefficient(match, { rangeM: 1200, dropM: 20 })).toThrow(
      SolverRefusal
    );
    expect(() => trueBallisticCoefficient(match, { rangeM: 1200, dropM: 20 })).toThrow(
      /transonic/
    );
  });

  it('says so when the fit demands a coefficient no published figure is out by', () => {
    const truth = dropAt(match, 600);
    const wrong: Shot = {
      ...match,
      bullet: { ...match.bullet, bc: { value: 0.32, model: 'G7' } }
    };
    const got = trueBallisticCoefficient(wrong, { rangeM: 600, dropM: truth });
    expect(got.warning).toMatch(/drag model matches the bullet/);
    expect(got.warning).toMatch(/G7/);
  });
});

describe('truing both, in the order that means something', () => {
  it('recovers both inputs from two observations', () => {
    const truth = { near: dropAt(match, 300), far: dropAt(match, 700) };
    const wrong: Shot = {
      ...match,
      muzzleVelocity: 775,
      bullet: { ...match.bullet, bc: { value: 0.26, model: 'G7' } }
    };
    const got = trueShot(
      wrong,
      { rangeM: 300, dropM: truth.near },
      { rangeM: 700, dropM: truth.far }
    );
    expect(got.muzzleVelocity.value).toBeCloseTo(792, 0);
    expect(got.bc.value).toBeCloseTo(0.243, 2);
    // The change is reported against what the user typed, not against the last round of the fit.
    expect(got.muzzleVelocity.was).toBe(775);
    expect(got.bc.was).toBe(0.26);
    // And the shot it hands back is the trued one, ready to solve with.
    expect(got.shot.muzzleVelocity).toBe(got.muzzleVelocity.value);
    expect(got.shot.bullet.bc.value).toBe(got.bc.value);
  });

  it('needs more than one pass, because each knob absorbs the other’s error', () => {
    // Documented in `trueShot`: fitting the velocity while the coefficient is still wrong leaves
    // the velocity carrying part of that error. One pass lands near 786 where the truth is 792.
    const truth = { near: dropAt(match, 300), far: dropAt(match, 700) };
    const wrong: Shot = {
      ...match,
      muzzleVelocity: 775,
      bullet: { ...match.bullet, bc: { value: 0.26, model: 'G7' } }
    };
    const onePass = trueMuzzleVelocity(wrong, { rangeM: 300, dropM: truth.near });
    expect(Math.abs(onePass.value - 792)).toBeGreaterThan(2);

    const iterated = trueShot(
      wrong,
      { rangeM: 300, dropM: truth.near },
      { rangeM: 700, dropM: truth.far }
    );
    expect(Math.abs(iterated.muzzleVelocity.value - 792)).toBeLessThan(1);
  });

  it('predicts a range it was not trued at', () => {
    // The real test of a truing: does it fix the whole curve, or only the two points it was fed?
    const truth = { near: dropAt(match, 300), far: dropAt(match, 700), unseen: dropAt(match, 550) };
    const wrong: Shot = {
      ...match,
      muzzleVelocity: 775,
      bullet: { ...match.bullet, bc: { value: 0.26, model: 'G7' } }
    };
    const before = Math.abs(dropAt(wrong, 550) - truth.unseen);
    const got = trueShot(
      wrong,
      { rangeM: 300, dropM: truth.near },
      { rangeM: 700, dropM: truth.far }
    );
    const after = Math.abs(dropAt(got.shot, 550) - truth.unseen);
    expect(before).toBeGreaterThan(0.05);
    expect(after).toBeLessThan(0.01);
  });

  it('refuses the two observations the wrong way round', () => {
    expect(() =>
      trueShot(match, { rangeM: 700, dropM: 5 }, { rangeM: 300, dropM: 1 })
    ).toThrow(/hide inside the coefficient/);
  });
});
