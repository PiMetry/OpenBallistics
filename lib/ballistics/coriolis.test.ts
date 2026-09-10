/**
 * Coriolis: the signs, the size, and the refusal.
 *
 * Unlike spin drift and aerodynamic jump this is not a fit - it is `-2 Ω x v`, integrated with
 * everything else. That makes it testable against physics rather than against a published
 * approximation, which is the better kind of test: every sign here is a fact about the Earth, and
 * getting one backwards would move a 1000 m shot the wrong way by a hand's width with nothing to
 * show for it.
 *
 * The four facts pinned below, all of them checkable without a ballistics table:
 *
 * - In the northern hemisphere a shot drifts **right**, in the southern **left**, and on the
 *   equator hardly at all - and to within a millimetre at 1000 m it does so whichever way the
 *   rifle points. "Hardly" rather than "not", for a reason worth knowing: see below.
 * - Shooting **east lifts** the strike and **west drops** it (the Eötvös effect), because eastward
 *   motion adds to the Earth's own and reduces the effective gravity.
 * - Shooting **north or south** at any latitude gives no vertical Coriolis at all.
 * - Without a latitude the whole term is omitted and said to be, rather than guessed at.
 */

import { describe, expect, it } from 'vitest';
import { STANDARD_METRO } from './atmosphere';
import { EARTH_RATE, solve, type Shot } from './trajectory';

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

const at = (shot: Shot, range = 1000) => solve(shot, [range]).points[0]!;
const plain = at(match);

describe('the rotation rate is the Earth’s', () => {
  it('is one turn per sidereal day, not per solar day', () => {
    // 7.2921e-5 rad/s. Using 2π/86400 instead would be 0.3 % low, which is invisible in any single
    // test and wrong in all of them.
    expect(EARTH_RATE).toBeCloseTo((2 * Math.PI) / 86164.0905, 10);
  });
});

describe('the horizontal deflection', () => {
  it('sends the shot right in the northern hemisphere', () => {
    const north = at({ ...match, latitudeDeg: 50, azimuthDeg: 0 });
    expect(north.windageM).toBeGreaterThan(plain.windageM);
  });

  it('sends it left in the southern hemisphere, by very nearly the same amount', () => {
    const north = at({ ...match, latitudeDeg: 50, azimuthDeg: 0 });
    const south = at({ ...match, latitudeDeg: -50, azimuthDeg: 0 });
    expect(south.windageM).toBeLessThan(plain.windageM);
    // Not exactly equal and opposite: see the second-order block below for why. 1.5 mm at 1000 m.
    expect(south.windageM - plain.windageM).toBeCloseTo(-(north.windageM - plain.windageM), 2);
  });

  it('deflects to within a millimetre the same whichever way the rifle points', () => {
    // The dominant horizontal term depends on latitude alone. If it moved with azimuth by more
    // than the residue below, the rotation vector would have been assembled wrongly.
    const north = at({ ...match, latitudeDeg: 50, azimuthDeg: 0 });
    const east = at({ ...match, latitudeDeg: 50, azimuthDeg: 90 });
    const west = at({ ...match, latitudeDeg: 50, azimuthDeg: 270 });
    expect(Math.abs(east.windageM - north.windageM)).toBeLessThan(0.001);
    expect(Math.abs(west.windageM - north.windageM)).toBeLessThan(0.001);
  });

  it('is worth about a hand’s width at 1000 m at middle latitudes', () => {
    // Roughly Ω·sin(φ)·TOF²·v: a few centimetres, not a few metres. A term the size of a metre
    // would mean the factor of two, or the units, had gone astray.
    const drift = at({ ...match, latitudeDeg: 50, azimuthDeg: 0 }).windageM - plain.windageM;
    expect(drift).toBeGreaterThan(0.05);
    expect(drift).toBeLessThan(0.25);
  });
});

