/**
 * The per-family field sets, as the designer reads them.
 *
 * The data is generated at build time by `scripts/build-fieldsets.mjs` from the dataset itself.
 * This file only gives it a type and a couple of accessors, so
 * that a form asks "what does a rimless cartridge have" rather than carrying its own list.
 */

import sets from './fieldsets.generated.json';

export interface FamilyFields {
  /** How many records of this family the sets were computed from. */
  records: number;
  /** Present on at least `workingSetShare` of them: the form's main body. */
  working: string[];
  /** Everything else, behind a disclosure. Rare is not the same as wrong. */
  rare: string[];
  /** How many records carry each field. What lets the form say "on 12 of 213". */
  counts: Record<string, number>;
}

export interface FieldSets {
  note: string;
  workingSetShare: number;
  records: number;
  distinctFields: number;
  /** In every family's working set. */
  shared: string[];
  /**
   * The paths that hold an angle rather than a number.
   *
   * A form cannot tell from an empty field, and guessing from the field's name would be a rule
   * that breaks the first time a sheet names one differently. So the dataset says which they are.
   */
  angleFields: string[];
  families: Record<string, FamilyFields>;
}

export const fieldSets: FieldSets = sets as FieldSets;

/** The families a cartridge can be designed as. Shot cartridges are not among them: their groups
 * repeat per hull length, which is a table rather than a set of fields, and the form does not
 * offer one. */
export const designableFamilies: string[] = Object.keys(fieldSets.families).sort();

export function fieldsFor(family: string): FamilyFields {
  return (
    fieldSets.families[family] ?? { records: 0, working: [], rare: [], counts: {} }
  );
}

/** How common a field is in its family, as a fraction. Lets the form say why something is hidden. */
export function shareOf(family: string, path: string): number {
  const family_ = fieldsFor(family);
  if (!family_.records) return 0;
  return (family_.counts[path] ?? 0) / family_.records;
}

/** True for a field the sheets print as degrees, minutes and seconds. */
export function isAngleField(path: string): boolean {
  return fieldSets.angleFields.includes(path);
}

/** `cartridge.lengths.L3` → `{ side, group, field }`, for grouping a form into sections. */
export function splitPath(path: string): { side: string; group: string; field: string } {
  const [side = '', group = '', field = ''] = path.split('.');
  return { side, group, field };
}
