import { describe, expect, it } from 'vitest';
import { calibrate, pixelToShot, suggestHoles } from './target-image';
import { BDS_25M_HANDGUN, scoreGroup } from '@lib/targets';
describe('target photo calibration and suggestions', () => {
  it('uses a ring radius and flips image y into target coordinates', () => {
    const c = calibrate({ x: 200, y: 150 }, { x: 230, y: 190 }, 50)!;
    expect(c.pixelsPerMm).toBe(2);
    expect(pixelToShot({ x: 220, y: 130 }, c)).toEqual({ xMm: 10, yMm: 10 });
    expect(scoreGroup(BDS_25M_HANDGUN, [pixelToShot({ x: 200, y: 150 }, c)], 9).total).toBe(10);
  });
  it('rejects missing, coincident and invalid calibration', () => {
    for (const diameter of [0, -1, NaN, Infinity]) expect(calibrate({ x: 0, y: 0 }, { x: 50, y: 0 }, diameter)).toBeUndefined();
    expect(calibrate({ x: 0, y: 0 }, { x: 0, y: 0 }, 50)).toBeUndefined();
    expect(calibrate({ x: NaN, y: 0 }, { x: 50, y: 0 }, 50)).toBeUndefined();
  });
  const c = calibrate({ x: 60, y: 60 }, { x: 110, y: 60 }, 100)!;
  function photo(background: number, hole: number, withHoles: boolean) {
    const data = new Uint8ClampedArray(120 * 120 * 4);
    for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) {
      const value = withHoles && [40, 80].some(cx => Math.hypot(x - cx, y - 60) <= 5) ? hole : background;
      data.set([value, value, value, 255], (y * 120 + x) * 4);
    }
    return data;
  }
  it.each([[240, 20], [20, 240]])('suggests isolated contrasting holes on background %s', (background, hole) => {
    const result = suggestHoles(photo(background, hole, true), 120, 120, c, 10, 100);
    expect(result).toHaveLength(2);
    for (const x of [40, 80]) expect(result.some(p => Math.hypot(p.x - x, p.y - 60) < 3)).toBe(true);
  });
  it('does not invent holes on a uniform or transparent image', () => {
    expect(suggestHoles(photo(200, 0, false), 120, 120, c, 10, 100)).toEqual([]);
    expect(suggestHoles(new Uint8ClampedArray(120 * 120 * 4), 120, 120, c, 10, 100)).toEqual([]);
    expect(suggestHoles(new Uint8ClampedArray(0), 120, 120, c, 10, 100)).toEqual([]);
  });
  it('rejects a straight dark edge', () => {
    const data = photo(240, 0, false);
    for (let y = 0; y < 120; y++) for (let x = 0; x < 60; x++) data.set([20, 20, 20, 255], (y * 120 + x) * 4);
    expect(suggestHoles(data, 120, 120, c, 10, 100)).toEqual([]);
  });
  it('does not identify a thin circular ring as a series of holes', () => {
    const data = photo(240, 0, false);
    for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) {
      if (Math.abs(Math.hypot(x - 60, y - 60) - 40) < 1) data.set([20,20,20,255], (y * 120 + x) * 4);
    }
    expect(suggestHoles(data, 120, 120, c, 10, 100)).toEqual([]);
  });
});
