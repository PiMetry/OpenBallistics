/**
 * The NRA smallbore faces, transcribed from the rulebook.
 *
 * Source: National Rifle Association, *NRA Smallbore Rifle Rules*, section 4 "Targets", published
 * as <https://competitions.nra.org/documents/pdf/compete/RuleBooks/SBR/sbr-book.pdf>, read
 * 2026-09-07. The PDF has a real text layer, so these came out of `pdftotext` and were checked
 * against it rather than read off a picture.
 *
 * **The rulebook prints inches, and this file stores millimetres.** The conversion is exact - an
 * inch is 25.4 mm by definition - so nothing is lost, but the published figure is the inch one and
 * the note on each face says so. Two faces are printed in millimetres by the rulebook itself
 * (A-50 and A-51, both reductions of ISSF faces) and those are stored as printed.
 *
 * **No card sizes.** Section 4 gives ring diameters and says which rings are black; it does not
 * give a card. `cardMm` is therefore absent rather than guessed, and the drawing falls back to the
 * rings. That is the whole reason `cardMm` became optional.
 *
 * **The NRA's X ring is this model's inner ten**: a sub-ring inside the ten used to break ties,
 * which is what `innerTenMm` is for. Faces the rulebook gives no X ring for do not get one.
 *
 * One face is deliberately missing: **A-17, the 50-foot target (rule 4.2)**. Its ring diameters
 * came out of the text layer with the decimal points lost - ".150 inch", "483 inch", "817 inch" -
 * and while the intended figures are obvious from the spacing, reconstructing them would be
 * inference dressed as transcription. It can be added from a clean copy.
 */

import type { TargetFace } from './types';

const NRA = {
  body: 'NRA',
  rulebook: 'NRA Smallbore Rifle Rules, section 4 (Targets)',
  edition: 'as published at competitions.nra.org',
  url: 'https://competitions.nra.org/documents/pdf/compete/RuleBooks/SBR/sbr-book.pdf',
  retrieved: '2026-09-07'
} as const;

/** Inches to millimetres. Exact by definition, which is why the conversion needs no tolerance. */
const inch = (value: number) => Number((value * 25.4).toFixed(4));

const YARD_M = 0.9144;
const FOOT_M = 0.3048;

/** Rings from a list of [score, inches], as the rulebook prints them. */
const inchRings = (rows: readonly (readonly [number, number])[]) =>
  rows.map(([score, inches]) => ({ score, diameterMm: inch(inches) }));

/** 75-foot target A7/5 and A7/10, rule 4.5. Rings 6 to 10 black. */
export const NRA_A7_75FT: TargetFace = {
  id: 'nra_a7_75ft',
  name: 'NRA A-7 75 ft',
  distanceM: 75 * FOOT_M,
  rings: inchRings([
    [10, 0.335],
    [9, 0.835],
    [8, 1.335],
    [7, 1.835],
    [6, 2.335],
    [5, 2.835]
  ]),
  blackMm: inch(2.335),
  source: { ...NRA, rule: '4.5' },
  note: 'Printed in inches: 10 ring 0.335 in to 5 ring 2.835 in. Rings 6 to 10 black; no X ring, and none is invented.'
};

/** 50-yard target A-23, rule 4.6. Rings 7 to 10 black. */
export const NRA_A23_50YD: TargetFace = {
  id: 'nra_a23_50yd',
  name: 'NRA A-23 50 yd',
  distanceM: 50 * YARD_M,
  rings: inchRings([
    [10, 0.89],
    [9, 1.89],
    [8, 2.89],
    [7, 3.89],
    [6, 4.89],
    [5, 5.89]
  ]),
  innerTenMm: inch(0.39),
  blackMm: inch(3.89),
  source: { ...NRA, rule: '4.6' },
  note: 'Printed in inches. The X ring, 0.39 in, is held as the inner ten.'
};

/** 50-yard target A-27, rule 4.7: the 50 m face reduced for 50 yards. */
export const NRA_A27_50YD: TargetFace = {
  id: 'nra_a27_50yd',
  name: 'NRA A-27 50 yd',
  distanceM: 50 * YARD_M,
  rings: inchRings([
    [10, 0.719],
    [9, 1.439],
    [8, 2.159],
    [7, 2.879],
    [6, 3.599],
    [5, 4.319],
    [4, 5.038]
  ]),
  innerTenMm: inch(0.359),
  blackMm: inch(3.89),
  source: { ...NRA, rule: '4.7' },
  note: 'The 50 metre target reduced for firing at 50 yards. Printed in inches; the rulebook states the black as 3.89 in.'
};

/** 50-yard target A-51, rule 4.8: the ISSF 50 m face reduced, and printed in millimetres. */
export const NRA_A51_50YD: TargetFace = {
  id: 'nra_a51_50yd',
  name: 'NRA A-51 50 yd',
  distanceM: 50 * YARD_M,
  rings: [
    { score: 10, diameterMm: 9.034 },
    { score: 9, diameterMm: 23.664 },
    { score: 8, diameterMm: 38.295 },
    { score: 7, diameterMm: 52.925 },
    { score: 6, diameterMm: 67.556 },
    { score: 5, diameterMm: 82.186 },
    { score: 4, diameterMm: 96.816 },
    { score: 3, diameterMm: 111.447 },
    { score: 2, diameterMm: 126.077 },
    { score: 1, diameterMm: 140.708 }
  ],
  innerTenMm: 4.096,
  blackMm: 102.78,
  source: { ...NRA, rule: '4.8' },
  note: 'The ISSF 50 metre target reduced for 50 yards. The rulebook prints this one in millimetres, and it is stored as printed.'
};

