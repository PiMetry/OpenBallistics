/** Reference comparisons for combined drawings, outlines and dimensions using repository SVG fixtures. */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { liveChamberDrawing, liveDrawing, renderChamberDrawingSvg, renderDrawingSvg, renderTechnicalSvg } from './drawing';
import { profilesFor } from '../geometry/index';
import { caseInnerProfile } from '../measure2d';
import { bulletOuterProfile, type CartridgeRecord } from '../shapes2d';
import { viewportFor, type Frame } from '../geom/svg';
import { sectionParts } from './render';
import { adaptShotshell, renderShotshellVisualSvg, type ShotshellRecord } from '../shapes2d/shotshell';
import { chamberRecordFacts } from './technical';
import { CARTRIDGES, SAMPLES, compare } from '../testing/fixtures';

const FAMILIES = ['rimless', 'rimmed', 'belted', 'pistol', 'rimfire', 'shotshell'];

function recordFor(key: string): CartridgeRecord | ShotshellRecord {
  for (const family of FAMILIES) {
    const path = join(CARTRIDGES, family, `${key}.json`);
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as CartridgeRecord | ShotshellRecord;
  }
  throw new Error(`no record for ${key}`);
}


const samples = readdirSync(SAMPLES).filter((f) => f.endsWith('.svg'));

describe('the drawing with its faces reproduces the renderer', () => {
  const drawings = samples.filter((f) => f.includes('.drawing.') || f.includes('.chamber-drawing.') || f.includes('.table.'));
  it('has sample drawings to check against', () => {
    expect(drawings.length).toBeGreaterThan(10);
  });
  for (const file of drawings) {
    const parts = file.slice(0, -4).split('.');
    const key = parts[0]!;
    const kind = parts[1]!;
    const frame = parts[2] as Frame;
    it(`${key} ${kind} ${frame}`, () => {
      const record = recordFor(key);
      let svg: string;
      if (record.family === 'shotshell') {
        expect(kind).toBe('drawing');
        svg = renderDrawingSvg(adaptShotshell(record as ShotshellRecord), null, { scale: 4, frame });
      } else if (kind === 'drawing') {
        const p = profilesFor(record as CartridgeRecord);
        svg = renderDrawingSvg(p.case, p.bullet, { scale: 4, frame, profile: p.outline });
      } else if (kind === 'table') {
        const p = profilesFor(record as CartridgeRecord);
        svg = renderTechnicalSvg(p.case, p.bullet, { scale: 4, frame, profile: p.outline, showTable: true });
      } else {
        const p = profilesFor(record as CartridgeRecord);
        expect(p.chamber).not.toBeNull();
        svg = renderChamberDrawingSvg(p.chamber!, record.name, chamberRecordFacts(record as CartridgeRecord), { scale: 4, frame });
      }
      compare(svg, readFileSync(join(SAMPLES!, file), 'utf8'), `${key} ${kind} ${frame}`);
    });
  }
});

describe('the coloured face of a shot cartridge reproduces the renderer', () => {
  const hulls = samples.filter((f) => {
    const parts = f.slice(0, -4).split('.');
    if (parts.length !== 2) return false;
    return recordFor(parts[0]!).family === 'shotshell';
  });
  it('has shot cartridges among the samples', () => {
    expect(hulls.length).toBeGreaterThan(0);
  });
  for (const file of hulls) {
    const [key, frame] = file.slice(0, -4).split('.') as [string, Frame];
    it(`${key} ${frame}`, () => {
      const record = recordFor(key) as ShotshellRecord;
      const svg = renderShotshellVisualSvg(adaptShotshell(record), { scale: 4, frame });
      compare(svg, readFileSync(join(SAMPLES!, file), 'utf8'), `${key} ${frame}`);
    });
  }
});

/**
 * A page is one document, and an id in it is global.
 *
 * The cartridge page draws the record's card, the seating panel's cutaway and the chamber at
 * once, each its own `<svg>` root. Two roots that share a clip id both resolve `url(#id)` to
 * whichever the document met first, so one is clipped by the other's contour - in the other's
 * coordinates, which is nowhere near it - and vanishes. That is what happened to the seating
 * panel (fixed 2026-09-06): it drew only the bullet, or a sliver of brass, or nothing.
 */
describe('the drawings on one page do not share ids', () => {
  const ids = (markup: string) => new Set([...markup.matchAll(/id="([^"]+)"/g)].map((m) => m[1]!));
  const refs = (markup: string) => new Set([...markup.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]!));

  it('every reference resolves inside its own drawing', () => {
    const record = recordFor('308_win') as CartridgeRecord;
    const p = profilesFor(record);
    for (const markup of [
      liveDrawing(p.case, p.bullet, { profile: p.outline }).markup,
      liveDrawing(p.case, p.bullet, { profile: p.outline, style: 'technical' }).markup,
      liveChamberDrawing(p.chamber!, record.name, chamberRecordFacts(record), {}).markup
    ]) {
      for (const ref of refs(markup)) expect(ids(markup)).toContain(ref);
    }
  });

  it('the card and the seating panel cannot claim the same id', () => {
    const record = recordFor('308_win') as CartridgeRecord;
    const p = profilesFor(record);
    const card = ids(liveDrawing(p.case, p.bullet, { profile: p.outline }).markup);

    const view = viewportFor([p.outline], { scale: 4, frame: 'landscape', marginMm: 4 });
    const [defs, parts] = sectionParts(p.case, p.outline, caseInnerProfile(p.case), p.bullet, p.bullet ? bulletOuterProfile(p.bullet) : null, view, null);
    const panel = ids(defs + parts.join(''));

    expect(panel.size).toBeGreaterThan(0);
    expect([...panel].filter((id) => card.has(id))).toEqual([]);
  });

  it('the same record at two sizes gets two namespaces', () => {
    const record = recordFor('308_win') as CartridgeRecord;
    const p = profilesFor(record);
    const small = ids(liveDrawing(p.case, p.bullet, { profile: p.outline, idPrefix: 'a-' }).markup);
    const large = ids(liveDrawing(p.case, p.bullet, { profile: p.outline, idPrefix: 'b-' }).markup);
    expect([...small].filter((id) => large.has(id))).toEqual([]);
  });
});
