import { expect, it } from 'vitest';
import { TARGET_FACES, asTargetFace } from './target-catalogue';
import { isTargetGeometry } from '@lib/targets';
import { emptyUserData, parse, serialise } from '@lib/userdata';
import { DSB_50M_MUSKET, DSB_100M_ORDNANCE, DSB_100M_RIFLE, DSB_25M_RAPID_FIRE, DSB_FACES, scoreShot } from '@lib/targets';
it('offers only BDS and DSB published faces', () => {
  expect(new Set(TARGET_FACES.map(f => f.source.body))).toEqual(new Set(['BDS', 'DSB']));
  expect(TARGET_FACES).toHaveLength(24);
  expect(new Set(TARGET_FACES.map(f => f.id)).size).toBe(24);
});
it('loads every target JSON with unique file names and valid dimensions', () => {
  const files = import.meta.glob('../../../data/targets/*.json', { eager: true, import: 'default' });
  expect(Object.keys(files)).toHaveLength(TARGET_FACES.length);
  for (const face of TARGET_FACES) {
    expect(isTargetGeometry(face), face.id).toBe(true);
    expect(files[`../../../data/targets/${face.id}.json`]).toEqual(face);
  }
});
it('preserves personal target scoring and colours through backup export and import', () => {
  const own = {
    id: 'tgt-test', name: 'Practice', distanceM: 25,
    rings: [{ score: 10, diameterMm: 10 }, { score: 9, diameterMm: 30 }],
    cardMm: { width: 50, height: 50 }, blackMm: 30, whiteCentreMm: 10, innerTenMm: 5,
    scoringMethod: 'centre' as const, tenIsWhiteDot: true, notes: 'My notes',
    origin: 'measured' as const, created: '2026-09-08T12:00:00Z', updated: '2026-09-08T12:00:00Z'
  };
  const restored = parse(serialise({ ...emptyUserData(), targetFaces: [own] }));
  expect(restored.ok).toBe(true);
  if (!restored.ok) return;
  expect(restored.data.targetFaces[0]).toEqual(own);
  const face = asTargetFace(restored.data.targetFaces[0]!, 'Personal target');
  expect(scoreShot(face, { xMm: 6, yMm: 0 }, 9).score).toBe(9);
  expect(face.whiteCentreMm).toBe(10);
  expect(face.note).toBe('My notes');
});
it('uses the supplied DSB 2027 edition and explicit effective date', () => {
  for (const face of DSB_FACES) {
    expect(face.source.edition).toBe('01.01.2027');
    expect(face.source.effectiveFrom).toBe('2027-01-01');
    expect(face.source.url).toContain('Sportordnung_DSB_01012027.pdf');
    expect(face.ruleSources?.length).toBeGreaterThan(0);
  }
  expect(DSB_25M_RAPID_FIRE.rings.map(r => r.diameterMm)).toEqual([100,180,260,340,420,500]);
});
it('applies DSB centre scoring only to the relevant disciplines', () => {
  expect(scoreShot(DSB_50M_MUSKET, { xMm: 45, yMm: 0 }, 18).score).toBe(9);
  expect(scoreShot(DSB_100M_ORDNANCE, { xMm: 28, yMm: 0 }, 9).score).toBe(9);
  expect(scoreShot(DSB_100M_RIFLE, { xMm: 28, yMm: 0 }, 9).score).toBe(10);
});
