/**
 * Checks rulebook dimensions and citations, scoring conventions and group statistics.
 * Every catalogue face must identify its source rulebook and edition.
 * Edge-scoring tests check that a hole touching a ring receives the higher score.
 */

import { describe, expect, it } from 'vitest';
import {
  ISSF_10M_AIR_PISTOL,
  ISSF_10M_AIR_RIFLE,
  ISSF_25M_PRECISION,
  ISSF_25M_RAPID_FIRE,
  ISSF_300M_RIFLE,
  ISSF_50M_RIFLE,
  ISSF_FACES
} from './issf';
import {
  DSB_15M_RIFLE,
  DSB_300M_RIFLE,
  DSB_50M_MUSKET,
  DSB_FACES
} from './dsb';
import {
  NRA_A21_200YD,
  NRA_A31_50YD,
  NRA_A50_50M,
  NRA_FACES
} from './nra';
import { outerDiameterMm, ringsInward } from './types';
import { groupAngle, onCard, scoreGroup, scoreShot } from './score';
import { targetExtentMm, targetSvg } from './draw';

const ALL = [...ISSF_FACES, ...DSB_FACES, ...NRA_FACES];

describe('every face is cited, because an uncited face is a rumour', () => {
  it.each(ALL.map((face) => [face.name, face]))('%s names its rule and edition', (_name, face) => {
    expect(face.source.body).toBeTruthy();
    expect(face.source.rulebook).toBeTruthy();
    expect(face.source.edition).toBeTruthy();
    expect(face.source.rule).toBeTruthy();
    expect(face.source.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it.each(ALL.map((face) => [face.name, face]))('%s says how it was transcribed', (_name, face) => {
    // Absent means the stronger case, a real text layer. Anything else has to be one of the two
    // named kinds, so a third can never appear by accident.
    const how = face.source.transcription ?? 'text-layer';
    expect(['text-layer', 'read-from-scan']).toContain(how);
  });

  it('has unique ids across every body', () => {
    expect(new Set(ALL.map((face) => face.id)).size).toBe(ALL.length);
  });

  it.each(ALL.map((face) => [face.name, face]))('%s has rings that grow outward', (_name, face) => {
    const inward = ringsInward(face);
    for (let i = 1; i < inward.length; i += 1) {
      expect(inward[i]!.diameterMm).toBeGreaterThan(inward[i - 1]!.diameterMm);
      // ...and score one less the further out you go.
      expect(inward[i]!.score).toBe(inward[i - 1]!.score - 1);
    }
    expect(inward[0]!.score).toBe(10);
  });

  it.each(ALL.map((face) => [face.name, face]))('%s fits on the card, where one is given', (_name, face) => {
    // The NRA rules give ring diameters and no card at all, so the field is absent rather than
    // invented. Where a body does state one, the rings have to fit inside it.
    if (!face.cardMm) return;
    expect(outerDiameterMm(face)).toBeLessThanOrEqual(
      Math.min(face.cardMm.width, face.cardMm.height)
    );
  });
});

describe('the faces are the rulebook', () => {
  it('has the 10 m air rifle rings, 0.5 to 45.5 in fives', () => {
    expect(ISSF_10M_AIR_RIFLE.rings.map((r) => r.diameterMm)).toEqual([
      0.5, 5.5, 10.5, 15.5, 20.5, 25.5, 30.5, 35.5, 40.5, 45.5
    ]);
    expect(ISSF_10M_AIR_RIFLE.blackMm).toBe(30.5);
    expect(ISSF_10M_AIR_RIFLE.cardMm).toEqual({ width: 80, height: 80 });
  });

  it('has the 50 m rifle rings, 10.4 to 154.4 in sixteens', () => {
    const diameters = ISSF_50M_RIFLE.rings.map((r) => r.diameterMm);
    expect(diameters[0]).toBe(10.4);
    expect(diameters[9]).toBe(154.4);
    for (let i = 1; i < diameters.length; i += 1) {
      expect(diameters[i]! - diameters[i - 1]!).toBeCloseTo(16, 9);
    }
  });

  it('has the 25 m precision rings, 50 to 500 in fifties', () => {
    expect(ISSF_25M_PRECISION.rings.map((r) => r.diameterMm)).toEqual([
      50, 100, 150, 200, 250, 300, 350, 400, 450, 500
    ]);
    expect(ISSF_25M_PRECISION.innerTenMm).toBe(25);
  });

  it('has the 300 m rifle rings, 100 to 1000 in hundreds', () => {
    expect(ISSF_300M_RIFLE.rings.map((r) => r.diameterMm)).toEqual([
      100, 200, 300, 400, 500, 600, 700, 800, 900, 1000
    ]);
  });

  it('has the 10 m air pistol rings, 11.5 to 155.5 in sixteens', () => {
    const diameters = ISSF_10M_AIR_PISTOL.rings.map((r) => r.diameterMm);
    expect(diameters[0]).toBe(11.5);
    expect(diameters[9]).toBe(155.5);
  });

  it('gives the rapid-fire face only the six rings it actually has', () => {
    expect(ISSF_25M_RAPID_FIRE.rings).toHaveLength(6);
    expect(ringsInward(ISSF_25M_RAPID_FIRE).at(-1)!.score).toBe(5);
  });

  it('leaves the air rifle inner ten absent, because the rules define it by gauge', () => {
    // Every other face gets a diameter. This one does not have one to give, and an invented
    // figure would be indistinguishable from a real one.
    expect(ISSF_10M_AIR_RIFLE.innerTenMm).toBeUndefined();
    expect(ISSF_10M_AIR_RIFLE.tenIsWhiteDot).toBe(true);
  });
});

describe('the DSB faces are the Sportordnung', () => {
  it('has the 15 m rifle rings, 4.5 to 85.5 in nines', () => {
    expect(DSB_15M_RIFLE.rings.map((r) => r.diameterMm)).toEqual([
      4.5, 13.5, 22.5, 31.5, 40.5, 49.5, 58.5, 67.5, 76.5, 85.5
    ]);
    // The table's "innen Ø 10" column is empty for this face. No inner ten is invented for it.
    expect(DSB_15M_RIFLE.innerTenMm).toBeUndefined();
  });

  it('gives the musket face six rings, 5 to 10, as printed', () => {
    expect(DSB_50M_MUSKET.rings.map((r) => r.diameterMm)).toEqual([80, 160, 240, 320, 400, 480]);
    expect(ringsInward(DSB_50M_MUSKET).at(-1)!.score).toBe(5);
  });

  it('reads Ringabstand as a radius, which is the reading everything else depends on', () => {
    // The table gives a 50 mm step for the 300 m face and its rings are 100 mm apart. Read as a
    // diameter step instead, every ring past the tenth would be half what it should be.
    const diameters = DSB_300M_RIFLE.rings.map((r) => r.diameterMm);
    expect(diameters[1]! - diameters[0]!).toBe(100);
  });

  it('uses the text layer of the supplied 2027 DSB edition', () => {
    for (const face of DSB_FACES) {
      expect(face.source.transcription).toBe('text-layer');
    }
    // The ISSF ones came out of a text layer and claim the stronger provenance by saying nothing.
    for (const face of ISSF_FACES) {
      expect(face.source.transcription).toBeUndefined();
    }
  });

  it('agrees with the ISSF faces where the two bodies use the same one', () => {
    // DSB's 100 m rifle face is the ISSF 25 m precision face, and its 300 m is the ISSF 300 m.
    // Two publishers, two documents, two transcriptions - so a disagreement here is a
    // transcription error somewhere, which is exactly what this catches.
    expect(DSB_300M_RIFLE.rings.map((r) => r.diameterMm)).toEqual(
      ISSF_300M_RIFLE.rings.map((r) => r.diameterMm)
    );
    expect(DSB_300M_RIFLE.innerTenMm).toBe(ISSF_300M_RIFLE.innerTenMm);
    expect(DSB_300M_RIFLE.blackMm).toBe(ISSF_300M_RIFLE.blackMm);
  });

  it('keeps the distance the face is actually shot at, not the one it was borrowed from', () => {
    // Same rings as the ISSF 25 m pistol face; shot at 100 m. Scoring a group in MOA needs the
    // distance, so borrowing the geometry must not borrow the distance with it.
    expect(ISSF_25M_PRECISION.distanceM).toBe(25);
    const hundred = DSB_FACES.find((f) => f.id === 'dsb_100m_rifle')!;
    expect(hundred.distanceM).toBe(100);
    expect(hundred.rings.map((r) => r.diameterMm)).toEqual(
      ISSF_25M_PRECISION.rings.map((r) => r.diameterMm)
    );
  });
});

describe('the NRA faces are the rulebook', () => {
  it('converts the inch figures exactly, because an inch is exactly 25.4 mm', () => {
    // A-25's rings are whole inches: X 1, ten 2, then 2 in per ring. If the conversion were a
    // rounded constant this is where it would show.
    expect(NRA_A21_200YD.innerTenMm).toBe(50.8);
    expect(NRA_A21_200YD.rings.map((r) => r.diameterMm)).toEqual([101.6, 203.2, 304.8, 406.4, 508]);
  });

  it('holds the X ring as the inner ten, and gives none to a face that has none', () => {
    expect(NRA_A21_200YD.innerTenMm).toBeGreaterThan(0);
    // A-31 and A-33 have no X ring printed, so they get none.
    expect(NRA_A31_50YD.innerTenMm).toBeUndefined();
  });

  it('keeps A-31’s uneven rings as printed rather than as a series', () => {
    // 1.025, 2.21, 3.42, 4.165, 5.812 in. The gaps are not equal, and a "helpful" regularisation
    // would be a fabrication that looked tidier than the rulebook.
    const d = NRA_A31_50YD.rings.map((r) => r.diameterMm);
    const gaps = d.slice(1).map((v, i) => Number((v - d[i]!).toFixed(3)));
    expect(new Set(gaps).size).toBeGreaterThan(1);
  });

  it('puts the yard distances in metres exactly', () => {
    expect(NRA_A21_200YD.distanceM).toBeCloseTo(182.88, 9);
  });

  it('agrees with ISSF and DSB on the 50 m face, from a third publisher', () => {
    // A-50 is the ISSF 50 m rifle face adopted by the NRA and printed in millimetres. Three
    // bodies, three documents, three transcriptions - and they agree ring for ring.
    expect(NRA_A50_50M.rings.map((r) => r.diameterMm)).toEqual(
      ISSF_50M_RIFLE.rings.map((r) => r.diameterMm)
    );
    expect(NRA_A50_50M.innerTenMm).toBe(ISSF_50M_RIFLE.innerTenMm);
    expect(NRA_A50_50M.blackMm).toBe(ISSF_50M_RIFLE.blackMm);
  });
});

describe('scoring takes the ring the hole touches, not the one its centre is in', () => {
  const face = ISSF_25M_PRECISION;

  it('scores a centre shot ten', () => {
    expect(scoreShot(face, { xMm: 0, yMm: 0 }, 9).score).toBe(10);
  });

  it('gives the higher ring to a shot whose hole merely touches the line', () => {
    // The 10 ring is 50 mm across, so its edge is at 25 mm. A 9 mm bullet centred at 29 mm has
    // its inner edge at 24.5 mm - inside the line, so it is a ten. Its centre is not.
    expect(scoreShot(face, { xMm: 29, yMm: 0 }, 9).score).toBe(10);
    expect(scoreShot(face, { xMm: 29, yMm: 0 }, 0.1).score).toBe(9);
  });

  it('scores the same hole differently for different calibres, which is the point', () => {
    // 29 mm out: a 4.5 mm pellet reaches 26.75, outside the 25 mm ten-ring edge. An 11.5 mm
    // bullet reaches 23.25 and is inside it. Same hole centre, different score.
    const centre = { xMm: 29, yMm: 0 };
    expect(scoreShot(face, centre, 4.5).score).toBe(9);
    expect(scoreShot(face, centre, 11.5).score).toBe(10);
  });

  it('refuses to score without a calibre rather than assuming one', () => {
    expect(() => scoreShot(face, { xMm: 0, yMm: 0 }, 0)).toThrow(/needs the calibre/);
  });

  it('scores a shot off the rings as a miss', () => {
    expect(scoreShot(face, { xMm: 400, yMm: 0 }, 9).score).toBe(0);
  });

  it('marks an inner ten only where the face defines one', () => {
    expect(scoreShot(face, { xMm: 0, yMm: 0 }, 9).innerTen).toBe(true);
    expect(scoreShot(face, { xMm: 20, yMm: 0 }, 9).innerTen).toBe(false);
    // The air rifle face has no inner-ten diameter, so nothing is ever flagged as one.
    expect(scoreShot(ISSF_10M_AIR_RIFLE, { xMm: 0, yMm: 0 }, 4.5).innerTen).toBe(false);
  });

  it('knows the difference between missing the rings and missing the paper', () => {
    expect(onCard(face, { xMm: 260, yMm: 0 })).toBe(true);
    expect(onCard(face, { xMm: 400, yMm: 0 })).toBe(false);
  });

  it('says it cannot tell when the rulebook gave no card', () => {
    // Not `false`. Reporting a shot as off the paper on the strength of a figure nobody published
    // would be the same kind of invention this dataset exists to avoid.
    expect(NRA_A21_200YD.cardMm).toBeUndefined();
    expect(onCard(NRA_A21_200YD, { xMm: 5000, yMm: 0 })).toBeUndefined();
  });
});

describe('describing a group', () => {
  // Four shots in a 20 mm square, centred 10 mm high and right of the middle.
  const square = [
    { xMm: 0, yMm: 0 },
    { xMm: 20, yMm: 0 },
    { xMm: 0, yMm: 20 },
    { xMm: 20, yMm: 20 }
  ];
  const stats = scoreGroup(ISSF_25M_PRECISION, square, 9);

  it('measures the spread and the mean radius about the group, not the middle of the face', () => {
    // The diagonal of a 20 mm square is the widest pair.
    expect(stats.extremeSpreadMm).toBeCloseTo(Math.hypot(20, 20), 9);
    // Every shot is half a diagonal from the centre of the square.
    expect(stats.meanRadiusMm).toBeCloseTo(Math.hypot(10, 10), 9);
    // Where the group sits is a separate fact, and it is reported separately.
    expect(stats.centreMm).toEqual({ xMm: 10, yMm: 10 });
  });

  it('always carries the shot count, because a spread without one is not a measurement', () => {
    expect(stats.count).toBe(4);
  });

  it('shows why mean radius is the better estimator: spread grows with shot count', () => {
    // Add a fifth shot inside the existing group. It cannot make the rifle worse, but extreme
    // spread can only rise or stay put, while mean radius reflects the whole group.
    const withInfill = scoreGroup(ISSF_25M_PRECISION, [...square, { xMm: 10, yMm: 10 }], 9);
    expect(withInfill.extremeSpreadMm).toBeCloseTo(stats.extremeSpreadMm, 9);
    expect(withInfill.meanRadiusMm).toBeLessThan(stats.meanRadiusMm);
  });

  it('adds up the score and counts the tens and the misses', () => {
    const mixed = scoreGroup(
      ISSF_25M_PRECISION,
      [{ xMm: 0, yMm: 0 }, { xMm: 120, yMm: 0 }, { xMm: 900, yMm: 0 }],
      9
    );
    // 120 mm out with a 9 mm bullet reaches 115.5, inside the 6 ring's 125 mm edge.
    expect(mixed.total).toBe(10 + 6 + 0);
    expect(mixed.innerTens).toBe(1);
    expect(mixed.misses).toBe(1);
  });

  it('survives being given no shots at all', () => {
    expect(scoreGroup(ISSF_25M_PRECISION, [], 9).count).toBe(0);
  });

  it('turns a group size into the angle it subtends', () => {
    // 25 mm at 100 m is a quarter of a milliradian.
    expect(groupAngle(25, 100)).toBeCloseTo(0.00025, 8);
    expect(() => groupAngle(25, 0)).toThrow(/distance/);
  });
});

describe('the drawing', () => {
  it('uses a millimetre viewBox with a responsive screen viewport', () => {
    const svg = targetSvg(ISSF_10M_AIR_RIFLE);
    // Coordinates retain their dimensions; the viewport makes no paper-scale claim.
    expect(svg).toContain('width="80" height="80"');
    expect(svg).toContain('viewBox="0 0 80 80"');
  });

  it('names the rulebook it was drawn from, on the drawing itself', () => {
    expect(targetSvg(ISSF_50M_RIFLE)).toContain('rule 6.3.4.2');
  });

  it('does not add a paper calibration ruler', () => {
    expect(targetSvg(ISSF_25M_PRECISION)).not.toContain('50 mm</text>');
  });

  it('draws rings inside the black in white, as a real target does', () => {
    const svg = targetSvg(ISSF_25M_PRECISION, { paperColour: '#ffffff', inkColour: '#000000' });
    // The 10 ring, at 25 mm radius, is inside the 200 mm black and must be white to be seen.
    expect(svg).toContain('r="25" fill="none" stroke="#ffffff"');
    // The 1 ring, at 250 mm, is outside it and is black.
    expect(svg).toContain('r="250" fill="none" stroke="#000000"');
  });

  it('marks shots where they were scored, in the same coordinates', () => {
    const svg = targetSvg(ISSF_25M_PRECISION, {
      shots: [{ xMm: 30, yMm: -40 }],
      calibreMm: 9
    });
    // Centre of a 550 x 535 card is (275, 267.5); y is flipped.
    expect(svg).toContain('cx="305" cy="307.5" r="4.5"');
  });

  it('can crop to the rings instead of drawing the whole card', () => {
    const cropped = targetSvg(ISSF_10M_AIR_RIFLE, { extent: 'rings' });
    expect(cropped).toContain('width="47.32"');
  });

  it('gives the same extent it draws at, so a printed sheet can size the paper', () => {
    // A sheet asks before there is a drawing, and prints the face at 1:1 from the answer: two
    // numbers that disagreed with the viewBox would be a target printed at the wrong size.
    for (const face of [ISSF_10M_AIR_RIFLE, ISSF_25M_PRECISION, NRA_A21_200YD]) {
      for (const extent of ['card', 'rings'] as const) {
        const { widthMm, heightMm } = targetExtentMm(face, { extent });
        expect(targetSvg(face, { extent })).toContain(`viewBox="0 0 ${widthMm} ${heightMm}"`);
      }
    }
  });

  it('falls back to the rings when the rulebook gave no card', () => {
    // Asking for the card and getting the rings is the right failure: there is no card to draw.
    const asCard = targetSvg(NRA_A21_200YD, { extent: 'card' });
    const asRings = targetSvg(NRA_A21_200YD, { extent: 'rings' });
    expect(asCard).toBe(asRings);
    expect(asCard).toContain('width="528.32"');
  });
});
