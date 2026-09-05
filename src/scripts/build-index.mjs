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
const FLAG_SOURCE = join(here, '..', 'node_modules', 'flag-icons', 'flags', '4x3');
const FLAGS = join(here, '..', 'public', 'flags');
const OUT = join(here, '..', 'src', 'lib', 'index.generated.json');
const FLAGS_OUT = join(here, '..', 'src', 'lib', 'flags.generated.json');

/**
 * The size of a drawing, in millimetres, read off the file: the whole page and the object alone.
 *
 * The drawings are rendered upstream by BallisticViz and vendored into the repository's `svg/`
 * directory. Each carries four faces in one file (2026-09-05; see `svg_drawing` there): the root's
 * `width` and `height` are the page in real millimetres, its `viewBox` the same page in the
 * renderer's units, and a `<view id="visual">` names the box the faces without dimensions crop to.
 * So the page's size is read straight off the root, the scale is the ratio of the two, and the
 * object's size is that view's box divided by the scale. A page laying several drawings out at one
 * scale can size them without loading them first, and nothing here has to know how many units the
 * renderer draws to the millimetre any more.
 *
 * Returns `{ svg, tight }`, both `[width, height]` in millimetres; `tight` falls back to the page
 * for a file with no view, so an older drawing still lays out.
 */
async function extent(file) {
  const head = (await readFile(file, 'utf8')).slice(0, 1200);
  const w = /<svg [^>]*width="([\d.]+)"/.exec(head);
  const h = /<svg [^>]*height="([\d.]+)"/.exec(head);
  const box = /<svg [^>]*viewBox="([\d.\- ]+)"/.exec(head);
  if (!w || !h) return null;
  const svg = [Number(w[1]), Number(h[1])];
  const view = /<view id="visual" viewBox="([\d.\- ]+)"/.exec(head);
  if (!box || !view) return { svg, tight: svg };
  const unitsPerMm = Number(box[1].split(/\s+/)[2]) / svg[0];
  const [, , tw, th] = view[1].split(/\s+/).map(Number);
  return { svg, tight: [tw / unitsPerMm, th / unitsPerMm] };
}

/**
 * The drawings shipped for each cartridge.
 *
 * `svg/<family>/<key>.svg` is the cartridge's own drawing: one picture, which is what a card in
 * the list shows and what a cartridge page opens at. Every one shipped so far is the same kind of
 * picture -- the renderer titles them `<name> - visual` -- of the cartridge, at one length.
 *
 * A cartridge is more than one drawing along three axes, and `svg/<family>/<key>/`, a directory
 * beside that file, holds the rest:
 *
 * - **subject**: the cartridge, or the chamber it is fired in. Two drawings of one standard; the
 *   tables have always shown both sides and the picture showed one.
 * - **style**: `visual`, the rendered object, or `technical`, the dimensioned drawing. The same
 *   geometry answering two different questions -- what is it, and what are its numbers.
 * - **length**: a shot cartridge is published at several hull lengths (a 12 gauge at nine, from
 *   12/35 to 12/89) and a single drawing can only be at one of them.
 *
 * Which is which is read off the path: every directory name and every `_`- or `-`-separated word
 * of the file name is a token, and `chamber`, `cartridge`, `technical`/`tech` and `visual` name an
 * axis. So all of `technical/12_70.svg`, `12_70_technical.svg` and `chamber/technical/12_70.svg`
 * say what they are, and an export is not held to one shape. What is left over names the length.
 *
 * All of it is optional. Absent the directory the page shows the one drawing, as it always did,
 * and a toggle appears only for a kind that has actually been drawn.
 *
 * The build copies both to `public/outlines/` for the deployed app and reads the same source files
 * for the index. A cartridge with no drawing at all is simply absent: 6 records publish too little
 * to draw, and the card falls back to the outline it can build from the dimensions themselves.
 */
async function drawings() {
  const sizes = new Map();
  const extra = new Map();

  // The directory is walked rather than listed, so a drawing may be filed under `technical/` or
  // named `..._technical.svg` and mean the same thing.
  async function walk(family, key, within) {
    const found = [];
    const dir = join(SVG, family, key, within);
    for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const relative = within ? `${within}/${item.name}` : item.name;
      if (item.isDirectory()) {
        found.push(...(await walk(family, key, relative)));
        continue;
      }
      if (!item.name.endsWith('.svg')) continue;
      const size = await extent(join(dir, item.name));
      if (!size) continue;
      await mkdir(dirname(join(OUTLINES, family, key, relative)), { recursive: true });
      await cp(join(dir, item.name), join(OUTLINES, family, key, relative));
      // Kept as a path under the family, which is how a page addresses either kind.
      found.push({ file: `${key}/${relative}`, tokens: tokens(relative), ...size });
    }
    return found;
  }

  for (const family of FAMILIES) {
    let items;
    try {
      items = await readdir(join(SVG, family), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of items) {
      if (item.isDirectory()) {
        const found = await walk(family, item.name, '');
        if (found.length) extra.set(`${family}/${item.name}`, found);
        continue;
      }
      if (!item.name.endsWith('.svg')) continue;
      const source = join(SVG, family, item.name);
      const size = await extent(source);
      if (!size) continue;
      await mkdir(join(OUTLINES, family), { recursive: true });
      await cp(source, join(OUTLINES, family, item.name));
      sizes.set(`${family}/${item.name.slice(0, -4)}`, size);
    }
  }
  return { sizes, extra };
}

