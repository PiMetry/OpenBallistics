/** Display conversions; records retain canonical mm, m, m/s and mrad values. */
export type UnitSystem = 'metric' | 'imperial';
export type Quantity = 'length' | 'distance' | 'velocity' | 'angle';
export const UNITS = {
  length: ['mm', 'in'], distance: ['m', 'yd'], velocity: ['m/s', 'ft/s'], angle: ['mrad', 'moa']
} as const;
export type Unit = (typeof UNITS)[Quantity][number];
const FACTOR: Record<Unit, number> = { mm: 1, in: 25.4, m: 1, yd: 0.9144, 'm/s': 1, 'ft/s': 0.3048, mrad: 1, moa: Math.PI / 10.8 };
export const defaultUnit = (quantity: Quantity, system: UnitSystem): Unit => UNITS[quantity][system === 'metric' ? 0 : 1];
export const fromCanonical = (value: number, unit: Unit): number => value / FACTOR[unit];
export const toCanonical = (value: number, unit: Unit): number => value * FACTOR[unit];
export const displayNumber = (value: number | undefined, unit: Unit): string =>
  value === undefined ? '' : String(Number(fromCanonical(value, unit).toPrecision(12)));

export function parseQuantity(raw: string, unit: Unit, twist = false): number | undefined {
  const text = (twist ? raw.replace(/^\s*1\s*:\s*/, '') : raw).trim().replace(',', '.');
  if (!text) return undefined;
  if (!/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return NaN;
  const value = toCanonical(Number(text), unit);
  return Number.isFinite(value) ? value : NaN;
}
