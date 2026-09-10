/** Rendering comparisons use fixed SVG fixtures held in this repository. */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repository root, shared by the data and rendering fixtures. */
export const ROOT = join(HERE, '..', '..');
export const DATA = join(ROOT, 'data');
export const CARTRIDGES = join(DATA, 'cartridges');

export const SAMPLES = join(ROOT, 'fixtures', 'rendering', 'samples');
export const BULLET_DRAWINGS = join(ROOT, 'fixtures', 'rendering', 'bullets');
/** The fixed half-profiles the geometry is checked against, one per cartridge record. */
export const PROFILES = join(ROOT, 'fixtures', 'profiles');

const NUMBER = /-?\d+(?:\.\d+)?(?:e-?\d+)?/g;
const TOLERANCE = 1e-4;

/**
 * Compare a rendered drawing with its stored fixture.
 *
 * The markup with every number blanked must match exactly - same elements, same attributes, same
 * order, same colours - and every number must agree within a ten-thousandth of a user unit, which
 * is a hundred-thousandth of a millimetre at the scale the samples are drawn to.
 * The tolerance allows differences in the last digits of floating-point formatting.
 */
export function compare(actual: string, expected: string, what: string): void {
  const skeletonA = actual.replace(NUMBER, '#');
  const skeletonE = expected.replace(NUMBER, '#');
  if (skeletonA !== skeletonE) {
    let at = 0;
    while (at < skeletonA.length && skeletonA[at] === skeletonE[at]) at++;
    throw new Error(
      `${what}: markup differs at ${at}:\n  actual:   ${skeletonA.slice(Math.max(0, at - 80), at + 100)}\n  fixture:  ${skeletonE.slice(Math.max(0, at - 80), at + 100)}`
    );
  }
  const numbersA = actual.match(NUMBER) ?? [];
  const numbersE = expected.match(NUMBER) ?? [];
  expect(numbersA.length).toBe(numbersE.length);
  for (let i = 0; i < numbersE.length; i++) {
    const a = Number(numbersA[i]), e = Number(numbersE[i]);
    if (Math.abs(a - e) > TOLERANCE) {
      const at = actual.indexOf(numbersA[i]!);
      throw new Error(`${what}: number ${i} is ${a}, fixture has ${e}, near: ${actual.slice(Math.max(0, at - 80), at + 40)}`);
    }
  }
}