const { sizes, extra } = await drawings();

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

/**
 * Where a cartridge comes from, as ISO country codes.
 *
 * The sheet's title block names an origin and the records copy it, which is why this is not just
 * `record.country`:
 *
 * - Two records write `Italy` and one writes `France` where every other record writes a code.
 *   Left alone they become their own entries in the country filter, so that Italy is listed twice
 *   and neither entry finds all of it. Normalised here rather than edited in the dataset -- the
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
 * rather than committed for the same reason the drawings are -- the package is the one copy, and a
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

/** A name written the way the dataset spells its keys: lower case, one underscore per gap. */
function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Every word of a drawing's path, which is where its subject, style and length are written. */
function tokens(path) {
  return slug(path.replace(/\.svg$/, '')).split('_').filter(Boolean);
}

/** The word that names the subject. Everything else in a path names the length. */
const SUBJECTS = new Map([
  ['cartridge', 'cartridge'],
  ['chamber', 'chamber']
]);

/**
 * What a drawing is, read off the words in its path.
 *
 * The default is the cartridge, so a file that says nothing is that, and `12_70.svg` still means
 * what it meant before there was anything else for it to mean. There is no style axis any more:
 * one file carries both styles and the page picks (2026-09-05).
 */
function kind(words) {
  let subject = 'cartridge';
  const rest = [];
  for (const word of words) {
    if (SUBJECTS.has(word)) subject = SUBJECTS.get(word);
    else rest.push(word);
  }
  return { subject, name: rest.join('_') };
}

/**
 * How much wider than the hull a drawing of it may be, in millimetres.
 *
 * The renderer draws the hull plus a small constant margin -- 0.8 mm in every drawing shipped so
 * far -- so a drawing is always a little wider than the length it is drawn at and never narrower.
 * That is enough to tell nine drawings of a 12 gauge apart without trusting their file names, as
 * long as the margin stays under the gap between two published lengths; the closest pair in the
 * dataset is 1.5 mm apart (63.5 and 65.0), so this is held below that.
 *
 * It holds only for a visual drawing of the cartridge, which is the only kind it was measured on.
 * A technical drawing is as wide as its dimension lines and its text, and a chamber is as long as
 * the barrel it is sectioned from; neither width is the hull's. Those name their length or they
 * are reported and left out.
 */
const DRAWING_MARGIN = 1.4;

/**
 * A drawing's object box against the case it is a drawing of.
 *
 * The file says its own size in millimetres, so there is nothing to convert; what is worth
 * checking is that the object is about the size of the case -- a cartridge's tight box is the hull
 * plus a margin, a chamber's the barrel section it is cut from -- because a drawing ten times its
 * case is a drawing with the wrong scale on its root, and the sheet that comes off the printer
 * would be wrong by the same factor.
 */
function checkScale(record, file, tight, subject, l) {
  if (!l) return;
  const ratio = tight[0] / l;
  if (ratio >= 0.9 && ratio <= 6) return;
  console.warn(
    `  ${record.family}/${record.key}: ${file} is ${tight[0].toFixed(1)} mm across for a` +
      ` ${l} mm case -- ${ratio.toFixed(1)}x, so the ${subject} drawing is not sized right`
  );
}

/**
 * Every drawing shipped for a cartridge, each with what it is a drawing of.
 *
 * The three axes are read from the path by `kind`; what is left over names the length, matched
 * against the markings the sheet prints -- `12_70.svg` or `70.svg` for the 12/70. A visual drawing
 * of the cartridge that names no length is matched on its width instead, which is what lets the
 * cartridge's own `<key>.svg` take its place among the lengths without being renamed.
 *
 * A length may be claimed once per kind: a cartridge and a chamber are both drawn at 12/70 and
 * neither is the other. `<key>.svg` is offered last and only for a length nothing else has taken,
 * so it never doubles a drawing that came out of the directory. Whichever drawing ends up at that
 * length is flagged `main`: it is the picture the card in the list shows, and so the one the
 * cartridge page opens at, whether it came from the file or from the directory that displaced it.
 *
 * A drawing whose length cannot be told is reported rather than filed under a guess -- on a 12
 * gauge that would put a picture of one cartridge under the name of another. Returns `null` where
 * there is nothing to say beyond "there is one drawing", which is most of the dataset.
 */
