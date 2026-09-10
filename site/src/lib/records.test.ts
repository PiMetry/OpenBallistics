/**
 * The path a user actually hits when their browser says no.
 *
 * The app keeps working for the session when storage is refused,
 * and *says so*. Node has no `indexedDB`, so a plain test run is that refusal - which makes the
 * degraded path the one this file exercises by default rather than the one nobody ever runs.
 */

import { describe, expect, it } from 'vitest';
import * as rifles from './records.svelte';

const draft = (over: Record<string, unknown> = {}) => ({
  id: 'rfl_1',
  name: 'test',
  cartridge: { key: '9_mm_luger' },
  barrel: { lengthMm: 127 },
  ...over
});

describe('rifles, with no database to be had', () => {
  it('waits for startup before saving a record', async () => {
    const loading = rifles.load();
    await Promise.all([loading, rifles.save(draft({ id: 'early' }))]);
    expect(rifles.state.rifles.map(r => r.id)).toEqual(['early']);
  });

  it('rejects a stale import preview instead of overwriting edits made after it', async () => {
    await rifles.load();
    await rifles.save(draft());
    const plan = rifles.preview(rifles.exportAll());
    if (!plan.ok) throw new Error(plan.error);
    await rifles.save(draft({ name: 'changed after preview' }));
    await expect(plan.apply()).rejects.toThrow(/changed after this preview/);
    expect(rifles.state.rifles[0]?.name).toBe('changed after preview');
  });

  it('does not silently discard unsupported backup sections', async () => {
    await rifles.load();
    const data = JSON.parse(rifles.exportAll());
    data.sessions = [{ notes: 'keep me' }];
    expect(rifles.preview(JSON.stringify(data))).toMatchObject({ ok: false });
  });

  it('loads instead of throwing, and admits it is not durable', async () => {
    await rifles.load();
    expect(rifles.state.ready).toBe(true);
    expect(rifles.state.durable).toBe(false);
  });

  it('still saves, edits and removes for the session', async () => {
    await rifles.load();
    const saved = await rifles.save(draft());
    expect(rifles.state.rifles).toHaveLength(1);
    expect(saved.created).toBeTruthy();

    await rifles.save({ ...saved, name: 'renamed' });
    expect(rifles.state.rifles).toHaveLength(1);
    expect(rifles.state.rifles[0]!.name).toBe('renamed');

    await rifles.remove('rfl_1');
    expect(rifles.state.rifles).toEqual([]);
  });

  it('exports what is held, and the export reads back', async () => {
    await rifles.load();
    await rifles.save(draft({ id: 'rfl_2', name: 'keeper' }));
    const file = rifles.exportAll('abc123');

    await rifles.load(); // as if the tab had been closed and the data lost
    expect(rifles.state.rifles).toEqual([]);

    const plan = rifles.preview(file);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.plan).toMatchObject([{ action: 'add', name: 'keeper' }]);
    await plan.apply();
    expect(rifles.state.rifles[0]!.name).toBe('keeper');
  });

  it('keeps designed cartridges too, and carries them in the export', async () => {
    // The export is the backup. One that quietly left the user's own cartridges behind would be
    // worse than none, because it would look like one.
    await rifles.load();
    await rifles.saveCartridge({
      id: 'crt_1',
      key: 'my_wildcat',
      name: 'My wildcat',
      family: 'rimless',
      fields: { 'cartridge.lengths.L3': 41 },
      origin: 'measured',
      created: '2026-09-07T10:00:00Z',
      updated: '2026-09-07T10:00:00Z'
    });
    expect(rifles.state.cartridges).toHaveLength(1);

    const file = rifles.exportAll();
    await rifles.load(); // as if the tab had been closed and the data lost
    expect(rifles.state.cartridges).toEqual([]);

    const plan = rifles.preview(file);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.cartridgePlan).toMatchObject([{ action: 'add', name: 'My wildcat' }]);
    await plan.apply();
    expect(rifles.state.cartridges[0]!.key).toBe('my_wildcat');

    await rifles.removeCartridge('crt_1');
    expect(rifles.state.cartridges).toEqual([]);
  });

  it('keeps a reticle the user measured off their own scope', async () => {
    await rifles.load();
    await rifles.saveReticle({
      id: 'ret_1',
      name: 'My 5-25 at 25x',
      focalPlane: 'SFP',
      ratedMagnification: 25,
      unit: 'mrad',
      marks: [{ kind: 'dot', x: 1, y: 0, diameter: 0.2 }],
      origin: 'measured',
      created: '2026-09-07T10:00:00Z',
      updated: '2026-09-07T10:00:00Z'
    });
    expect(rifles.state.reticles[0]!.ratedMagnification).toBe(25);

    const file = rifles.exportAll();
    await rifles.load();
    const plan = rifles.preview(file);
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.reticlePlan).toMatchObject([{ action: 'add' }]);
    await plan.apply();
    // The marks survive: a reticle without its geometry is not a reticle.
    expect(rifles.state.reticles[0]!.marks).toHaveLength(1);

    await rifles.removeReticle('ret_1');
    expect(rifles.state.reticles).toEqual([]);
  });

  it('keeps a target face the user drew, with no source to mistake for a rulebook', async () => {
    await rifles.load();
    await rifles.saveTargetFace({
      id: 'tgt_1',
      name: 'Club 100 m',
      distanceM: 100,
      rings: [
        { score: 10, diameterMm: 50 },
        { score: 9, diameterMm: 100 }
      ],
      cardMm: { width: 200, height: 200 },
      origin: 'measured',
      created: '2026-09-07T10:00:00Z',
      updated: '2026-09-07T10:00:00Z'
    });

    const file = rifles.exportAll();
    await rifles.load();
    const plan = rifles.preview(file);
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.facePlan).toMatchObject([{ action: 'add', name: 'Club 100 m' }]);
    await plan.apply();

    const face = rifles.state.targetFaces[0]!;
    expect(face.rings).toHaveLength(2);
    // The type has no `source` at all, so a user's face can never appear to cite a rulebook.
    expect('source' in face).toBe(false);

    await rifles.removeTargetFace('tgt_1');
    expect(rifles.state.targetFaces).toEqual([]);
  });

  it('reports a bad file rather than importing nothing quietly', async () => {
    await rifles.load();
    expect(rifles.preview('{')).toMatchObject({ ok: false });
  });
});
