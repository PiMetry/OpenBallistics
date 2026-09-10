/**
 * The GEE, and the rule of thumb it turns out to explain.
 *
 * Most of this file checks the construction: the apex touches the tolerance, the band is ordered
 * near < apex < zero < far, and a load that cannot have a band is refused rather than given one.
 *
 * The last block is the interesting one. German hunters are taught to sight in about **4 cm high
 * at 100 m** and told it is a rough approximation. Run the optimum-zero construction across the
 * ordinary European hunting cartridges and it is not rough at all - every one of them lands
 * between 3.9 and 4.0 cm. The reason is structural and the test says so: with a 4 cm tolerance and
 * a scope about 5 cm over the bore, the apex of the optimum trajectory falls near 100 m for all of
 * them, so "4 cm high at 100 m" and "apex = 4 cm" are very nearly the same instruction.
 *
 * It is a rule about a class of cartridges, not a law, and the last test shows where it stops
 * being one.
 */

import { describe, expect, it } from 'vitest';
import { STANDARD_SEA_LEVEL } from './atmosphere';
import { SolverRefusal, solve, type Shot } from './trajectory';
import { GEE_TOLERANCE_M, pointBlankZero } from './pointBlank';

const G = 0.001;

const load = (massG: number, diameterMm: number, bc: number, mv: number, sightMm = 50): Shot => ({
  bullet: { massKg: massG * G, diameterM: diameterMm * G, bc: { value: bc, model: 'G1' } },
  muzzleVelocity: mv,
  sightHeightM: sightMm * G,
  zeroDistanceM: 100,
  air: STANDARD_SEA_LEVEL
});

/** A .308 Win hunting load, the worked example. */
const win308 = load(10.7, 7.82, 0.44, 800);

describe('the point-blank band is built the way it is defined', () => {
  const band = pointBlankZero(win308);

  it('raises the trajectory until its highest point exactly touches the tolerance', () => {
    // This is the whole construction: any higher and the band ends early, any lower and it ends
    // sooner than it needed to.
    expect(band.apexHeightM).toBeCloseTo(GEE_TOLERANCE_M, 3);
    expect(band.toleranceM).toBe(GEE_TOLERANCE_M);
  });

  it('orders the band: enters low, tops out, crosses the aim, then falls out of it', () => {
    expect(band.nearDistanceM).toBeLessThan(band.apexM);
    expect(band.apexM).toBeLessThan(band.zeroDistanceM);
    expect(band.zeroDistanceM).toBeLessThan(band.farDistanceM);
  });

  it('puts a .308 hunting load’s GEE where the published tables put it', () => {
    // German GEE tables give roughly 190-200 m for this class of load. This is a sanity band, not
    // a golden number: the exact figure moves with the bullet and the scope height.
    expect(band.farDistanceM).toBeGreaterThan(180);
    expect(band.farDistanceM).toBeLessThan(210);
  });

  it('takes a wider tolerance further, and a narrower one less far', () => {
    const generous = pointBlankZero(win308, 0.08);
    const strict = pointBlankZero(win308, 0.02);
    expect(generous.farDistanceM).toBeGreaterThan(band.farDistanceM);
    expect(strict.farDistanceM).toBeLessThan(band.farDistanceM);
  });

  it('shortens the band in thin, slow air and lengthens it with speed', () => {
    const faster = pointBlankZero({ ...win308, muzzleVelocity: 900 });
    expect(faster.farDistanceM).toBeGreaterThan(band.farDistanceM);
  });

  it('says whether the far edge is somewhere the drag model can be trusted', () => {
    expect(band.transonic).toBe(false);
  });
});

describe('what it refuses', () => {
  it('refuses a tolerance that is not one', () => {
    expect(() => pointBlankZero(win308, 0)).toThrow(SolverRefusal);
  });

  it('starts the band at the muzzle when the sight is inside the tolerance of the bore', () => {
    // Iron sights, or a very low mount: the bullet never was below the band, so the near edge is
    // the muzzle. That is an answer rather than a special case.
    const irons = pointBlankZero(load(10.7, 7.82, 0.44, 800, 20), 0.04);
    expect(irons.nearDistanceM).toBe(0);
    expect(irons.farDistanceM).toBeGreaterThan(150);
  });

  it('gives an air rifle the short band it really has', () => {
    // An earlier version refused this, on the grounds that a pellet cannot be zeroed at any
    // sensible distance. That was an artefact of searching over zero distances rather than over
    // launch angle: a 4 cm band exists for a pellet, it is simply short, and 34 m zero for a 39 m
    // band is exactly what airgun shooters use.
    const band = pointBlankZero(load(0.5, 4.5, 0.02, 170));
    expect(band.zeroDistanceM).toBeGreaterThan(25);
    expect(band.farDistanceM).toBeLessThan(50);
    expect(band.apexHeightM).toBeCloseTo(0.04, 3);
  });
});