function cartridgeDrawings(record, files, single) {
  const published = record.cartridge?.lengths;
  const rows = Array.isArray(published)
    ? published
        .map((entry, index) => ({ index, l: entry.l, marking: entry.marking ?? null }))
        .filter((row) => typeof row.l === 'number')
    : [];
  const many = rows.length > 1;

  const taken = new Set();
  const free = (what, row) => !taken.has(`${what.subject}|${row.index}`);
  const claim = (what, row) => taken.add(`${what.subject}|${row.index}`);

  const placed = [];
  const unnamed = [];
  for (const found of files ?? []) {
    const what = { ...kind(found.tokens), found };
    const row =
      what.name &&
      rows.find(
        (row) =>
          row.marking &&
          free(what, row) &&
          [slug(row.marking), slug(row.marking.split('/').pop())].includes(what.name)
      );
    if (row) {
      claim(what, row);
      placed.push({ ...what, row });
    } else {
      unnamed.push(what);
    }
  }

  const own = single ? { subject: 'cartridge', name: '', found: single } : null;
  for (const what of [...unnamed, ...(own ? [own] : [])]) {
    // A cartridge published at one length is drawn at it without anybody having to say so.
    if (!rows.length) {
      placed.push({ ...what, row: null });
      continue;
    }
    if (!many) {
      if (free(what, rows[0])) {
        claim(what, rows[0]);
        placed.push({ ...what, row: rows[0] });
      }
      continue;
    }
    // A cartridge drawing's object box is the hull plus a margin, so its width says its length; a
    // chamber's is the barrel section and says nothing about which hull it was cut for.
    const measurable = what.subject === 'cartridge';
    const fits = measurable
      ? rows.filter((row) => free(what, row) && row.l <= what.found.tight[0])
      : [];
    const row = fits.length ? fits.reduce((a, b) => (b.l > a.l ? b : a)) : null;
    if (row && what.found.tight[0] - row.l <= DRAWING_MARGIN) {
      claim(what, row);
      placed.push({ ...what, row });
    } else if (what !== own) {
      console.warn(
        `  ${record.family}/${record.key}: ${what.found.file} is a ${what.subject}` +
          ' drawing at no length this record publishes'
      );
    }
  }

  // The length the cartridge's own drawing is at, whether or not it is the drawing filed there.
  // Worked out from its width the same way, but without claiming: a directory drawing of the same
  // length displaces the file, and the page still has to know which length the card is showing.
  const fits = single ? rows.filter((row) => row.l <= single.tight[0]) : [];
  const at = fits.length ? fits.reduce((a, b) => (b.l > a.l ? b : a)) : null;
  const mainRow = at && single.tight[0] - at.l <= DRAWING_MARGIN ? at : null;
  const isMain = (what) =>
    what.subject === 'cartridge' && (mainRow ? what.row?.index === mainRow.index : !many);

  const order = { cartridge: 0, chamber: 1 };
  const out = placed.map((what) => {
    checkScale(record, what.found.file, what.found.tight, what.subject, what.row?.l ?? length(record));
    return {
      file: what.found.file,
      // Both in millimetres, read off the file; see `extent`. Everything downstream -- the shared
      // scale of the grid, the pair on the cartridge page, the printed sheet -- is in millimetres.
      svg: what.found.svg,
      tight: what.found.tight,
      subject: what.subject,
      ...(what.row ? { l: what.row.l, marking: what.row.marking } : {}),
      ...(isMain(what) ? { main: true } : {})
    };
  });
  out.sort((a, b) => order[a.subject] - order[b.subject] || (a.l ?? 0) - (b.l ?? 0));
  // One drawing of one kind is what `svg` already says. The list earns its place in the index
  // where there is a choice to make: another kind, or a length to pick between.
  return out.length > 1 || (out.length === 1 && many) ? out : null;
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

/**
 * What a person has confirmed about a record, facet by facet.
 *
 * A record is not verified or unverified as a whole. Five different things can be proofread by
 * five different people, at five different times:
 * the cartridge's published numbers, the chamber's, the drawing of each, and the nose form of the
 * bullet the cartridge drawing puts in the case mouth.
 *
 * **Two of them already had a home and keep it.** The cartridge's numbers are `confidence`, which
 * is a word rather than a flag because it also carries `implausible`; the bullet is
 * `defaultBullet.verified`. Restating either inside `annotations.verified` would be a second copy
 * of a fact able to disagree with the first, which is the thing this dataset avoids everywhere
 * else. So `annotations.verified` carries only the three that had nowhere to live:
 *
 * ```json
 * "verified": { "chamber": true, "cartridgeDrawing": true, "chamberDrawing": false }
 * ```
 *
 * Absent means unverified, never "does not apply". **What does not apply is left out entirely**,
 * and that is the difference the site counts on: a facet missing from the returned object is one
 * nobody can confirm because there is nothing to confirm -- a chamber drawing that has not been
 * rendered, a bullet on a record that dimensions no bullet. Counting those as unverified would
 * make a fully checked shot cartridge read as four fifths done for ever.
 *
 * The verdicts are data kept with the records upstream (BallisticViz `data/verifications.json`)
 * and merged into these annotations at build time; the site only reads them.
 */
function verifications(record, svg, drawings) {
  const notes = record.annotations ?? {};
  const held = notes.verified ?? {};
  const drawn = (subject) => (drawings ?? []).some((drawing) => drawing.subject === subject);

  const verified = {};
  const cast = (facet, verdict) => {
    verified[facet] = verdict;
  };

  // Both sides of the sheet are always published, so both can always be proofread.
  cast('cartridge', notes.confidence === 'verified');
  cast('chamber', held.chamber === true);
  if (svg || drawn('cartridge')) cast('cartridgeDrawing', held.cartridgeDrawing === true);
  if (drawn('chamber')) cast('chamberDrawing', held.chamberDrawing === true);
  // The nose form is a property of the bullet the record dimensions; 32 records dimension none.
  if (notes.defaultBullet) cast('bullet', notes.defaultBullet.verified === true);
  return { verified };
}

const entries = [];
/**
 * Which drawing directories a record actually claimed.
 *
 * A directory under `svg/<family>/` is named for a record, and one that names no record is a
 * mistake worth hearing about rather than a folder that quietly does nothing -- a key misspelled,
 * or a cartridge filed under the wrong family. Excluded records claim theirs too: they are left
 * out of the site deliberately, and their drawings are not orphans.
 */
const claimed = new Set();
for (const family of families) {
  const files = (await readdir(join(RECORDS, family))).filter((name) => name.endsWith('.json'));
  for (const file of files.sort()) {
    if (file.slice(0, -5) in EXCLUDE) {
      claimed.add(`${family}/${file.slice(0, -5)}`);
      continue;
    }
    const record = JSON.parse(await readFile(join(RECORDS, family, file), 'utf8'));
    const cartridge = record.cartridge ?? {};
    const size = sizes.get(`${record.family}/${record.key}`) ?? null;
    // The card's extent is the object alone, as it always was; the whole page comes along as
    // `sheet` for the faces that show the dimensions. Both in millimetres, off the file.
    const svg = size?.tight ?? null;
    const sheet = size?.svg ?? null;
    // Every drawing shipped for this cartridge -- of the cartridge or of its chamber, visual or
    // technical, at each published hull length where it has several. See `cartridgeDrawings`;
    // absent from the index wherever there is only the one drawing to show.
    const held = `${record.family}/${record.key}`;
    claimed.add(held);
    const shippedDrawings = cartridgeDrawings(
      record,
      extra.get(held),
      size ? { file: `${record.key}.svg`, tokens: [], ...size } : null
    );
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
      // The size of the drawing shipped for this cartridge, in millimetres, or null where there is
      // none. `shape` is the fallback the card draws itself; see below for what it does not carry.
      svg,
      ...(sheet && sheet !== svg ? { sheet } : {}),
      ...(shippedDrawings ? { drawings: shippedDrawings } : {}),
      shape: shape(record),
      // What a person has proofread, facet by facet, and what only applies where it applies; see
      // `verifications`. The list filters and sorts on these and the cartridge page names them.
      ...verifications(record, svg, shippedDrawings),
      // How many plausibility rules fired on the record, and how many of those nothing explains.
      // From the dataset's own annotations (see cartridges/README.md); the cartridge page lists
      // what each finding is. A record can be fully verified and still carry an explained one.
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

for (const held of extra.keys()) {
  if (!claimed.has(held)) {
    console.warn(`  svg/${held}/ holds drawings for no record of that key in that family`);
  }
}

entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(entries), 'utf8');

const bytes = Buffer.byteLength(JSON.stringify(entries));
const shipped = entries.flatMap((entry) => entry.drawings ?? []);
const kinds = new Map();
for (const drawing of shipped) {
  const name = drawing.subject;
  kinds.set(name, (kinds.get(name) ?? 0) + 1);
}
console.log(
  `index: ${entries.length} records, ${families.length} families, ${(bytes / 1024).toFixed(1)} KB` +
    ` -- ${sizes.size} with a rendered drawing, ${entries.length - sizes.size} falling back`
);
if (shipped.length) {
  console.log(
    `drawings: ${shipped.length} beyond the one per cartridge, across` +
      ` ${entries.filter((entry) => entry.drawings).length} cartridges -- ` +
      [...kinds].map(([name, n]) => `${n} ${name}`).join(', ')
  );
}
