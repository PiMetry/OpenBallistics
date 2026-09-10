/**
 * The order figures are shown in, and what the sheets write them as.
 *
 * Framework-free. The ordering is a property of the C.I.P. sheets rather than of the page, and
 * the labels are the sheets' own notation - `e min`, `r1 max`, the Greek letters - which reads
 * the same in every language.
 *
 * `orderedGroups` is deliberately *not* here: it pairs each group with its heading in the
 * reader's language, so it needs the i18n store. It lives in `site/src/lib/fields.ts`, with
 * `groupTitle`.
 */

/** Field order within a group, keyed by `<side>.<group>`. */
const FIELD_ORDER: Record<string, string[]> = {
  'cartridge.lengths': ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'],
  'cartridge.caseHead': ['R', 'R1', 'R2', 'R3', 'E', 'E1', 'eMin', 'delta', 'f', 'beta', 'r0'],
  'cartridge.powderChamber': ['P0', 'P1', 'P2'],
  'cartridge.junctionCone': ['alpha', 'S', 'r1Min', 'r2'],
  'cartridge.collar': ['H1', 'H2'],
  'cartridge.projectile': ['G1', 'G2', 'F', 'L1PlusG', 'L3PlusG'],
  'cartridge.pressures': ['Pmax', 'PK', 'PE', 'EE', 'EK', 'Emax', 'M'],
  'cartridge.misc': ['Fe', 'deltaL'],
  'cartridge.dimensions': ['d', 'd2', 'g', 't', 'h', 'l1', 'l2', 'alpha'],

  'chamber.lengths': ['L0', 'L1', 'L2', 'L3'],
  'chamber.breech': ['R', 'R1', 'R2', 'R3', 'r'],
  'chamber.powderChamber': ['E', 'P0', 'P1', 'P2'],
  'chamber.junctionCone': ['alpha', 'S', 'r1Max', 'r2'],
  'chamber.collar': ['H1', 'H2'],
  'chamber.rifling': ['G1', 'G', 'alpha1', 'h', 's', 'i', 'w'],
  'chamber.barrel': ['F', 'Z'],
  'chamber.grooves': ['b', 'N', 'u', 'Q'],
  'chamber.dimensions': ['D', 'D1', 'B', 'G', 'H', 'T', 'alpha1'],
  'chamber.headspace': ['Fe', 'FeBascule', 'FeAutomatic'],
  // The repeating groups of a shot cartridge, one row per published length.
  'cartridge.lengths.list': ['marking', 'l', 'tol'],
  'chamber.chamberLengths': ['marking', 'L', 'tol', 'M', 'Pmax', 'PK', 'PE']
};

/** Group order per side, and the heading the sheet gives each one. */
/** Group order per side. The heading each one gets is `groupTitle`, in the reader's language. */
export const GROUP_ORDER: Record<'cartridge' | 'chamber', string[]> = {
  cartridge: ['lengths', 'dimensions', 'caseHead', 'powderChamber', 'junctionCone', 'collar', 'projectile', 'pressures', 'misc'],
  chamber: ['lengths', 'dimensions', 'breech', 'powderChamber', 'junctionCone', 'collar', 'chamberLengths', 'rifling', 'headspace', 'barrel', 'grooves']
};

/** How a field is written on the sheet, where that differs from its JSON name. */
export const FIELD_LABELS: Record<string, string> = {
  eMin: 'e min',
  marking: 'Marking',
  tol: 'Tol.',
  r1Min: 'r1 min',
  r1Max: 'r1 max',
  delta: 'δ',
  alpha: 'α',
  alpha1: 'α1',
  beta: 'β',
  deltaL: 'delta L',
  L3PlusG: 'L3 + G',
  L1PlusG: 'L1 + G',
  FeBascule: 'Fe (bascule)',
  FeAutomatic: 'Fe (automatic)'
};

/** The unit a field is published in, where it is not millimetres. */
export const FIELD_UNITS: Record<string, string> = {
  marking: '',
  tol: '',
  Pmax: 'bar',
  PK: 'bar',
  PE: 'bar',
  EE: 'J',
  EK: 'J',
  Emax: 'J',
  M: 'g',
  Q: 'mm²',
  N: '',
  alpha: '',
  alpha1: '',
  beta: '',
  delta: '',
  i: ''
};

/** The columns of a repeating group, in the order the tables print them, unnamed ones last. */
export function orderedColumns(side: string, group: string, rows: Record<string, unknown>[]): string[] {
  const present = new Set(rows.flatMap((row) => Object.keys(row)));
  const order = FIELD_ORDER[`${side}.${group}.list`] ?? FIELD_ORDER[`${side}.${group}`] ?? [];
  const known = order.filter((field) => present.has(field));
  const placed = new Set(known);
  const rest = [...present].filter((field) => !placed.has(field)).sort();
  return [...known, ...rest];
}

export function orderedFields(side: string, group: string, fields: Record<string, unknown>): string[] {
  const order = FIELD_ORDER[`${side}.${group}`] ?? [];
  const known = order.filter((field) => field in fields);
  const placed = new Set(known);
  // A tolerance is shown beside the dimension it belongs to, never as a row of its own.
  const rest = Object.keys(fields)
    .filter((field) => !placed.has(field) && !field.endsWith('Tol'))
    .sort();
  return [...known, ...rest];
}
