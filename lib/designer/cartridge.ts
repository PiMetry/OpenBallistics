/**
 * The cartridge designer's model, independent of the UI.
 * Dimensions come from published drawings, existing records or measurements.
 * Drafts preserve explicit `null` values separately from omitted fields; `stateOf`
 * interprets that distinction. Geometry uses the same implementation as the catalogue.
 */

import type { Angle, Group, Record_, Value } from '../core/types';
import { adaptMetallic, GRAINS_H2O_PER_MM3, type CartridgeRecord } from '../shapes2d/case';
import { caseInnerProfile, revolvedVolume } from '../measure2d/interior';
import { profilesFor } from '../geometry';

/** A field path: `cartridge.<group>.<field>` or `chamber.<group>.<field>`. */
export type FieldPath = string;

export interface CartridgeDraft {
  readonly id: string;
  /** The key a record would be filed under. The user's own, and not checked against the dataset. */
  readonly key: string;
  readonly name: string;
  readonly family: string;
  /**
   * The figures, by path. A `null` means **the sheet does not print it**; a path that is absent
   * means **nobody has entered it yet**. Those are different and the form must show them
   * differently.
   */
  readonly fields: Readonly<Record<FieldPath, Value>>;
  /**
   * The dataset's own annotations, carried through unchanged.
   *
   * Not decoration: `primerType` is *required* to draw a centrefire case at all, and
   * `defaultBulletShape` decides the seated bullet. A draft that dropped these would flatten and
   * rebuild a record that the geometry then refused to draw - which is exactly what the
   * round-trip test caught the first time this model was written without them.
   */
  readonly annotations?: Record_['annotations'];
  /** Where the numbers came from. A designed cartridge without one stays the user's own. */
  readonly source?: {
    readonly publisher?: string;
    readonly url?: string;
    readonly retrieved?: string;
  };
  readonly notes?: string;
}

export type FieldState = 'known' | 'not-printed' | 'unknown';

/** What the form should show for a field: a value, an explicit absence, or an empty box. */
export function stateOf(draft: CartridgeDraft, path: FieldPath): FieldState {
  if (!(path in draft.fields)) return 'unknown';
  return draft.fields[path] === null ? 'not-printed' : 'known';
}

/** An angle field, which the sheets print as degrees/minutes/seconds rather than a decimal. */
export const isAngle = (value: Value | undefined): value is Angle =>
  typeof value === 'object' && value !== null && 'degrees' in value;

/** Flatten a record's two sides into field paths. Repeating groups are not offered by this form. */
export function pathsOf(record: Pick<Record_, 'cartridge' | 'chamber'>): Record<FieldPath, Value> {
  const out: Record<FieldPath, Value> = {};
  for (const side of ['cartridge', 'chamber'] as const) {
    for (const [group, body] of Object.entries(record[side] ?? {})) {
      // A shot cartridge's rows are a table, not a set of fields; skipped rather than mangled.
      if (Array.isArray(body)) continue;
      for (const [field, value] of Object.entries(body as Group)) {
        out[`${side}.${group}.${field}`] = value;
      }
    }
  }
  return out;
}

/** Start from a neighbour: the dataset has hundreds, and an empty form has none. */
export function draftFrom(record: Record_, id: string, key = `${record.key}_mine`): CartridgeDraft {
  return {
    id,
    key,
    name: `${record.name} (copy)`,
    family: record.family,
    fields: pathsOf(record),
    annotations: record.annotations,
    notes: `Started from ${record.key}.`
  };
}

/**
 * An empty draft of a family. Every field is unknown, which is what an empty form means.
 *
 * The primer type is the exception: a centrefire case cannot be drawn without one, so a form that
 * left it unset would show a refusal before the user had typed anything wrong. Boxer is the
 * overwhelming default and it is a choice the form must offer rather than hide.
 */
export function emptyDraft(
  family: string,
  id: string,
  key = 'new_cartridge',
  primerType = 'boxer'
): CartridgeDraft {
  return { id, key, name: '', family, fields: {}, annotations: { primerType } };
}

/** Set one figure, or mark it as not printed (`null`), or clear it back to unknown. */
export function setField(
  draft: CartridgeDraft,
  path: FieldPath,
  value: Value | undefined
): CartridgeDraft {
  const fields = { ...draft.fields };
  if (value === undefined) delete fields[path];
  else fields[path] = value;
  return { ...draft, fields };
}

/**
 * Build the record shape the geometry expects.
 *
 * The inverse of `pathsOf`, and the tests hold them against each other: a record flattened and
 * rebuilt must be the record it started as, or the designer is quietly editing what it draws.
 */
