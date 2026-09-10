/** Reference comparisons for catalogue bullet drawings using repository SVG fixtures. */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bulletFromRecord, polymerInsertProfile, renderBulletDrawingSvg, type BulletRecordLike } from './bulletDrawing';
import { bulletOuterProfile } from '../shapes2d/bullet';
import type { Profile } from '../geom/profile';
import { BULLET_DRAWINGS, ROOT, compare } from '../testing/fixtures';

const RECORDS = join(ROOT, 'fixtures', 'rendering', 'bullet-records');
const DRAWINGS = BULLET_DRAWINGS;

const files = readdirSync(DRAWINGS).filter((f) => f.endsWith('.svg'));


describe('the catalogue drawing reproduces the renderer', () => {
  it('has drawings to check against', () => {
    expect(files.length).toBeGreaterThan(0);
  });
  for (const file of files) {
    const key = file.slice(0, -4);
    it(key, () => {
      const record = JSON.parse(readFileSync(join(RECORDS, `${key}.json`), 'utf8')) as BulletRecordLike & { derived?: { assumed: string[] } };
      const { bullet, assumed } = bulletFromRecord(record);
      if (record.derived) expect([...assumed].sort()).toEqual([...record.derived.assumed].sort());
      const svg = renderBulletDrawingSvg(record, bullet, { scale: 4, frame: 'landscape' });
      compare(svg, readFileSync(join(DRAWINGS!, file), 'utf8'), key);
    });
  }
});

describe("a polymer tip's insert sits inside the nose", () => {
  /** The silhouette's radius at a station, from the segments that span it. */
  function radiusAt(profile: Profile, z: number): number {
    let radius = 0;
    for (let i = 1; i < profile.length; i++) {
      const [r0, z0] = profile[i - 1]!;
      const [r1, z1] = profile[i]!;
      if (z < Math.min(z0, z1) - 1e-9 || z > Math.max(z0, z1) + 1e-9) continue;
      radius = Math.max(radius, z1 === z0 ? Math.max(r0, r1) : r0 + ((z - z0) / (z1 - z0)) * (r1 - r0));
    }
    return radius;
  }

  const record: BulletRecordLike = {
    key: 'polymer-tip',
    manufacturer: 'Design',
    name: 'polymer tip',
    diameter: 7.82,
    length: 32.7,
    bearing: 12,
    meplat: 1.27,
    base: { type: 'flat' },
    ogive: { form: 'tangent' },
    tip: { type: 'polymer' }
  };
  const { bullet } = bulletFromRecord(record);
  const profile = bulletOuterProfile(bullet);

  for (const insertLength of [0.5, 3, 8]) {
    it(`a ${insertLength} mm insert stays on the outline`, () => {
      const from = bullet.tipZ - insertLength;
      const insert = polymerInsertProfile(profile, from);
      expect(insert.length).toBeGreaterThan(1);
      // The rear face is the cut across the nose, not the shank carried forward.
      expect(insert[0]).toEqual([expect.closeTo(radiusAt(profile, from), 9), from]);
      expect(insert[0]![0]).toBeLessThan(bullet.cylinder.diameter / 2);
      for (const [r, z] of insert) expect(r).toBeLessThanOrEqual(radiusAt(profile, z) + 1e-9);
    });
  }

  it('is empty where nothing is forward of the cut', () => {
    expect(polymerInsertProfile(profile, bullet.tipZ)).toEqual([]);
  });
});
