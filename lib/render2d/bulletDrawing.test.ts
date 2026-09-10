/** Reference comparisons for catalogue bullet drawings using repository SVG fixtures. */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bulletFromRecord, renderBulletDrawingSvg, type BulletRecordLike } from './bulletDrawing';
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
