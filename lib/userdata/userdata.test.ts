/**
 * Checks that personal records round-trip through an export file without losing data,
 * so users can restore their records independently of browser storage.
 */

import { describe, expect, it } from 'vitest';
import { emptyUserData, USER_DATA_FORMAT, USER_DATA_VERSION, type Gun } from './types';
import { applyMerge, parse, planMerge, serialise } from './transfer';
import { memoryStore, newId, saveGun } from './store';

const rifle = (over: Partial<Gun> = {}): Gun => ({
  id: 'rfl_1',
  name: '5" KW 9 mm',
  cartridge: {
    key: '9_mm_luger',
    snapshot: {
      name: '9 mm Luger',
      family: 'pistol',
      capturedAt: '2026-09-07',
      fields: { caseLength: 19.15, boreArea: 62.61 }
    }
  },
  barrel: { lengthMm: 127, twistMm: 250, twistHand: 'right', grooves: 6 },
  scope: { clickUnit: 'mrad', clickValue: 0.1, heightOverBoreMm: 38, zeroDistanceM: 100 },
  muzzleVelocity: { value: 338.6, unit: 'm/s', source: { kind: 'measured', date: '2026-09-07' } },
  created: '2026-09-07T10:00:00Z',
  updated: '2026-09-07T10:00:00Z',
  ...over
});

describe('the export round-trips', () => {
  it('keeps generic gun types while accepting existing v1 rifle records', () => {
    for (const kind of ['rifle', 'pistol', 'revolver', 'shotgun', 'airgun', 'other', undefined] as const) {
      const before = { ...emptyUserData(), rifles: [rifle({ kind })] };
      const result = parse(serialise(before));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.rifles[0]?.kind).toBe(kind);
    }
  });
  it('gives back exactly what went in', () => {
    const before = { ...emptyUserData('2026-09-07T12:00:00Z'), rifles: [rifle()] };
    const after = parse(serialise(before));
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.data).toEqual(before);
  });

  it('keeps a rifle whole, down to where its muzzle velocity came from', () => {
    const before = { ...emptyUserData(), rifles: [rifle()] };
    const after = parse(serialise(before));
    if (!after.ok) throw new Error(after.error);
    const got = after.data.rifles[0]!;
    expect(got.muzzleVelocity?.source.kind).toBe('measured');
    expect(got.cartridge.snapshot?.fields.boreArea).toBe(62.61);
    expect(got.barrel.twistHand).toBe('right');
  });

  it('writes the same bytes for the same data, whatever order the keys were built in', () => {
    // Two objects that differ only in insertion order must export identically, or a diff of two
    // exports shows changes that are not changes.
    const a = { ...emptyUserData('2026-09-07T12:00:00Z'), rifles: [rifle()] };
    const shuffled = JSON.parse(JSON.stringify(a)) as typeof a;
    shuffled.rifles[0] = { ...rifle(), name: '5" KW 9 mm' } as Gun;
    expect(serialise(shuffled)).toBe(serialise(a));
  });
});

describe('a designed cartridge travels in the same file', () => {
  const cartridge = {
    id: 'crt_1',
    key: 'my_wildcat',
    name: 'My wildcat',
    family: 'rimless',
    fields: { 'cartridge.lengths.L3': 41, 'cartridge.lengths.L6': null },
    annotations: { primerType: 'boxer' },
    origin: 'measured' as const,
    created: '2026-09-07T10:00:00Z',
    updated: '2026-09-07T10:00:00Z'
  };

  it('round-trips, keeping the difference between a figure and an absence', () => {
    const before = { ...emptyUserData('2026-09-07T12:00:00Z'), cartridges: [cartridge] };
    const after = parse(serialise(before));
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.data).toEqual(before);
    // `null` means the source does not print it; that is not the same as the key being gone.
    expect(after.data.cartridges[0]!.fields['cartridge.lengths.L6']).toBeNull();
    expect('cartridge.lengths.L1' in after.data.cartridges[0]!.fields).toBe(false);
  });

  it('keeps the annotations without which the record cannot be drawn', () => {
    const after = parse(serialise({ ...emptyUserData(), cartridges: [cartridge] }));
    if (!after.ok) throw new Error(after.error);
    expect(after.data.cartridges[0]!.annotations).toEqual({ primerType: 'boxer' });
  });

  it('merges by the same rule as a rifle, from the same function', () => {
    const newer = { ...cartridge, name: 'renamed', updated: '2026-09-08T10:00:00Z' };
    expect(planMerge([cartridge], [newer])[0]).toMatchObject({ action: 'update' });
    expect(planMerge([newer], [cartridge])[0]).toMatchObject({ action: 'skip' });
    expect(applyMerge([cartridge], [newer], planMerge([cartridge], [newer]))[0]!.name).toBe(
      'renamed'
    );
  });

  it('survives an export written before cartridges existed', () => {
    // A v1 file has no `cartridges` key at all. It must import as none, not as undefined.
    const old = JSON.stringify({ format: USER_DATA_FORMAT, version: USER_DATA_VERSION, rifles: [] });
    const after = parse(old);
    if (!after.ok) throw new Error(after.error);
    expect(after.data.cartridges).toEqual([]);
  });
});

