import { describe, expect, it } from 'vitest';
import { isTargetGeometry, parseTargetGeometry } from './record';
import { BDS_FACES } from './bds';
import { DSB_FACES } from './dsb';

describe('target JSON records', () => {
  it.each([...BDS_FACES, ...DSB_FACES])('imports $id without changing its geometry or scoring method', face => {
    const imported = parseTargetGeometry(JSON.stringify(face));
    expect(imported).not.toBeNull();
    expect(imported!.rings).toEqual(face.rings);
    expect(imported!.scoringMethod).toBe(face.scoringMethod);
    expect(imported!.whiteCentreMm).toBe(face.whiteCentreMm);
    expect(imported!.tenIsWhiteDot).toBe(face.tenIsWhiteDot);
  });

  const face = { name: 'Practice', distanceM: 25, rings: [{ score: 10, diameterMm: 10 }, { score: 9, diameterMm: 30 }], cardMm: { width: 50, height: 50 } };
  it.each([
    { name: '' }, { distanceM: NaN }, { distanceM: 0 }, { rings: [] },
    { rings: [{ score: 10, diameterMm: 10 }, { score: 10, diameterMm: 30 }] },
    { rings: [{ score: 10, diameterMm: 30 }, { score: 9, diameterMm: 10 }] },
    { rings: [{ score: 10, diameterMm: 10 }, { score: 9.5, diameterMm: 30 }] },
    { cardMm: { width: 20, height: 50 } }, { blackMm: Infinity },
    { blackMm: 10, whiteCentreMm: 20 }, { innerTenMm: 11 },
    { scoringMethod: 'unknown' }, { tenIsWhiteDot: 'yes' }
  ])('rejects malformed dimensions: %j', changes => {
    expect(isTargetGeometry({ ...face, ...changes })).toBe(false);
  });
  it('accepts uneven spacing and sorts imported rings by score', () => {
    const imported = parseTargetGeometry(JSON.stringify({ ...face, rings: [...face.rings].reverse() }));
    expect(imported!.rings).toEqual(face.rings);
  });
  it.each(['null', '[]', '{', '42'])('handles invalid files without throwing: %s', json => {
    expect(parseTargetGeometry(json)).toBeNull();
  });
});
