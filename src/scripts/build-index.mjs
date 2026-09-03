// Build the search index the app ships with, from the records it serves.
//
// The index belongs to the *app*, not to the data. A search index is shaped by what the search
// does -- these fields and no others, because these are what the list filters and sorts on -- and a
// copy of one sitting in the data directory would be a second statement of the same facts, able to
// go stale against the first. So it is generated here at build time and gitignored.
//
// Everything else is fetched per cartridge, from <family>/<key>.json, only when one
// is opened. 532 records is 3.4 MB whole and about 100 KB as this index.

import { readdir, readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXCLUDE, FAMILIES, ROOT } from './records.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// The dataset at the repository root: the one copy of the records.
const RECORDS = ROOT;
const SVG = join(ROOT, 'svg');
const OUTLINES = join(here, '..', 'public', 'outlines');
const OUT = join(here, '..', 'src', 'lib', 'index.generated.json');

/**
 * The size, in millimetres, of the drawing shipped for each cartridge.
 *
 * The drawings are rendered upstream by BallisticViz and vendored into the repository's `svg/`
 * directory. Each one carries its own extent on its root element -- `width` and `height` in
 * millimetres, with the viewBox in the renderer's own units -- so a page laying several out at one
 * scale can size them without loading them first. The build copies them to `public/outlines/` for
 * the deployed app and reads the same source files for the index.
 *
 * A cartridge with no drawing is simply absent: 6 records publish too little to draw, and the
 * card falls back to the outline it can build from the dimensions themselves.
 */
async function drawings() {
  const sizes = new Map();
  for (const family of FAMILIES) {
    let files;
    try {
      files = await readdir(join(SVG, family));
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.svg')) continue;
      const source = join(SVG, family, file);
      const head = (await readFile(source, 'utf8')).slice(0, 400);
      const w = /width="([\d.]+)"/.exec(head);
      const h = /height="([\d.]+)"/.exec(head);
      if (w && h) {
        await mkdir(join(OUTLINES, family), { recursive: true });
        await cp(source, join(OUTLINES, family, file));
        sizes.set(`${family}/${file.slice(0, -4)}`, [Number(w[1]), Number(h[1])]);
      }
    }
  }
  return sizes;
}

const sizes = await drawings();

const families = [...FAMILIES].sort();

/**
 * The case length, whichever way the record states it.
 *
 * Metallic cartridges publish a single `L3`. A shot cartridge publishes a *list* of hull lengths --
 * a 12 gauge offers nine, from 12/35 to 12/89 -- because the gauge names a family and the length
 * names a member of it. The longest is taken here so the list has one number to sort on, and the
 * cartridge page shows all of them.
 */
function length(record) {
  const lengths = record.cartridge?.lengths;
  if (!lengths) return null;
  if (Array.isArray(lengths)) {
    const values = lengths.map((entry) => entry.l).filter((value) => typeof value === 'number');
    return values.length ? Math.max(...values) : null;
  }
  return lengths.L3 ?? null;
}

function overallLength(record) {
  const lengths = record.cartridge?.lengths;
  return lengths && !Array.isArray(lengths) ? (lengths.L6 ?? null) : null;
}

/**
 * The published points of the case's outline, as `[radius, z]` pairs in millimetres.
 *
 * **Only what the sheet dimensions.** Corner radii, the extractor groove and the junction cone's
 * fillets are all published and all left out: this is a thumbnail, and drawing them would mean
 * choosing how to interpolate between them, which is a renderer's job and not a card's. What is
 * here is the skeleton every CIP drawing states outright -- rim, body, shoulder, neck -- so a card
 * that shows a bottleneck case is showing one because the record says so.
 *
 * Returns `null` where the record does not publish enough to place a single point, rather than
 * inventing a shape to fill the space.
 */
function shape(record) {
  const cartridge = record.cartridge ?? {};

  // A shot cartridge is dimensioned in its own letters: d across the body, g across the rim, t the
  // rim's thickness. It has no shoulder and no neck.
  const shot = cartridge.dimensions;
  if (shot?.d && shot?.g) {
    const l = length(record);
    if (!l) return null;
    return [
      [shot.g / 2, 0],
      [shot.g / 2, shot.t ?? 0],
      [shot.d / 2, shot.t ?? 0],
      [shot.d / 2, l]
    ];
  }

  const head = cartridge.caseHead ?? {};
  const chamber = cartridge.powderChamber ?? {};
  const collar = cartridge.collar ?? {};
  const lengths = cartridge.lengths ?? {};

  const R1 = head.R1;
  const R = head.R ?? 0;
  const P1 = chamber.P1;
  const L3 = lengths.L3;
  const H2 = collar.H2;
  if (!R1 || !P1 || !L3 || !H2) return null;

  const points = [
    [R1 / 2, 0],
    [R1 / 2, R],
    [P1 / 2, R]
  ];

  // A bottleneck case states where its shoulder starts (L1) and ends (L2). A straight one states
  // neither, and runs from the body to the mouth in one line.
  if (lengths.L1 && lengths.L2) {
    points.push([(chamber.P2 ?? P1) / 2, lengths.L1]);
    points.push([(collar.H1 ?? H2) / 2, lengths.L2]);
  }
  points.push([H2 / 2, L3]);
  return points;
}

const entries = [];
for (const family of families) {
  const files = (await readdir(join(RECORDS, family))).filter((name) => name.endsWith('.json'));
  for (const file of files.sort()) {
    if (file.slice(0, -5) in EXCLUDE) continue;
    const record = JSON.parse(await readFile(join(RECORDS, family, file), 'utf8'));
    const cartridge = record.cartridge ?? {};
    entries.push({
      key: record.key,
      name: record.name,
      family: record.family,
      // Printed on the sheet: `country` is in the drawing's title block. Filtering a list of 532
      // needs it in hand, not a fetch away.
      country: record.country ?? null,
      alt: record.alternativeNames ?? [],
      // Two dimensions, so the list can be sorted and scanned without opening anything: the case
      // length and the bullet diameter are what identifies a cartridge to a reader at a glance.
      L3: length(record),
      L6: overallLength(record),
      G1: cartridge.projectile?.G1 ?? null,
      // The size of the drawing shipped for this cartridge, in millimetres, or null where there is
      // none. `shape` is the fallback the card draws itself; see below for what it does not carry.
      svg: sizes.get(`${record.family}/${record.key}`) ?? null,
      shape: shape(record),
      // How far the record can be trusted, and how many findings nothing explains. Both come
      // from the dataset's own annotations (see cartridges/README.md); the card shows the one
      // word, the cartridge page lists the findings.
      confidence: record.annotations?.confidence ?? 'unverified',
      checks: (record.annotations?.implausible ?? []).length,
      warnings: (record.annotations?.implausible ?? []).filter((f) => !f.known).length,
      // The second verification: the drawn bullet's nose form, held against the drawing by a
      // person or not. Independent of the numbers' confidence.
      bulletVerified: record.annotations?.defaultBullet?.verified === true
    });
  }
}

entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(entries), 'utf8');

const bytes = Buffer.byteLength(JSON.stringify(entries));
console.log(
  `index: ${entries.length} records, ${families.length} families, ${(bytes / 1024).toFixed(1)} KB` +
    ` -- ${sizes.size} with a rendered drawing, ${entries.length - sizes.size} falling back`
);