export function toRecord(draft: CartridgeDraft): Record_ {
  const record: Record_ = {
    key: draft.key,
    name: draft.name,
    family: draft.family,
    cartridge: {},
    chamber: {},
    ...(draft.annotations ? { annotations: draft.annotations } : {})
  };
  for (const [path, value] of Object.entries(draft.fields)) {
    const [side, group, field] = path.split('.') as ['cartridge' | 'chamber', string, string];
    if (!side || !group || !field) continue;
    const groups = record[side] as Record<string, Group>;
    groups[group] ??= {};
    groups[group]![field] = value;
  }
  return record;
}

export interface DraftCheck {
  /** True when the geometry could build a case outline from these figures. */
  readonly drawable: boolean;
  /** What the geometry refused, in its own words. Guidance, not a crash. */
  readonly problems: readonly string[];
  /** True when a seated bullet could be placed, which needs L6 and a projectile group. */
  readonly seatable: boolean;
}

/**
 * Run the real geometry over the draft and report what it said.
 *
 * `lib/shapes2d` already throws `MissingDimensionError` and `ImplausibleDimensionError` with
 * messages written for a person. Surfacing them as the user types turns a crash into guidance,
 * and it means the designer's idea of a valid cartridge is the catalogue's idea, not a second
 * one that can drift from it.
 */
export function checkDraft(draft: CartridgeDraft): DraftCheck {
  const problems: string[] = [];
  let drawable = false;
  let seatable = false;
  try {
    const profiles = profilesFor(toRecord(draft) as CartridgeRecord);
    drawable = profiles.outline.length > 1;
    seatable = profiles.bullet !== null;
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  return { drawable, problems, seatable };
}

export interface Derived {
  /** The powder space, from the interior profile. Cubic millimetres. */
  readonly caseVolumeMm3?: number;
  /** The same, in the grains of water reloaders quote. */
  readonly caseCapacityGrainsH2O?: number;
  /**
   * Effective bore area: `π/4·F² + N·b·(Z-F)/2`, the CIP sheets' own formula.
   *
   * Land area plus the groove area, which is why a bore is not simply `π/4·F²`.
   */
  readonly boreAreaMm2?: number;
  /** Why a figure is missing, when it is. Never a silent absence. */
  readonly missing: readonly string[];
}

const asNumber = (value: Value | undefined): number | undefined =>
  typeof value === 'number' ? value : undefined;

/**
 * Derived values are computed from the draft rather than entered directly.
 * Each unavailable result identifies the input figures needed to compute it.
 */
export function derivedOf(draft: CartridgeDraft): Derived {
  const missing: string[] = [];
  let caseVolumeMm3: number | undefined;
  let caseCapacityGrainsH2O: number | undefined;
  try {
    const inner = caseInnerProfile(adaptMetallic(toRecord(draft) as CartridgeRecord));
    caseVolumeMm3 = revolvedVolume(inner);
    caseCapacityGrainsH2O = caseVolumeMm3 * GRAINS_H2O_PER_MM3;
  } catch (error) {
    missing.push(
      `case capacity: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const F = asNumber(draft.fields['chamber.barrel.F']);
  const Z = asNumber(draft.fields['chamber.barrel.Z']);
  const N = asNumber(draft.fields['chamber.grooves.N']);
  const b = asNumber(draft.fields['chamber.grooves.b']);
  let boreAreaMm2: number | undefined;
  if (F !== undefined && Z !== undefined && N !== undefined && b !== undefined) {
    boreAreaMm2 = (Math.PI / 4) * F * F + (N * b * (Z - F)) / 2;
  } else {
    const wanted = (['F', 'Z', 'N', 'b'] as const).filter(
      (name, i) => [F, Z, N, b][i] === undefined
    );
    missing.push(`bore area: needs ${wanted.join(', ')} from the chamber's barrel and grooves`);
  }

  return { caseVolumeMm3, caseCapacityGrainsH2O, boreAreaMm2, missing };
}

/** The shape a designed cartridge is stored as. It is the user's, and it says so. */
export interface DesignedCartridge extends CartridgeDraft {
  /**
   * How the figures were obtained. Saving a designed cartridge does not make it
   * published reference data, so `published` is not a permitted origin.
   */
  readonly origin: 'measured' | 'estimated' | 'imported';
  readonly created: string;
  readonly updated: string;
}

export function designed(
  draft: CartridgeDraft,
  origin: DesignedCartridge['origin'],
  now = new Date().toISOString(),
  created?: string
): DesignedCartridge {
  return { ...draft, origin, created: created ?? now, updated: now };
}
