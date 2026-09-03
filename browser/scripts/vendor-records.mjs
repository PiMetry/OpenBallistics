// Copy the published records into the browser's own record directories.
//
// This repository holds the dataset at its root, one directory per case family (`belted/`,
// `pistol/`, ...), and the browser under `browser/`. The browser keeps its *own* copy of the
// records at `browser/<family>/`: the same files, minus the fields the site does not show, minus
// the records it leaves out. They are committed, because the site and the dataset are allowed to
// disagree deliberately -- a marking round is in the dataset and not on the site -- and a reader
// of the repository should be able to see exactly what the site serves without running a build.
//
// Run this after the root dataset changes; the diff of `browser/<family>/` is the review.

import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const BROWSER = join(here, '..');

/** The case families, which are the dataset's directories at the repository root. */
export const FAMILIES = ['belted', 'pistol', 'rimfire', 'rimless', 'rimmed', 'shotshell'];

/**
 * Fields this site does not show, removed from its copy.
 *
 * The C.I.P. table a cartridge appears in is a fact about how the standard is *organised* rather
 * than about the cartridge, and the family already says it. It stays in the dataset, which
 * carries what the sheet carries; this is the site's working copy, and it holds only what the
 * site puts on screen.
 */
const DROP = ['tab'];

/**
 * Records left out of the site, by key, each with its reason.
 *
 * The dataset keeps them: it is the published standard and carries what the standard carries.
 * The site is a working copy for readers looking up cartridge dimensions, and these are not what
 * such a reader is looking for. Drawn up by reading all 540 names, not by a pattern trusted
 * blind; a rule that silently excludes the wrong cartridge is worse than a list somebody has read.
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

if (process.argv[1] && process.argv[1].endsWith('vendor-records.mjs')) {
let copied = 0;
let excluded = 0;
for (const family of FAMILIES) {
  const source = join(ROOT, family);
  const target = join(BROWSER, family);
  let files;
  try {
    files = (await readdir(source)).filter((name) => name.endsWith('.json'));
  } catch {
    console.error(`vendor: no records at ${source}; this script expects to run inside OpenBallistics`);
    process.exit(1);
  }
  // Replaced rather than merged, so a record deleted from the dataset does not linger here.
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const file of files) {
    const key = file.slice(0, -5);
    if (key in EXCLUDE) {
      excluded += 1;
      continue;
    }
    const record = JSON.parse(await readFile(join(source, file), 'utf8'));
    for (const field of DROP) delete record[field];
    await writeFile(join(target, file), JSON.stringify(record, null, 2) + '\n', 'utf8');
    copied += 1;
  }
}
console.log(`vendor: ${copied} records into browser/<family>/, ${excluded} left out for the site`);
}
