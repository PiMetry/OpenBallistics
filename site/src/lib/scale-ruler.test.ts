import { describe, expect, it } from 'vitest';
import { rulerInterval } from './scale-ruler';

describe('diagram scale ruler', () => {
  it('keeps a labelled physical interval within the viewport at every zoom', () => {
    for (const scale of [0.01, 0.2, 1, 96 / 25.4, 12, 100, 1000]) {
      for (const width of [32, 80, 120]) {
        const length = rulerInterval(scale, width);
        expect(length * scale).toBeLessThanOrEqual(width + 1e-8);
        expect(length * scale).toBeGreaterThan(width / 3);
        const leading = length / 10 ** Math.floor(Math.log10(length));
        expect([1, 2, 5]).toContain(leading);
      }
    }
  });

  it('omits uncalibrated or invisible drawings', () => {
    for (const scale of [0, -1, NaN, Infinity]) expect(rulerInterval(scale, 120)).toBe(0);
    expect(rulerInterval(4, 0)).toBe(0);
  });
});
