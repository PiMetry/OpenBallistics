/** How a published value is written out. Nothing here rounds: CIP's precision is the product. */

import type { Angle, Value } from './types';

export function isAngle(value: Value): value is Angle {
  return typeof value === 'object' && value !== null && 'degrees' in value;
}

/** An angle the way the sheet prints it: `15°11'24"`, with the parts it does not state left off. */
export function formatAngle(angle: Angle): string {
  let out = `${angle.degrees}°`;
  if (angle.minutes) out += `${angle.minutes}′`;
  if (angle.seconds) out += `${angle.seconds}″`;
  return out;
}

/**
 * A published value as text, or `null` where the sheet is silent.
 *
 * The distinction matters more than it looks: a blank on a CIP sheet means the standard does not
 * dimension that feature, which is not the same as the feature measuring zero. Rendering an absent
 * field as `0` would state something the source does not.
 */
export function formatValue(value: Value): string | null {
  if (value === null || value === undefined) return null;
  if (isAngle(value)) return formatAngle(value);
  if (typeof value === 'number') return String(value);
  // An object that is not an angle has no printable form; saying so beats "[object Object]".
  if (typeof value === 'object') return null;
  return value;
}

/**
 * A twist length in the other unit: CIP publishes `u` in millimetres, and most of the English-
 * speaking world quotes a twist as `1:12"`. Same number, and nobody should have to convert it by
 * hand to recognise a barrel they know.
 */
export function twistInInches(millimetres: number): string {
  return `1:${(millimetres / 25.4).toFixed(2)}″`;
}

/** Field names that are a tolerance on the field before them, rather than a dimension of their own. */
export function toleranceFor(field: string): string | null {
  return field.endsWith('Tol') ? field.slice(0, -3) : null;
}