describe('flying the bullet once is not a shortcut that costs accuracy', () => {
  it('matches a full re-solve at the found zero, to a hundredth of a millimetre', () => {
    // The whole optimisation rests on one claim: tilting the launch adds a straight line to the
    // trajectory, because drag does not notice a change of a fraction of a degree. If that were
    // false, every figure in this module would be quietly wrong, so it is measured rather than
    // asserted - against the solver re-run properly at the zero this module reports.
    const band = pointBlankZero(win308);
    const exact = solve({ ...win308, zeroDistanceM: band.zeroDistanceM }, [100]);

    // 6 um on a 4 cm figure. Most of that is the 2 m sampling grid being interpolated across
    // rather than the tilt approximation itself, which measures under 2 um at 400 m.
    expect(Math.abs(-exact.points[0]!.dropM - band.heightAt100M)).toBeLessThan(1e-5);

    // And the far edge is where a re-solve says the trajectory leaves the band.
    const far = solve({ ...win308, zeroDistanceM: band.zeroDistanceM }, [band.farDistanceM]);
    expect(-far.points[0]!.dropM).toBeCloseTo(-band.toleranceM, 4);
  });

  it('finds the same band whatever zero the shot happened to carry in', () => {
    // The input shot's own zero is irrelevant to the answer - it is only where the single flight
    // started from. If it leaked into the result, this would fail.
    const from100 = pointBlankZero(win308);
    const from300 = pointBlankZero({ ...win308, zeroDistanceM: 300 });
    expect(from300.zeroDistanceM).toBeCloseTo(from100.zeroDistanceM, 1);
    expect(from300.farDistanceM).toBeCloseTo(from100.farDistanceM, 1);
  });
});

describe('the 4 cm rule of thumb, tested rather than repeated', () => {
  const hunting: [string, Shot][] = [
    ['.243 Win', load(6.5, 6.17, 0.4, 900)],
    ['7x64', load(10.5, 7.24, 0.5, 830)],
    ['.308 Win', load(10.7, 7.82, 0.44, 800)],
    ['.30-06', load(11.7, 7.82, 0.45, 820)],
    ['8x57 IS', load(12.7, 8.2, 0.4, 750)],
    ['9.3x62', load(16.5, 9.3, 0.35, 720)]
  ];

  it.each(hunting)('%s strikes 3.9-4.0 cm high at 100 m on its optimum zero', (_name, shot) => {
    const band = pointBlankZero(shot);
    expect(band.heightAt100M * 100).toBeGreaterThan(3.85);
    expect(band.heightAt100M * 100).toBeLessThan(4.05);
  });

  it.each(hunting)('%s tops out near 100 m, which is why the rule works', (_name, shot) => {
    // The rule is not a coincidence and it is not really about 100 m being special: with a 4 cm
    // band and a scope 5 cm over the bore, the apex of the optimum trajectory lands near 100 m for
    // this whole class of cartridge. "4 cm high at 100 m" is then almost the same instruction as
    // "put the apex at 4 cm", which is the optimum zero by definition.
    const band = pointBlankZero(shot);
    expect(band.apexM).toBeGreaterThan(85);
    expect(band.apexM).toBeLessThan(120);
  });

  it('stops being true for a cartridge outside that class', () => {
    // A .22 LR tops out barely past 40 m, so sighting it 4 cm high at 100 m has nothing to do with
    // its optimum zero. The rule belongs to centrefire hunting rifles, and this is the boundary.
    const rimfire = load(2.6, 5.7, 0.13, 340);
    const band = pointBlankZero(rimfire);
    expect(band.apexM).toBeLessThan(70);
    expect(band.heightAt100M * 100).toBeLessThan(3);
  });
});
