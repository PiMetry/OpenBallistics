/**
 * Powders, as bulk densities, and the fill thresholds the live cartridge warns at.
 *
 * **This is not load data.** A bulk density turns a charge weight into the volume it settles
 * into, which is the one thing the drawing needs; which charge belongs in which case is the
 * business of a published manual and nothing here says otherwise.
 *
 * **Densities** are Lee Precision's VMD figures (volume measure density, cubic centimetres per
 * grain), published with the Lee dippers and reproduced widely; a settled charge measured by
 * volume, so the right density for "how far does it fill the case". They vary by lot by a few
 * per cent, which is why the fill is shown to the whole per cent and nothing finer.
 *
 * **Thresholds**, with what they rest on (research 2026-09-05):
 *
 * - Hodgdon: "a full case, or lightly compressed charge is an ideal condition for creating loads
 *   with the most uniform velocities and pressures" and it marks compressed loads in its data;
 *   Nosler: all compressed loads in its manual are under maximum pressure and seating them
 *   "crunches" the powder. So up to 100 % is unremarked, 100 to `compressed` is a note.
 * - Published compressed loads run a few per cent over; they are the maker's, pressure-tested.
 *   Above `compressed` the panel warns (a *Pressladung*, to be checked against published data),
 *   and above `error` it refuses: a charge that far over the space cannot be seated without
 *   crushing granules or the bullet creeping back out. The 110 % ceiling is a convention, not a
 *   published limit; no maker states one.
 * - Load density: makers put ordinary loads at 80 to 90 % and "eighty-five percent is just about
 *   ideal" (The Shooter's Log, Hodgdon). Below `low` the panel cautions. Slow powders in a
 *   largely empty case are associated with erratic ignition and the secondary explosion effect
 *   in the literature, from about 40 % of capacity; below `veryLow` the panel warns outright.
 *
 * Sources: Lee Precision VMD chart (lee90058); hodgdonreloading.com reloading education;
 * nosler.com FAQ on compressed loads; blog.cheaperthandirt.com/reloading-load-density;
 * frfrogspad.com/intballi.htm (load density and ignition).
 */

export interface Powder {
  name: string;
  /** Lee VMD, cubic centimetres per grain. */
  vmd: number;
  /** Bulk density, grams per cubic centimetre: a grain is 0.06479891 g. */
  density: number;
  kind: 'rifle' | 'pistol' | 'magnum';
}

const GRAIN_G = 0.06479891;

function powder(name: string, vmd: number, kind: Powder['kind']): Powder {
  return { name, vmd, density: GRAIN_G / vmd, kind };
}

/** A working set; a reader who has another can read its VMD off the same chart. */
export const POWDERS: Powder[] = [
  powder('Hodgdon Varget', 0.0731, 'rifle'),
  powder('Hodgdon H4350', 0.0725, 'rifle'),
  powder('Hodgdon H4831', 0.0725, 'rifle'),
  powder('Hodgdon H1000', 0.0713, 'rifle'),
  powder('Hodgdon H335', 0.0645, 'rifle'),
  powder('Hodgdon H380', 0.0691, 'rifle'),
  powder('Hodgdon H414', 0.0661, 'rifle'),
  powder('Hodgdon H4198', 0.075, 'rifle'),
  powder('Hodgdon Benchmark', 0.0715, 'rifle'),
  powder('IMR 3031', 0.0762, 'rifle'),
  powder('IMR 4064', 0.0745, 'rifle'),
  powder('IMR 4198', 0.0792, 'rifle'),
  powder('IMR 4350', 0.0735, 'rifle'),
  powder('IMR 4831', 0.0735, 'rifle'),
  powder('IMR 4895', 0.0728, 'rifle'),
  powder('IMR 7828', 0.0725, 'rifle'),
  powder('Alliant Reloder 15', 0.0706, 'rifle'),
  powder('Alliant Reloder 19', 0.0706, 'rifle'),
  powder('Alliant Reloder 22', 0.0697, 'rifle'),
  powder('Vihtavuori N133', 0.077, 'rifle'),
  powder('Vihtavuori N140', 0.0733, 'rifle'),
  powder('Vihtavuori N150', 0.0746, 'rifle'),
  powder('Vihtavuori N160', 0.0734, 'rifle'),
  powder('Vihtavuori N165', 0.0712, 'rifle'),
  powder('Vihtavuori N550', 0.0692, 'rifle'),
  powder('Vihtavuori N560', 0.069, 'rifle'),
  powder('Winchester 748', 0.0655, 'rifle'),
  powder('Winchester 760', 0.0666, 'rifle'),
  powder('Accurate 2230', 0.0657, 'rifle'),
  powder('Accurate 4350', 0.074, 'rifle'),
  powder('Ramshot TAC', 0.0658, 'rifle'),
  powder('Alliant 2400', 0.0742, 'magnum'),
  powder('Hodgdon H110', 0.0656, 'magnum'),
  powder('Winchester 296', 0.0656, 'magnum'),
  powder('Alliant Power Pistol', 0.0889, 'pistol'),
  powder('Hodgdon Titegroup', 0.0848, 'pistol'),
  powder('Hodgdon HP38', 0.0926, 'pistol'),
  powder('Winchester 231', 0.0931, 'pistol'),
  powder('Alliant Unique', 0.1092, 'pistol'),
  powder('Alliant Bullseye', 0.1064, 'pistol'),
  powder('Vihtavuori N310', 0.1214, 'pistol'),
  powder('Vihtavuori N320', 0.121, 'pistol'),
  powder('Vihtavuori N340', 0.1066, 'pistol')
];

/** The settled volume of a charge, in cubic millimetres. */
export function chargeVolumeMm3(grains: number, p: Powder): number {
  return grains * p.vmd * 1000;
}

/** Fill percentages of the space under the bullet at which the panel speaks up. */
export const FILL = {
  /** Above this a compressed charge is a warning; up to it, a note. */
  compressed: 105,
  /** Above this the charge cannot be seated: refused. A convention; see the module notes. */
  error: 110,
  /** Below this a caution about load density. */
  low: 80,
  /** Below this a warning: erratic ignition territory for slow powders. */
  veryLow: 50
} as const;
