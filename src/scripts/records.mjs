// The records the site serves: the dataset at the repository root, one directory per family.
//
// There is one copy of the records in this repository and it is the dataset itself. The site
// used to keep its own under the app directory, minus a field and eight records, so that the
// difference between site and dataset was readable as files; that was two copies of 532 files
// in one tree, and the difference is small enough to state in one file instead.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** The repository root, where the dataset's family directories are. */
export const ROOT = join(here, '..', '..');

/** The case families, which are the dataset's directories at the repository root. */
export const FAMILIES = ['belted', 'pistol', 'rimfire', 'rimless', 'rimmed', 'shotshell'];

/**
 * Records left out of the site, by key, each with its reason -- read from `scope.json` at the
 * repository root.
 *
 * The dataset keeps them: it is the published standard and carries what the standard carries.
 * The site is a working copy for readers looking up cartridge dimensions, and these are not what
 * such a reader is looking for -- marking rounds, shot loadings filed among rifle cartridges,
 * chamber-only test-barrel duplicates. They are left out of the index, which is the only way onto
 * a cartridge page, and not served or shipped.
 *
 * The list is authored upstream, in BallisticViz (`src/cip/scope.py`), where a test pins it and
 * where it was drawn up by reading all 540 names rather than by a pattern trusted blind; its build
 * writes `scope.json` and the sync copies it here with the records. It used to be a literal in
 * this file, which was a second copy of a decision that could drift from the first.
 */
export const EXCLUDE = JSON.parse(readFileSync(join(ROOT, 'scope.json'), 'utf8'));