describe('the importer refuses what it cannot honour', () => {
  it.each([0, -1, 0.5, 1.5])('rejects unsupported version %s', version => {
    expect(parse(JSON.stringify({ ...emptyUserData(), version }))).toMatchObject({ ok: false });
  });

  it.each([null, {}, [null], [{ id: 'broken' }]])('rejects malformed record collections: %j', rifles => {
    expect(parse(JSON.stringify({ ...emptyUserData(), rifles }))).toMatchObject({ ok: false });
  });

  it('refuses duplicate ids and broken nested fields before any merge can occur', () => {
    for (const rifles of [[rifle(), rifle()], [rifle({ barrel: null as never })], [rifle({ updated: 'not a date' })]]) {
      expect(parse(JSON.stringify({ ...emptyUserData(), rifles }))).toMatchObject({ ok: false });
    }
  });

  it('rejects a file that is not JSON', () => {
    expect(parse('not json at all')).toMatchObject({ ok: false });
  });

  it('rejects somebody else’s export', () => {
    expect(parse(JSON.stringify({ format: 'something-else', version: 1 }))).toMatchObject({
      ok: false
    });
  });

  it('refuses a newer version rather than dropping what it cannot read', () => {
    const future = JSON.stringify({
      format: USER_DATA_FORMAT,
      version: USER_DATA_VERSION + 1,
      rifles: []
    });
    const got = parse(future);
    expect(got.ok).toBe(false);
    if (got.ok) return;
    // The message has to say what to do, because this is a user holding their own backup.
    expect(got.error).toMatch(/newer version/i);
    expect(got.error).toMatch(/update/i);
  });

  it('survives an export with sections missing', () => {
    const sparse = JSON.stringify({ format: USER_DATA_FORMAT, version: USER_DATA_VERSION });
    const got = parse(sparse);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.data.rifles).toEqual([]);
    expect(got.data.settings).toEqual({});
  });
});

describe('an import says what it would do before doing it', () => {
  it('compares instants rather than timestamp spellings', () => {
    const local = rifle({ updated: '2026-09-07T10:00:00Z' });
    const older = rifle({ updated: '2026-09-07T11:00:00+02:00' });
    expect(planMerge([local], [older])[0]?.action).toBe('skip');
  });

  it('does not call different records identical just because their timestamps match', () => {
    const original = rifle();
    expect(planMerge([original], [{ ...original, name: 'different' }])[0]).toMatchObject({
      action: 'skip', reason: 'same timestamp but different content; keeping the local copy'
    });
  });

  const mine = rifle();
  const newer = rifle({ name: 'renamed', updated: '2026-09-08T10:00:00Z' });
  const older = rifle({ name: 'stale', updated: '2026-09-06T10:00:00Z' });

  it('adds what is not held', () => {
    const plan = planMerge([], [mine]);
    expect(plan[0]).toMatchObject({ action: 'add' });
  });

  it('skips an identical copy', () => {
    expect(planMerge([mine], [mine])[0]).toMatchObject({ action: 'skip' });
  });

  it('updates only from a newer file', () => {
    expect(planMerge([mine], [newer])[0]).toMatchObject({ action: 'update' });
  });

  it('does not overwrite a newer rifle with an older one', () => {
    // The failure this guards is a user importing last month's backup over this month's work.
    expect(planMerge([mine], [older])[0]).toMatchObject({ action: 'skip' });
  });

  it('applies exactly what the plan said', () => {
    const plan = planMerge([mine], [newer]);
    const after = applyMerge([mine], [newer], plan);
    expect(after).toHaveLength(1);
    expect(after[0]!.name).toBe('renamed');
  });
});

describe('the store keeps timestamps an import can trust', () => {
  it('sets created once and moves updated on every save', async () => {
    const store = memoryStore<Gun>();
    const first = await saveGun(store, rifle(), '2026-09-07T10:00:00Z');
    const second = await saveGun(store, first, '2026-09-08T10:00:00Z');
    expect(second.created).toBe('2026-09-07T10:00:00Z');
    expect(second.updated).toBe('2026-09-08T10:00:00Z');
  });

  it('advances updated, or a merge cannot tell an edit from a duplicate', async () => {
    const store = memoryStore<Gun>();
    const a = await saveGun(store, rifle(), '2026-09-07T10:00:00Z');
    const b = await saveGun(store, { ...a, name: 'renamed' }, '2026-09-08T10:00:00Z');
    expect(planMerge([a], [b])[0]).toMatchObject({ action: 'update' });
  });

  it('replaces the whole set on import', async () => {
    const store = memoryStore([rifle()]);
    await store.replaceAll([rifle({ id: 'rfl_2', name: 'other' })]);
    const all = await store.all();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe('rfl_2');
  });

  it('says it is not durable, because the user is entitled to know', () => {
    expect(memoryStore<Gun>().durable).toBe(false);
  });
});

describe('ids', () => {
  it('are unique and sort by creation', () => {
    const early = newId('rfl', 1_000_000_000_000, () => 0.1);
    const later = newId('rfl', 1_000_000_001_000, () => 0.1);
    expect(early).not.toBe(later);
    expect([later, early].sort()).toEqual([early, later]);
  });
});
