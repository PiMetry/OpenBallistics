/**
 * Angles, and the two units shooters actually use.
 *
 * Everything in this module is an angle in radians until the last moment. That is not fussiness:
 * a drop is a distance, a turret is an angle, and the bug that produces confident nonsense is
 * carrying centimetres around and dividing by a range at the wrong step. Radians in, radians out,
 * and the conversion is one named function.
 *
 * Angular unit definitions:
 *
 *     1 MOA  = 1/60 degree      = 1.047 in @ 100 yd = 2.908 cm @ 100 m
 *     1 MRAD = 1 milliradian    = 3.6   in @ 100 yd = 10.0  cm @ 100 m
 *     1 MRAD = 3.438 MOA
 *
 * Note which of those are definitions and which are consequences. A MOA is a sixtieth of a degree
 * and a mrad is a thousandth of a radian; the inches and centimetres are what those work out to,
 * and are approximations. The constants below are the definitions, so nothing here inherits a
 * rounding from a table.
 */

export type AngularUnit = 'moa' | 'mrad';

/** One minute of angle, in radians. */
export const MOA = Math.PI / (180 * 60);

/** One milliradian, in radians. By definition. */
export const MRAD = 0.001;

export function radiansPer(unit: AngularUnit): number {
  return unit === 'moa' ? MOA : MRAD;
}

export function toAngularUnit(radians: number, unit: AngularUnit): number {
  return radians / radiansPer(unit);
}

export function fromAngularUnit(value: number, unit: AngularUnit): number {
  return value * radiansPer(unit);
}

/**
 * What an angle covers at a range, in the same length unit the range is given in.
 *
 * The tangent, not the small-angle approximation: they agree to well inside a millimetre at any
 * range a rifle shoots, and using the exact one costs nothing and never has to be qualified.
 */
export function subtension(radians: number, range: number): number {
  return Math.tan(radians) * range;
}

/** The angle a thing of that size covers at that range. The inverse of `subtension`. */
export function angleSubtended(size: number, range: number): number {
  if (!(range > 0)) throw new Error('range must be positive');
  return Math.atan(size / range);
}
