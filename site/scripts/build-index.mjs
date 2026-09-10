// Build the search index the app ships with, from the records it serves.
//
// The index belongs to the *app*, not to the data. A search index is shaped by what the search
// does - these fields and no others, because these are what the list filters and sorts on - and a
// copy of one sitting in the data directory would be a second statement of the same facts, able to
// go stale against the first. So it is generated here at build time and gitignored.
//
// Everything else is fetched per cartridge, from data/cartridges/<family>/<key>.json, only when one
// is opened. 532 records is 3.4 MB whole and about 100 KB as this index.
//
// Run under `vite-node` rather than `node`: the drawings are measured by rendering them, which
// means importing the TypeScript libraries in lib/ and resolving the `@lib` alias. See
// `scripts/drawings.ts`, and `npm run index`.

import { readdir, readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAMILIES, DATA, CARTRIDGES } from './records.mjs';
import { measure, measureBullet } from './drawings.ts';

const here = dirname(fileURLToPath(import.meta.url));
// Cartridge records, grouped by family under data/cartridges/.
const RECORDS = CARTRIDGES;
const FLAG_SOURCE = join(here, '..', 'node_modules', 'flag-icons', 'flags', '4x3');
const FLAGS = join(here, '..', 'public', 'flags');
const OUT = join(here, '..', 'src', 'lib', 'index.generated.json');
const BULLETS = join(DATA, 'bullets');
const BULLETS_OUT = join(here, '..', 'src', 'lib', 'bullets.generated.json');
const FLAGS_OUT = join(here, '..', 'src', 'lib', 'flags.generated.json');

const families = [...FAMILIES].sort();

/**
 * The case length, whichever way the record states it.
 *
 * Metallic cartridges publish a single `L3`. A shot cartridge publishes a *list* of hull lengths --
 * a 12 gauge offers nine, from 12/35 to 12/89 - because the gauge names a family and the length
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

/**
 * Where a cartridge comes from, as ISO country codes.
 *
 * The sheet's title block names an origin and the records copy it, which is why this is not just
 * `record.country`:
 *
 * - Two records write `Italy` and one writes `France` where every other record writes a code.
 *   Left alone they become their own entries in the country filter, so that Italy is listed twice
 *   and neither entry finds all of it. Normalised here rather than edited in the dataset - the
 *   records are the published thing and correcting them is their owner's call, not the site's.
 * - Six cartridges are standardised by two countries and say so: `IT/DE`, `DE/AT`, `DE/FI`. Those
 *   are two origins, not a twenty-seventh country, and a reader filtering for Germany should find
 *   the 9 x 18 that Germany and Austria published together.
 *
 * `SU` and `CS` are kept exactly as they are. They are the Soviet Union and Czechoslovakia, which
 * is what those sheets say and what those cartridges are; they have no current flag and the site
 * prints the code instead of inventing a successor state for them.
 */
const COUNTRY_ALIASES = new Map([
  ['ITALY', 'IT'],
  ['FRANCE', 'FR']
]);

function countriesOf(record) {
  const published = record.country;
  if (typeof published !== 'string' || !published.trim()) return [];
  return published
    .split('/')
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean)
    .map((part) => COUNTRY_ALIASES.get(part) ?? part);
}

/**
 * The flags for the countries the dataset actually names, copied out of `flag-icons` (MIT).
 *
 * Only the ones in use: the package ships 271 and this dataset names twenty. They are copied
 * rather than committed for the same reason the drawings are - the package is the one copy, and a
 * second in `public/` could go stale against it.
 *
 * Which codes have a flag is written out beside the index, because the page has to know: a code
 * with no flag is shown as a code, and the alternative is an image that quietly fails to load.
 */
