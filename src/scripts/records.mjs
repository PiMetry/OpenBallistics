// The records the site serves: the dataset at the repository root, one directory per family.
//
// There is one copy of the records in this repository and it is the dataset itself. The site
// used to keep its own under the app directory, minus a field and eight records, so that the
// difference between site and dataset was readable as files; that was two copies of 532 files
// in one tree, and the difference is small enough to state here instead.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** The repository root, where the dataset's family directories are. */
export const ROOT = join(here, '..', '..');

/** The case families, which are the dataset's directories at the repository root. */
export const FAMILIES = ['belted', 'pistol', 'rimfire', 'rimless', 'rimmed', 'shotshell'];

/**
 * Records left out of the site, by key, each with its reason.
 *
 * The dataset keeps them: it is the published standard and carries what the standard carries.
 * The site is a working copy for readers looking up cartridge dimensions, and these are not what
 * such a reader is looking for. Drawn up by reading all 540 names, not by a pattern trusted
 * blind; a rule that silently excludes the wrong cartridge is worse than a list somebody has read.
 * They are left out of the index, which is the only way onto a cartridge page.
 */
export const EXCLUDE = {
  // Marking cartridges: a paint-filled training projectile, not a bullet.
  '9_mm_fx_cqt': 'marking / close-quarter training round (Simunition FX and CQT)',
  '38_357_fx': 'marking round (Simunition FX)',
  // Shot loadings in rifle and pistol cases: no bullet, and the card has nothing to draw.
  '22_long_shot': 'shot loading, no bullet',
  '22_long_rifle_shot_claybirding': 'shot loading, no bullet',
  '5_6_mm_flobert_plombs_dc': 'Flobert shot loading ("a plombs" is "with shot")',
  '5_6_mm_flobert_plombs_sc': 'Flobert shot loading',
  '9mm_flobert_plombs_carton': 'Flobert shot loading',
  '9mm_flobert_plombs_metal': 'Flobert shot loading'
};
