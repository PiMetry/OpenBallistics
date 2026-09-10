import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bulletFromRecord, liveBulletDrawing } from '@lib/render2d';
import { bullets, cartridgesFor } from './bullets';
import { entries } from './data';
import type { BulletRecord } from './bullets';

const directory = resolve(import.meta.dirname, '../../../data/bullets');
const files = readdirSync(directory).filter(file => file.endsWith('.json'));
const records = files.map(file => JSON.parse(readFileSync(resolve(directory, file), 'utf8')) as BulletRecord);

describe('sample bullet catalogue', () => {
  it('ships three explicitly marked samples for each of 25 calibers, with no published sources', () => {
    expect(records).toHaveLength(75);
    expect(bullets).toHaveLength(records.length);
    const counts = new Map<string, number>();
    for (const record of records) {
      expect(record.sample).toBe(true);
      expect(record.key).toMatch(/^sample_/);
      expect(record.name).toContain('Sample');
      expect(record.sources).toEqual([]);
      expect(record.notes).toContain('Synthetic');
      counts.set(record.calibre, (counts.get(record.calibre) ?? 0) + 1);
      const indexed = bullets.find(b => b.key === record.key)!;
      expect(indexed.sample).toBe(true);
      expect(cartridgesFor(indexed, entries).map(e => e.key)).toContain(record.sampleFor);
    }
    expect(counts.size).toBe(25);
    expect([...counts.values()].every(count => count === 3)).toBe(true);
  });

  it.each(records.map(record => [record.key, record] as const))('%s renders finite geometry in both styles', (_, record) => {
    const { bullet, assumed } = bulletFromRecord(record);
    expect(assumed).toEqual(record.derived.assumed);
    expect(bullet.length).toBeGreaterThan(0);
    for (const style of ['visual', 'technical'] as const) {
      for (const dimensions of [false, true]) {
        const drawing = liveBulletDrawing(record, bullet, { style, dimensions });
        expect(drawing.markup).not.toMatch(/NaN|Infinity/);
        expect(drawing.widthMm).toBeGreaterThan(0);
        expect(drawing.heightMm).toBeGreaterThan(0);
        const index = bullets.find(b => b.key === record.key)!;
        const size = dimensions ? index.svg : index.tight;
        expect(size?.[0]).toBeCloseTo(drawing.widthMm, 3);
        expect(size?.[1]).toBeCloseTo(drawing.heightMm, 3);
      }
    }
  });
});
