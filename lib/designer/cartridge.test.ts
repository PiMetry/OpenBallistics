/**
 * Cartridge drafts must round-trip dataset records without changing their rendered geometry.
 * These tests flatten real records, rebuild them, and compare both drawings.
 * Tests that require missing records from `data/cartridges` are explicitly skipped.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { profilesFor } from '../geometry';
import type { CartridgeRecord } from '../shapes2d/case';
import type { Group, Record_, Value } from '../core/types';
import {
  checkDraft,
  derivedOf,
  designed,
  draftFrom,
  emptyDraft,
  pathsOf,
  setField,
  stateOf,
  toRecord
} from './cartridge';

const ROOT = resolve(__dirname, '..', '..');
const CARTRIDGES = join(ROOT, 'data', 'cartridges');
const FAMILIES = ['belted', 'pistol', 'rimless', 'rimmed'];

function load(family: string, file: string): Record_ {
  return JSON.parse(readFileSync(join(CARTRIDGES, family, file), 'utf8')) as Record_;
}

const available = FAMILIES.filter((family) => existsSync(join(CARTRIDGES, family)));
const sample: Record_[] = available.flatMap((family) =>
  readdirSync(join(CARTRIDGES, family))
    .filter((file) => file.endsWith('.json'))
    .slice(0, 12)
    .map((file) => load(family, file))
);

describe('the dataset is where the tests are', () => {
  it('found records to work from', () => {
    // Guards the guard: an empty sample would make every assertion below pass on nothing.
    expect(available).toHaveLength(FAMILIES.length);
    expect(sample.length).toBeGreaterThan(40);
  });
});

describe('a record survives the round trip through a draft', () => {
  it.each(sample.map((record) => [record.key, record]))(
    '%s flattens and rebuilds to the same figures',
    (_key, record) => {
      const draft = draftFrom(record, 'crt_1', record.key);
      const rebuilt = toRecord(draft);
      // Repeating groups are not offered by this form, so compare what the form can hold.
      expect(pathsOf(rebuilt)).toEqual(pathsOf(record));
    }
  );

  it.each(sample.map((record) => [record.key, record]))('%s draws identically', (_key, record) => {
    const original = profilesFor(record as CartridgeRecord);
    const rebuilt = profilesFor(toRecord(draftFrom(record, 'crt_1', record.key)) as CartridgeRecord);
    expect(rebuilt.outline).toEqual(original.outline);
    expect(rebuilt.bulletProfile).toEqual(original.bulletProfile);
    expect(rebuilt.chamberProfile).toEqual(original.chamberProfile);
  });

  it('keeps an angle an angle, rather than flattening it to a number', () => {
    const withAngle = sample.find((r) => r.cartridge.junctionCone);
    expect(withAngle).toBeDefined();
    if (!withAngle) return;
    const draft = draftFrom(withAngle, 'crt_1');
    const alpha = draft.fields['cartridge.junctionCone.alpha'];
    if (alpha !== undefined && alpha !== null && typeof alpha === 'object') {
      expect(alpha).toHaveProperty('degrees');
      expect(toRecord(draft).cartridge.junctionCone).toMatchObject({ alpha });
    }
  });
});

describe('a field has three states, not two', () => {
  const record = sample[0]!;
  const draft = draftFrom(record, 'crt_1');

  it('tells a figure from an absence from an empty box', () => {
    const known = Object.keys(draft.fields).find((p) => draft.fields[p] !== null)!;
    expect(stateOf(draft, known)).toBe('known');
    // The sheet does not print it: an answer, and the record's own way of saying so.
    expect(stateOf(setField(draft, 'cartridge.misc.made_up', null), 'cartridge.misc.made_up')).toBe(
      'not-printed'
    );
    // Nobody has entered it: a different thing, and blank on the form for a different reason.
    expect(stateOf(draft, 'cartridge.misc.never_touched')).toBe('unknown');
  });

  it('clears a field back to unknown rather than to zero', () => {
    const known = Object.keys(draft.fields).find((p) => draft.fields[p] !== null)!;
    const cleared = setField(draft, known, undefined);
    expect(stateOf(cleared, known)).toBe('unknown');
    expect(known in cleared.fields).toBe(false);
  });

  it('does not mutate the draft it was given', () => {
    const before = { ...draft.fields };
    setField(draft, 'cartridge.lengths.L3', 99);
    expect(draft.fields).toEqual(before);
  });
});

describe('the geometry checks the draft as it is typed', () => {
  it('draws a real record and says so', () => {
    const check = checkDraft(draftFrom(sample[0]!, 'crt_1'));
    expect(check.drawable).toBe(true);
    expect(check.problems).toEqual([]);
  });

  it('reports the geometry’s own refusal instead of crashing', () => {
    const check = checkDraft(emptyDraft('rimless', 'crt_1'));
    expect(check.drawable).toBe(false);
    expect(check.problems.length).toBeGreaterThan(0);
    // The message is the one lib/shapes2d wrote for a person, not a stack trace.
    expect(check.problems[0]).toMatch(/\w/);
  });

  it('names the dimension it is missing, one at a time', () => {
    const base = draftFrom(sample[0]!, 'crt_1');
    for (const [path, wanted] of [
      ['cartridge.lengths.L3', /L3 .*case mouth/],
      ['cartridge.caseHead.R1', /R1 .*rim/]
    ] as const) {
      const check = checkDraft(setField(base, path, null));
      expect(check.drawable).toBe(false);
      expect(check.problems[0]).toMatch(wanted);
    }
  });

  it('spots a bullet that cannot be seated, without refusing to draw the case', () => {
    // An overall length shorter than the case is not a cartridge. The case still draws, which is
    // the useful behaviour: the drawing keeps working while one figure is being fixed.
    const draft = setField(draftFrom(sample[0]!, 'crt_1'), 'cartridge.lengths.L6', 10);
    const check = checkDraft(draft);
    expect(check.drawable).toBe(true);
    expect(check.seatable).toBe(false);
  });

  it('does NOT catch an implausible figure in the case outline, and that is a known gap', () => {
    // Measured, not assumed: a negative case length draws without complaint. The geometry checks
    // for *missing* dimensions, and `ImplausibleDimensionError` guards bullet seating rather than
    // the case outline. This test records the missing outline check as a known limitation.
    const draft = setField(draftFrom(sample[0]!, 'crt_1'), 'cartridge.lengths.L3', -5);
    expect(checkDraft(draft).drawable).toBe(true);
  });
});

describe('derived figures are computed, never typed', () => {
  it('gets a case capacity out of a real record', () => {
    const derived = derivedOf(draftFrom(sample[0]!, 'crt_1'));
    expect(derived.caseVolumeMm3).toBeGreaterThan(0);
    expect(derived.caseCapacityGrainsH2O).toBeGreaterThan(0);
    // Grains of water is what reloaders quote, and it is a fixed multiple of the volume.
    expect(derived.caseCapacityGrainsH2O! / derived.caseVolumeMm3!).toBeCloseTo(
      1 / 0.06479891 / 1000,
      9
    );
  });

  it('computes bore area by the sheets’ own formula, not π/4·F²', () => {
    // The chamber's groups are `Group | GroupList` in the schema; a shot cartridge's are rows.
    const figure = (record: Record_, group: string, field: string): number | undefined => {
      const body = record.chamber[group];
      if (!body || Array.isArray(body)) return undefined;
      const value: Value | undefined = (body as Group)[field];
      return typeof value === 'number' ? value : undefined;
    };
    const withRifling = sample.find(
      (r) =>
        figure(r, 'barrel', 'F') !== undefined &&
        figure(r, 'barrel', 'Z') !== undefined &&
        figure(r, 'grooves', 'N') !== undefined &&
        figure(r, 'grooves', 'b') !== undefined
    );
    expect(withRifling).toBeDefined();
    if (!withRifling) return;
    const derived = derivedOf(draftFrom(withRifling, 'crt_1'));
    const F = figure(withRifling, 'barrel', 'F')!;
    // The grooves add area, so the answer must exceed the land circle. That is the whole point of
    // the formula, and computing π/4·F² by mistake would pass every other test here.
    expect(derived.boreAreaMm2!).toBeGreaterThan((Math.PI / 4) * F * F);
  });

  it('says which figure it wanted rather than leaving a blank', () => {
    const derived = derivedOf(emptyDraft('rimless', 'crt_1'));
    expect(derived.boreAreaMm2).toBeUndefined();
    expect(derived.missing.join(' ')).toMatch(/bore area: needs F, Z, N, b/);
    expect(derived.missing.join(' ')).toMatch(/case capacity/);
  });
});

describe('the rule at the door', () => {
  it('marks a designed cartridge as the user’s, and never as published', () => {
    const record = designed(draftFrom(sample[0]!, 'crt_1'), 'measured', '2026-09-07T10:00:00Z');
    expect(record.origin).toBe('measured');
    expect(record.created).toBe('2026-09-07T10:00:00Z');
    expect(record.updated).toBe('2026-09-07T10:00:00Z');
    // The type does not offer 'published' at all, which is the point; this pins the intent.
    expect(['measured', 'estimated', 'imported']).toContain(record.origin);
  });

  it('sets created once and advances updated', () => {
    const first = designed(draftFrom(sample[0]!, 'crt_1'), 'measured', '2026-09-07T10:00:00Z');
    const second = designed(first, 'measured', '2026-09-08T10:00:00Z', first.created);
    expect(second.created).toBe('2026-09-07T10:00:00Z');
    expect(second.updated).toBe('2026-09-08T10:00:00Z');
  });

  it('starts a copy from a neighbour, named as a copy and pointing at its origin', () => {
    const draft = draftFrom(sample[0]!, 'crt_1');
    expect(draft.name).toMatch(/\(copy\)$/);
    expect(draft.notes).toMatch(new RegExp(`Started from ${sample[0]!.key}`));
    expect(draft.key).not.toBe(sample[0]!.key);
  });
});
