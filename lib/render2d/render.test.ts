/** Reference comparisons for the coloured faces, using repository SVG fixtures. */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Profile } from '../geom';
import { profilesFor } from '../geometry/index';
import { type CartridgeRecord } from '../shapes2d';
import { type Frame } from '../geom/svg';
import { renderChamberVisualSvg, renderVisualSvg } from './render';
import { CARTRIDGES, SAMPLES, compare } from '../testing/fixtures';

const FAMILIES = ['rimless', 'rimmed', 'belted', 'pistol', 'rimfire'];

function hasMetallicRecord(key: string): boolean {
  return FAMILIES.some((family) => existsSync(join(CARTRIDGES, family, `${key}.json`)));
}

function recordFor(key: string): CartridgeRecord {
  for (const family of FAMILIES) {
    const path = join(CARTRIDGES, family, `${key}.json`);
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as CartridgeRecord;
  }
  throw new Error(`no record for ${key}`);
}


// The coloured faces of the metallic samples; the drawings with their faces and the shot
// cartridges are `drawing.test.ts`'s.
const samples = readdirSync(SAMPLES).filter((f) => f.endsWith('.svg') && !f.includes('.drawing.') && !f.includes('.chamber-drawing.') && !f.includes('.table.') && hasMetallicRecord(f.split('.')[0]!));

describe('the rendered face reproduces the renderer', () => {
  it('has samples to check against', () => {
    expect(samples.length).toBeGreaterThan(10);
  });
  for (const file of samples) {
    const parts = file.slice(0, -4).split('.');
    const key = parts[0]!;
    const frame = parts[parts.length - 1] as Frame;
    const chamber = parts.length === 3 && parts[1] === 'chamber';
    it(`${key} ${chamber ? 'chamber ' : ''}${frame}`, () => {
      const record = recordFor(key);
      const p = profilesFor(record);
      const svg = chamber
        ? renderChamberVisualSvg(key, record.name, p.chamberProfile as Profile, { scale: 4, frame })
        : renderVisualSvg(p.case, p.outline, p.bullet, p.exposed, { scale: 4, frame });
      compare(svg, readFileSync(join(SAMPLES!, file), 'utf8'), `${key} ${frame}`);
    });
  }
});