async function flags(codes) {
  const drawn = [];
  const missing = [];
  for (const code of [...codes].sort()) {
    const file = `${code.toLowerCase()}.svg`;
    try {
      await mkdir(FLAGS, { recursive: true });
      await cp(join(FLAG_SOURCE, file), join(FLAGS, file));
      drawn.push(code);
    } catch {
      missing.push(code);
    }
  }
  return { drawn, missing };
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
 * here is the skeleton every CIP drawing states outright - rim, body, shoulder, neck - so a card
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
    const record = JSON.parse(await readFile(join(RECORDS, family, file), 'utf8'));
    const cartridge = record.cartridge ?? {};
    // The drawings this cartridge has and how large each one comes out, measured by drawing
    // them through the renderer the browser will use; see `scripts/drawings.ts`. The card's
    // extent is the object alone, as it always was; the whole page comes along as `sheet` for the
    // faces that show the dimensions. Both in millimetres. `drawings` is absent wherever there is
    // only the one drawing to show, which is most of the dataset.
    const { svg, sheet, drawings: shippedDrawings } = measure(record);
    entries.push({
      key: record.key,
      name: record.name,
      family: record.family,
      // Printed on the sheet: the origin is in the drawing's title block. Filtering a list of 532
      // needs it in hand, not a fetch away. See `countriesOf` for why it is a list of codes and
      // not the string the record publishes.
      countries: countriesOf(record),
      alt: record.alternativeNames ?? [],
      // Two dimensions, so the list can be sorted and scanned without opening anything: the case
      // length and the bullet diameter are what identifies a cartridge to a reader at a glance.
      L3: length(record),
      L6: overallLength(record),
      G1: cartridge.projectile?.G1 ?? null,
      // The size of the drawing rendered for this cartridge, in millimetres, or null where the
      // record publishes too little to draw one. `shape` is the fallback the card draws itself;
      // see below for what it does not carry.
      svg,
      ...(sheet && sheet !== svg ? { sheet } : {}),
      ...(shippedDrawings ? { drawings: shippedDrawings } : {}),
      shape: shape(record),
      // How many plausibility rules fired on the record, and how many of those nothing explains.
      // From the dataset's own annotations (see cartridges/README.md); the cartridge page lists
      // what each finding is. A record can be entirely right and still carry an explained one.
      checks: (record.annotations?.implausible ?? []).length,
      warnings: (record.annotations?.implausible ?? []).filter((f) => !f.known).length
    });
  }
}

const flagged = await flags(new Set(entries.flatMap((entry) => entry.countries)));
await writeFile(FLAGS_OUT, JSON.stringify(flagged.drawn), 'utf8');
if (flagged.missing.length) {
  console.log(
    `flags: ${flagged.drawn.length} copied; no flag for ${flagged.missing.join(', ')}` +
      ' (shown as the code)'
  );
}

entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(entries), 'utf8');

/**
 * The bullet catalogue (`data/bullets/<key>.json`): one row per
 * bullet with what the list needs - who makes it, what it is called, its diameter, weight and
 * length, and the two extents of the drawing the site makes of it, measured by making it. The
 * whole record is fetched when a bullet is opened, like a cartridge's.
 */
const bullets = [];
try {
  const files = (await readdir(BULLETS)).filter((name) => name.endsWith('.json')).sort();
  for (const file of files) {
    const record = JSON.parse(await readFile(join(BULLETS, file), 'utf8'));
    // A bullet whose record will not draw lists all the same, without the extents.
    const size = measureBullet(record);
    bullets.push({
      key: record.key,
      sample: record.sample === true,
      sampleFor: record.sampleFor ?? null,
      manufacturer: record.manufacturer,
      line: record.line ?? null,
      model: record.model,
      name: record.name,
      calibre: record.calibre,
      diameter: record.diameter,
      mass: record.mass,
      length: record.derived?.length ?? record.length ?? null,
      g1: record.ballistics?.g1 ?? null,
      g7: record.ballistics?.g7 ?? null,
      assumed: record.derived?.assumed?.length ?? 0,
      ...(size ? { svg: size.svg, tight: size.tight } : {})
    });
  }
} catch {
  // No catalogue yet.
}
await writeFile(BULLETS_OUT, JSON.stringify(bullets), 'utf8');
console.log(`bullets: ${bullets.length} in the catalogue`);

const bytes = Buffer.byteLength(JSON.stringify(entries));
const shipped = entries.flatMap((entry) => entry.drawings ?? []);
const kinds = new Map();
for (const drawing of shipped) {
  const name = drawing.subject;
  kinds.set(name, (kinds.get(name) ?? 0) + 1);
}
const drawn = entries.filter((entry) => entry.svg).length;
console.log(
  `index: ${entries.length} records, ${families.length} families, ${(bytes / 1024).toFixed(1)} KB` +
    ` - ${drawn} with a rendered drawing, ${entries.length - drawn} falling back`
);
if (shipped.length) {
  console.log(
    `drawings: ${shipped.length} beyond the one per cartridge, across` +
      ` ${entries.filter((entry) => entry.drawings).length} cartridges - ` +
      [...kinds].map(([name, n]) => `${n} ${name}`).join(', ')
  );
}
