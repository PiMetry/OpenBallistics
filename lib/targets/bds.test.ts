import { describe, expect, it } from 'vitest';
import { BDS_FACES, BDS_25M_HANDGUN, BDS_50M_PG, BDS_100M_ZF, BDS_25M_INTERVAL } from './bds';
import { targetSvg } from './draw';
import { scoreShot } from './score';
describe('BDS circular target transcriptions', () => {
  it('keeps radial ring widths separate from diameters', () => {
    expect(BDS_25M_HANDGUN.rings.map(r => r.diameterMm)).toEqual([50,100,150,200,250,300,350,400,450,500]);
    expect(BDS_100M_ZF.rings.map(r => r.diameterMm)).toEqual([27,44,61,78,95,112,129,146,163,180]);
    expect(BDS_50M_PG.rings.at(-1)).toEqual({ score: 5, diameterMm: 38.1 });
    expect(BDS_50M_PG.cardMm).toBeUndefined();
  });
  it('cites the official edition and preserves distinct faces', () => {
    expect(new Set(BDS_FACES.map(f => f.id)).size).toBe(12);
    for (const f of BDS_FACES) {
      expect(f.source.url).toContain('bdsnet.de/ressourcen/downloads/2025_06_30');
      expect(f.source.rule).toMatch(/^Z \d+$/);
      expect(f.ruleSources?.[0]?.rule).toContain('A 9.02');
      expect(f.ruleSources?.[1]?.url).toContain('2026_07_shb_');
      expect(f.whiteCentreMm ?? 0).toBeLessThan(f.blackMm!);
    }
  });
  it('scores Z 20 against the white nine boundary rather than the black aiming edge', () => {
    expect(BDS_25M_INTERVAL.rings[1]?.diameterMm).toBe(180);
    expect(BDS_25M_INTERVAL.blackMm).toBe(200);
    expect(scoreShot(BDS_25M_INTERVAL, { xMm: 94.5, yMm: 0 }, 9).score).toBe(9);
    expect(scoreShot(BDS_25M_INTERVAL, { xMm: 95, yMm: 0 }, 9).score).toBe(8);
  });
  it('draws a white centre and black annulus without a paper calibration bar', () => {
    const svg = targetSvg(BDS_25M_HANDGUN);
    expect(svg).toContain('r="100" fill="#111111"');
    expect(svg).toContain('r="50" fill="#ffffff"');
    expect(svg).toContain('r="12.5" fill="none" stroke="#111111"');
    expect(svg).not.toContain('50 mm</text>');
  });
  it('scores a hole touching the ten using the selected diameter', () => {
    expect(scoreShot(BDS_25M_HANDGUN, { xMm: 29.5, yMm: 0 }, 9).score).toBe(10);
    expect(scoreShot(BDS_25M_HANDGUN, { xMm: 29.51, yMm: 0 }, 9).score).toBe(9);
  });
  it('escapes user face names in SVG attributes', () => {
    const svg = targetSvg({ ...BDS_25M_HANDGUN, name: 'Face" onload="alert(1)' });
    expect(svg).not.toContain(' onload="');
    expect(svg).toContain('Face&quot; onload=&quot;alert(1)');
  });
});