describe('the second-order term the usual approximations drop', () => {
  // Everyday accounts say the horizontal deflection depends only on latitude and vanishes on the
  // equator. That is the dominant term, not the whole of `-2 Ω x v`. The bullet also has a
  // *vertical* velocity, and crossed with the horizontal part of the rotation it gives a small
  // sideways force. Integrating the real expression keeps it; a closed-form fit would not.
  //
  // It is about a millimetre at 1000 m, so it changes nothing anyone dials. It is pinned because
  // it is the difference between this solver and the formula in the books, and somebody comparing
  // the two should find the answer here rather than assume a bug.

  it('deflects a shot fired north on the equator, where the simple rule says it cannot', () => {
    const equator = at({ ...match, latitudeDeg: 0, azimuthDeg: 0 });
    const residue = equator.windageM - plain.windageM;
    expect(Math.abs(residue)).toBeGreaterThan(0);
    expect(Math.abs(residue)).toBeLessThan(0.002);
  });

  it('vanishes when the rotation has no downrange component', () => {
    // Firing east on the equator, Ω lies across the line of fire, and the vertical velocity has
    // nothing to cross it into the horizontal with.
    const east = at({ ...match, latitudeDeg: 0, azimuthDeg: 90 });
    expect(east.windageM).toBeCloseTo(plain.windageM, 6);
  });
});

describe('the vertical deflection depends on which way you face', () => {
  it('lifts the shot fired east and drops the shot fired west', () => {
    const east = at({ ...match, latitudeDeg: 50, azimuthDeg: 90 });
    const west = at({ ...match, latitudeDeg: 50, azimuthDeg: 270 });
    // Less drop is a higher strike: eastward motion adds to the Earth's and lightens the bullet.
    expect(east.dropM).toBeLessThan(plain.dropM);
    expect(west.dropM).toBeGreaterThan(plain.dropM);
  });

  it('is symmetric about north, and vanishes firing north or south', () => {
    const north = at({ ...match, latitudeDeg: 50, azimuthDeg: 0 });
    const south = at({ ...match, latitudeDeg: 50, azimuthDeg: 180 });
    expect(north.dropM).toBeCloseTo(south.dropM, 4);
    const east = at({ ...match, latitudeDeg: 50, azimuthDeg: 90 });
    const west = at({ ...match, latitudeDeg: 50, azimuthDeg: 270 });
    expect(east.dropM - north.dropM).toBeCloseTo(-(west.dropM - north.dropM), 4);
  });

  it('is largest on the equator, where the rotation is entirely horizontal', () => {
    const tropics = at({ ...match, latitudeDeg: 0, azimuthDeg: 90 });
    const arctic = at({ ...match, latitudeDeg: 70, azimuthDeg: 90 });
    expect(plain.dropM - tropics.dropM).toBeGreaterThan(plain.dropM - arctic.dropM);
  });
});

describe('what it refuses to guess', () => {
  it('omits the whole term without a latitude, and says so', () => {
    const solved = solve(match, [1000]);
    expect(solved.points[0]!.windageM).toBeCloseTo(plain.windageM, 12);
    expect(solved.omitted.join(' ')).toMatch(/Coriolis: no latitude given/);
  });

  it('keeps the horizontal part without an azimuth, and names what it dropped', () => {
    const solved = solve({ ...match, latitudeDeg: 50 }, [1000]);
    // The latitude-only deflection is still there...
    expect(solved.points[0]!.windageM).toBeGreaterThan(plain.windageM);
    // ...and it matches the azimuth-known answer, because that part does not depend on azimuth.
    const known = at({ ...match, latitudeDeg: 50, azimuthDeg: 0 });
    expect(Math.abs(solved.points[0]!.windageM - known.windageM)).toBeLessThan(0.001);
    // ...but the vertical part is not invented.
    expect(solved.points[0]!.dropM).toBeCloseTo(plain.dropM, 4);
    expect(solved.omitted.join(' ')).toMatch(/vertical part of Coriolis/);
  });

  it('says nothing was omitted when nothing was', () => {
    expect(solve({ ...match, latitudeDeg: 50, azimuthDeg: 90 }, [1000]).omitted).toEqual([]);
  });
});

describe('it does not disturb what it should not', () => {
  it('leaves the zero where it was', () => {
    // The rifle was zeroed on the same Earth it is fired on, so the zero re-solves with the term
    // included and the strike at 100 m stays on the line of sight.
    const solved = solve({ ...match, latitudeDeg: 50, azimuthDeg: 90 }, [100]);
    expect(solved.points[0]!.dropM).toBeCloseTo(0, 3);
  });

  it('is small enough not to matter at short range', () => {
    const near = at({ ...match, latitudeDeg: 50, azimuthDeg: 90 }, 300);
    const nearPlain = at(match, 300);
    expect(Math.abs(near.windageM - nearPlain.windageM)).toBeLessThan(0.01);
  });
});
