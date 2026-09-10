/**
 * The generated field sets, checked for the properties the form relies on.
 *
 * The numbers themselves are the dataset's and change when it grows - pinning them would make
 * this a test of the data rather than of the generator. What is pinned is the *shape*: a family
 * has records, its working set is a subset of what it counts, and the shared core really is in
 * every family.
 */

import { describe, expect, it } from 'vitest';
import {
  designableFamilies,
  fieldSets,
  fieldsFor,
  isAngleField,
  shareOf,
  splitPath
} from './fieldsets';

describe('the generated field sets', () => {
  it('found the dataset at all', () => {
    // Guards the guard: an empty generation would make every assertion below vacuous.
    expect(designableFamilies.length).toBeGreaterThan(3);
    expect(fieldSets.records).toBeGreaterThan(400);
    expect(fieldSets.distinctFields).toBeGreaterThan(50);
  });

  it.each(designableFamilies)('%s has a working set drawn from its own records', (family) => {
    const set = fieldsFor(family);
    expect(set.records).toBeGreaterThan(0);
    expect(set.working.length).toBeGreaterThan(10);
    for (const path of set.working) {
      // Every field in the working set is one this family actually carries, often enough.
      expect(set.counts[path]).toBeGreaterThanOrEqual(set.records * fieldSets.workingSetShare);
    }
  });

  it.each(designableFamilies)('%s keeps working and rare disjoint', (family) => {
    const set = fieldsFor(family);
    const overlap = set.working.filter((path) => set.rare.includes(path));
    expect(overlap).toEqual([]);
  });

  it('has a shared core that really is in every family', () => {
    for (const path of fieldSets.shared) {
      for (const family of designableFamilies) {
        expect(fieldsFor(family).working).toContain(path);
      }
    }
  });

  it('reports how common a field is, so the form can say why one is hidden', () => {
    const rimless = fieldsFor('rimless');
    const common = rimless.working[0]!;
    expect(shareOf('rimless', common)).toBeGreaterThanOrEqual(fieldSets.workingSetShare);
    expect(shareOf('rimless', 'cartridge.nonsense.nope')).toBe(0);
    // An unknown family is empty rather than an exception: a form asks before it knows.
    expect(shareOf('not-a-family', common)).toBe(0);
    expect(fieldsFor('not-a-family').working).toEqual([]);
  });

  it('splits a path the way the form groups it', () => {
    expect(splitPath('cartridge.lengths.L3')).toEqual({
      side: 'cartridge',
      group: 'lengths',
      field: 'L3'
    });
  });

  it('knows which fields are angles, because a form cannot tell from an empty box', () => {
    // The sheets print these as degrees, minutes and seconds. Guessing from the field's name
    // would break the first time a sheet named one differently, so the dataset says which.
    expect(fieldSets.angleFields.length).toBeGreaterThan(0);
    expect(isAngleField('cartridge.junctionCone.alpha')).toBe(true);
    expect(isAngleField('cartridge.lengths.L3')).toBe(false);
  });

  it('lists only angle fields that some family actually has', () => {
    for (const path of fieldSets.angleFields) {
      const known = designableFamilies.some((family) => path in fieldsFor(family).counts);
      expect(known).toBe(true);
    }
  });

  it('offers no family whose groups repeat', () => {
    // A shot cartridge's groups are rows per hull length, which is a table and not a set of
    // fields. The designer does not offer one, and this is where that stays true.
    expect(designableFamilies).not.toContain('shotshell');
  });
});
