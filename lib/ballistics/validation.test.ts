/**
 * The release gate: this solver against a published table it had no part in producing.
 *
 * Compares the solver with published manufacturer figures using the stated ballistic coefficient,
 * muzzle velocity and conditions. Independent reference data can reveal errors that arithmetic
 * and self-consistency tests miss.
 *
 * **The load.** Federal Gold Medal 308 Win, 175 gr Sierra MatchKing, catalogue number GM308M2, as
 * published at
 * <https://www.federalpremium.com/rifle/gold-medal/gold-medal-sierra-matchking/11-GM308M2.html>
 * (retrieved 2026-09-07): muzzle velocity 2600 fps, G1 BC 0.505, sight height 1.5 in, zeroed at
 * 100 yd. The figures asserted below are Federal's, transcribed, not ours.
 *
 * **The air matters, and finding that out is half the value of this test.** Under ICAO standard
 * sea level the solver comes out 0.6 % slow at 500 yd - a disagreement that reads like a solver
 * bug. It is not: American published tables are computed in Standard Metro, which is thinner air,
 * and under it the same solver matches to 0.09 % at every range. That is why `STANDARD_METRO`
 * exists and why any comparison against a published chart has to state which air it assumed.
 *
 * The tolerances here are on the loose side of what was measured, deliberately. They are meant to
 * catch a broken constant or a lost term, not to freeze today's output: a tolerance set to the
 * current error turns a validation into a snapshot of a run of this code, which is the one thing
 * this file is not.
 */

import { describe, expect, it } from 'vitest';
import { STANDARD_METRO, STANDARD_SEA_LEVEL } from './atmosphere';
import { solve, type Shot } from './trajectory';

const YARD_M = 0.9144;
const FPS_MPS = 0.3048;
const INCH_M = 0.0254;
const MPH_MPS = 0.44704;
const GRAIN_KG = 0.00006479891;

/** Federal's own numbers for GM308M2, unaltered. */
const PUBLISHED = {
  muzzleVelocityFps: 2600,
  g1: 0.505,
  sightHeightIn: 1.5,
  zeroYd: 100,
  rangesYd: [100, 200, 300, 400, 500],
  velocityFps: [2427, 2262, 2102, 1949, 1803],
  energyFtLb: [2290, 1987, 1717, 1476, 1264],
  /** Inches of drift in a 10 mph crosswind. */
  windDriftIn: [0.6, 2.9, 6.9, 12.5, 20.3]
};

const shot = (air: typeof STANDARD_METRO): Shot => ({
  bullet: {
    massKg: 175 * GRAIN_KG,
    diameterM: 0.308 * INCH_M,
    bc: { value: PUBLISHED.g1, model: 'G1' }
  },
  muzzleVelocity: PUBLISHED.muzzleVelocityFps * FPS_MPS,
  sightHeightM: PUBLISHED.sightHeightIn * INCH_M,
  zeroDistanceM: PUBLISHED.zeroYd * YARD_M,
  air,
  wind: { speedMps: 10 * MPH_MPS, directionDeg: 90 }
});

const ranges = PUBLISHED.rangesYd.map((yd) => yd * YARD_M);

describe('against Federal’s published table for GM308M2', () => {
  const points = solve(shot(STANDARD_METRO), ranges).points;

  it.each(PUBLISHED.rangesYd.map((yd, i) => [yd, i]))(
    'matches the published velocity at %i yd to within 0.5 %%',
    (_yd, i) => {
      const fps = points[i as number]!.velocityMps / FPS_MPS;
      const published = PUBLISHED.velocityFps[i as number]!;
      expect(Math.abs(fps / published - 1)).toBeLessThan(0.005);
    }
  );

  it.each(PUBLISHED.rangesYd.map((yd, i) => [yd, i]))(
    'matches the published energy at %i yd to within 1 %%',
    (_yd, i) => {
      // Energy is velocity squared, so this is not an independent check of the physics - it is a
      // check that the mass and the joule-to-foot-pound conversion are right.
      const ftLb = points[i as number]!.energyJ / 1.3558179483314004;
      const published = PUBLISHED.energyFtLb[i as number]!;
      expect(Math.abs(ftLb / published - 1)).toBeLessThan(0.01);
    }
  );

  it.each(PUBLISHED.rangesYd.map((yd, i) => [yd, i]))(
    'matches the published 10 mph wind drift at %i yd to within 20 %% or a tenth of an inch',
    (_yd, i) => {
      // Looser, and honestly so: drift is small close in, so a chart rounded to a tenth of an
      // inch is itself worth 8 % at 100 yd. The absolute floor is what makes the near rows mean
      // anything at all.
      const inches = points[i as number]!.windageM / INCH_M;
      const published = PUBLISHED.windDriftIn[i as number]!;
      expect(Math.abs(inches - published)).toBeLessThan(Math.max(0.15, 0.2 * published));
    }
  );

  it('puts the shot on the line of sight at the published zero', () => {
    expect(points[0]!.dropM).toBeCloseTo(0, 3);
  });
});

describe('which reference air a published chart assumed is not a detail', () => {
  it('is 0.6 % out under ICAO and inside 0.2 % under Standard Metro, at 500 yd', () => {
    const far = ranges[ranges.length - 1]!;
    const published = PUBLISHED.velocityFps[PUBLISHED.velocityFps.length - 1]!;
    const icao = solve(shot(STANDARD_SEA_LEVEL), [far]).points[0]!.velocityMps / FPS_MPS;
    const metro = solve(shot(STANDARD_METRO), [far]).points[0]!.velocityMps / FPS_MPS;

    // ICAO's air is denser, so the bullet is slower: the sign matters as much as the size.
    expect(icao).toBeLessThan(metro);
    expect(published / icao - 1).toBeGreaterThan(0.003);
    expect(Math.abs(published / metro - 1)).toBeLessThan(0.002);
  });
});
