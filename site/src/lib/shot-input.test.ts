import { describe, expect, it } from 'vitest';
import { parseShots } from './shot-input';

describe('target coordinate input', () => {
  it('accepts signed coordinates, whitespace and decimal commas with semicolons', () => {
    expect(parseShots('0, 0\r\n12.5 -4\n-3\t8\n1,5; -2,5\n')).toEqual({
      shots: [{ xMm: 0, yMm: 0 }, { xMm: 12.5, yMm: -4 }, { xMm: -3, yMm: 8 }, { xMm: 1.5, yMm: -2.5 }],
      invalidLines: []
    });
  });
  it('reports every malformed row alongside valid rows, including extra coordinates', () => {
    expect(parseShots('0,0\n\nwrong\n1,2,3\n;4\nInfinity,2\n1,5;2,5;3\n1,,2').invalidLines).toEqual([3, 4, 5, 6, 7, 8]);
  });
});