/** 50-metre target A-26, rule 4.9. */
export const NRA_A26_50M: TargetFace = {
  id: 'nra_a26_50m',
  name: 'NRA A-26 50 m',
  distanceM: 50,
  rings: inchRings([
    [10, 0.787],
    [9, 1.574],
    [8, 2.361],
    [7, 3.148],
    [6, 3.936],
    [5, 4.723],
    [4, 5.51]
  ]),
  innerTenMm: inch(0.393),
  blackMm: inch(4.27),
  source: { ...NRA, rule: '4.9' },
  note: 'Printed in inches, with the black stated as 4.27 in.'
};

/** 50-metre ISSF target A-50, rule 4.10, printed in millimetres. */
export const NRA_A50_50M: TargetFace = {
  id: 'nra_a50_50m',
  name: 'NRA A-50 50 m ISSF',
  distanceM: 50,
  rings: [
    { score: 10, diameterMm: 10.4 },
    { score: 9, diameterMm: 26.4 },
    { score: 8, diameterMm: 42.4 },
    { score: 7, diameterMm: 58.4 },
    { score: 6, diameterMm: 74.4 },
    { score: 5, diameterMm: 90.4 },
    { score: 4, diameterMm: 106.4 },
    { score: 3, diameterMm: 122.4 },
    { score: 2, diameterMm: 138.4 },
    { score: 1, diameterMm: 154.4 }
  ],
  innerTenMm: 5,
  blackMm: 112.4,
  source: { ...NRA, rule: '4.10' },
  note: 'The ISSF 50 m rifle face, adopted by the NRA for Metric Position and Metric Prone and printed in millimetres. A third publisher of the same face.'
};

/** 100-yard target A-25, rule 4.11. Rings 7 to 10 black. */
export const NRA_A25_100YD: TargetFace = {
  id: 'nra_a25_100yd',
  name: 'NRA A-25 100 yd',
  distanceM: 100 * YARD_M,
  rings: inchRings([
    [10, 2],
    [9, 4],
    [8, 6],
    [7, 8],
    [6, 10],
    [5, 12]
  ]),
  innerTenMm: inch(1),
  blackMm: inch(8),
  source: { ...NRA, rule: '4.11' },
  note: 'Printed in whole inches: X 1 in, 10 ring 2 in, then 2 in per ring.'
};

/** 100-yard target A-33, rule 4.12: the ISSF 300 m face reduced. Rings 4 to 10 black. */
export const NRA_A33_100YD: TargetFace = {
  id: 'nra_a33_100yd',
  name: 'NRA A-33 100 yd',
  distanceM: 100 * YARD_M,
  rings: inchRings([
    [10, 1.045],
    [9, 2.245],
    [8, 3.445],
    [7, 4.645],
    [6, 5.845],
    [5, 7.045],
    [4, 8.245],
    [3, 9.445],
    [2, 10.645],
    [1, 11.845]
  ]),
  blackMm: inch(8.245),
  source: { ...NRA, rule: '4.12' },
  note: 'The ISSF 300 m target reduced to 100 yards. No X ring is printed for it, so none is held.'
};

/** 200-yard target A-21, rule 4.13. Rings 8 to 10 black. */
export const NRA_A21_200YD: TargetFace = {
  id: 'nra_a21_200yd',
  name: 'NRA A-21 200 yd',
  distanceM: 200 * YARD_M,
  rings: inchRings([
    [10, 4],
    [9, 8],
    [8, 12],
    [7, 16],
    [6, 20]
  ]),
  innerTenMm: inch(2),
  blackMm: inch(12),
  source: { ...NRA, rule: '4.13' },
  note: 'Printed in whole inches: X 2 in, 10 ring 4 in, then 4 in per ring. Scores 6 to 10 only.'
};

/** 50-yard Light Rifle target A-31, rule 4.14. Rings 7 to 10 black. */
export const NRA_A31_50YD: TargetFace = {
  id: 'nra_a31_50yd',
  name: 'NRA A-31 50 yd Light Rifle',
  distanceM: 50 * YARD_M,
  rings: inchRings([
    [10, 1.025],
    [9, 2.21],
    [8, 3.42],
    [7, 4.165],
    [6, 5.812]
  ]),
  blackMm: inch(4.165),
  source: { ...NRA, rule: '4.14' },
  note: 'Printed in inches. No X ring, and the rings are not evenly spaced - the figures are as printed, not a series.'
};

export const NRA_FACES: readonly TargetFace[] = [
  NRA_A7_75FT,
  NRA_A23_50YD,
  NRA_A27_50YD,
  NRA_A51_50YD,
  NRA_A31_50YD,
  NRA_A26_50M,
  NRA_A50_50M,
  NRA_A25_100YD,
  NRA_A33_100YD,
  NRA_A21_200YD
];
