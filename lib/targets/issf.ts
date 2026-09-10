/**
 * The ISSF faces, transcribed from the rulebook.
 *
 * Every number below was read from the ISSF General Technical Rules as published by USA Shooting,
 * **Edition 2013**, rules 6.3.4.1 to 6.3.4.6, at
 * <https://usashooting.org/app/uploads/2022/04/2013_USAS_GTR.pdf>, on 2026-09-07.
 *
 * **That edition is stated because it matters, not as a formality.** ISSF revises these tables,
 * and a face printed to the wrong edition scores shots wrongly with nothing to show for it. If a
 * newer edition is checked and agrees, say so by updating `edition` and `retrieved`; if it
 * disagrees, that is a new face, not an edit to this one.
 *
 * The tolerances the rulebook prints (±0.1 mm on an air rifle ring, ±3.0 mm on a 300 m one) are
 * manufacturing tolerances for the printed card, not uncertainty in the specification, so the
 * nominal diameters are what is held here.
 */

import type { TargetFace } from './types';

const ISSF = {
  body: 'ISSF',
  rulebook: 'ISSF General Technical Rules (USA Shooting printing)',
  edition: '2013',
  url: 'https://usashooting.org/app/uploads/2022/04/2013_USAS_GTR.pdf',
  retrieved: '2026-09-07'
} as const;

const rings = (diameters: readonly number[]) =>
  diameters.map((diameterMm, index) => ({ score: 10 - index, diameterMm }));

/** 300 m Rifle, rule 6.3.4.1. */
export const ISSF_300M_RIFLE: TargetFace = {
  id: 'issf_300m_rifle',
  name: 'ISSF 300 m Rifle',
  distanceM: 300,
  rings: rings([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]),
  innerTenMm: 50,
  blackMm: 600,
  cardMm: { width: 1300, height: 1300 },
  ringThicknessMm: [0.5, 1.0],
  source: { ...ISSF, rule: '6.3.4.1' },
  note: 'Black covers rings 5 to 10. The 10 zone is not numbered.'
};

/** 50 m Rifle, rule 6.3.4.2. */
export const ISSF_50M_RIFLE: TargetFace = {
  id: 'issf_50m_rifle',
  name: 'ISSF 50 m Rifle',
  distanceM: 50,
  rings: rings([10.4, 26.4, 42.4, 58.4, 74.4, 90.4, 106.4, 122.4, 138.4, 154.4]),
  innerTenMm: 5,
  blackMm: 112.4,
  cardMm: { width: 250, height: 250 },
  ringThicknessMm: [0.2, 0.3],
  source: { ...ISSF, rule: '6.3.4.2' },
  note: 'Black covers part of ring 3 out to 10. Insert targets of 200 x 200 mm are permitted.'
};

/** 10 m Air Rifle, rule 6.3.4.3. */
export const ISSF_10M_AIR_RIFLE: TargetFace = {
  id: 'issf_10m_air_rifle',
  name: 'ISSF 10 m Air Rifle',
  distanceM: 10,
  rings: rings([0.5, 5.5, 10.5, 15.5, 20.5, 25.5, 30.5, 35.5, 40.5, 45.5]),
  // No diameter here on purpose: the rules define this target's inner ten by an outward gauge
  // shooting the dot out completely, not by a circle. Inventing one would be a fabricated figure.
  blackMm: 30.5,
  cardMm: { width: 80, height: 80 },
  ringThicknessMm: [0.1, 0.2],
  tenIsWhiteDot: true,
  source: { ...ISSF, rule: '6.3.4.3' },
  note: 'The 10 ring is a white dot of 0.5 mm. Black covers rings 4 to 9.'
};

/** 25 m Rapid Fire Pistol, rule 6.3.4.4. Scores 5 to 10 only. */
export const ISSF_25M_RAPID_FIRE: TargetFace = {
  id: 'issf_25m_rapid_fire',
  name: 'ISSF 25 m Rapid Fire Pistol',
  distanceM: 25,
  rings: [100, 180, 260, 340, 420, 500].map((diameterMm, index) => ({
    score: 10 - index,
    diameterMm
  })),
  innerTenMm: 50,
  blackMm: 500,
  cardMm: { width: 550, height: 535 },
  ringThicknessMm: [0.5, 1.0],
  source: { ...ISSF, rule: '6.3.4.4' },
  note: 'This face scores 5 to 10 only. Card height is given as a range, 520-550 mm; 535 is its middle.'
};

/** 25 m Precision and 50 m Pistol, rule 6.3.4.5. */
export const ISSF_25M_PRECISION: TargetFace = {
  id: 'issf_25m_precision',
  name: 'ISSF 25 m Precision / 50 m Pistol',
  distanceM: 25,
  rings: rings([50, 100, 150, 200, 250, 300, 350, 400, 450, 500]),
  innerTenMm: 25,
  blackMm: 200,
  cardMm: { width: 550, height: 535 },
  ringThicknessMm: [0.2, 0.5],
  source: { ...ISSF, rule: '6.3.4.5' },
  note: 'Used for 50 m Pistol, 25 m Standard Pistol, and the precision stage of 25 m Centre Fire and 25 m Pistol. Card height is given as a range, 520-550 mm; 535 is its middle.'
};

/** 10 m Air Pistol, rule 6.3.4.6. */
export const ISSF_10M_AIR_PISTOL: TargetFace = {
  id: 'issf_10m_air_pistol',
  name: 'ISSF 10 m Air Pistol',
  distanceM: 10,
  rings: rings([11.5, 27.5, 43.5, 59.5, 75.5, 91.5, 107.5, 123.5, 139.5, 155.5]),
  innerTenMm: 5,
  blackMm: 59.5,
  cardMm: { width: 170, height: 170 },
  ringThicknessMm: [0.1, 0.2],
  source: { ...ISSF, rule: '6.3.4.6' },
  note: 'Black covers rings 7 to 10.'
};

export const ISSF_FACES: readonly TargetFace[] = [
  ISSF_10M_AIR_RIFLE,
  ISSF_10M_AIR_PISTOL,
  ISSF_25M_PRECISION,
  ISSF_25M_RAPID_FIRE,
  ISSF_50M_RIFLE,
  ISSF_300M_RIFLE
];
