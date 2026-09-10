import { readPref, writePref } from './prefs';
import type { UnitSystem } from './units';
let current = $state<UnitSystem>(readPref('units.system', ['metric', 'imperial'], 'metric'));
let currentBarrelUnit = $state<'in' | 'mm'>(readPref('units.barrel', ['in', 'mm'], 'in'));
export const unitSystem = () => current;
export const barrelUnit = () => currentBarrelUnit;
export function setUnitSystem(value: UnitSystem): void {
  current = value;
  writePref('units.system', value);
}
export function setBarrelUnit(value: 'in' | 'mm'): void {
  currentBarrelUnit = value;
  writePref('units.barrel', value);
}
