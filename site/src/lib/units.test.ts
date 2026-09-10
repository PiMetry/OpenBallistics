import { describe, expect, it } from 'vitest';
import { defaultUnit, displayNumber, fromCanonical, parseQuantity, toCanonical, type Unit } from './units';
describe('measurement input and conversion', () => {
  it('converts twist notation, decimal commas and imperial measurements', () => {
    expect(parseQuantity('1:8', 'in', true)).toBe(203.2);
    expect(parseQuantity('203,2', 'mm')).toBe(203.2);
    expect(toCanonical(100, 'yd')).toBe(91.44);
    expect(toCanonical(1000, 'ft/s')).toBe(304.8);
    expect(toCanonical(1, 'moa')).toBeCloseTo(Math.PI / 10.8, 12);
    expect(displayNumber(203.2, 'in')).toBe('8');
    expect(defaultUnit('length', 'imperial')).toBe('in');
    expect(defaultUnit('angle', 'metric')).toBe('mrad');
  });
  it.each(['mm', 'in', 'm', 'yd', 'm/s', 'ft/s', 'mrad', 'moa'] as Unit[])('round trips %s', unit => {
    expect(fromCanonical(toCanonical(123.456, unit), unit)).toBeCloseTo(123.456, 10);
  });
  it('distinguishes absent and invalid measurements', () => {
    expect(parseQuantity(' ', 'mm')).toBeUndefined();
    expect(displayNumber(undefined, 'in')).toBe('');
    for (const raw of ['-1', 'Infinity', '1,2,3', '8 inches', '1e999', '1:8']) expect(parseQuantity(raw, 'in')).toBeNaN();
  });
});
