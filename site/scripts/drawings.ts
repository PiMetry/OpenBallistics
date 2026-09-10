/**
 * The drawings each cartridge has, and how large each one is - measured by drawing them.
 *
 * The website renders its own pictures, from the record, in the browser: `src/lib/live.ts` calls
 * `lib/geometry` and `lib/render2d` and gets back markup and the extent it drew at. The index has
 * to carry that extent, because the grid sizes a card's box before the drawing in it exists - the
 * records are fetched only as they scroll into view, and a box that resized on arrival would
 * reflow the page under the reader. A shared scale across a grid needs the same numbers.
 *
 * So the build renders every drawing once, through the same two functions the browser calls, and
 * writes down what came back. Not a stored list of sizes to be kept in step with the renderer:
 * the renderer is asked, and the answer is right by construction. Change the margin around a
 * drawing and the index follows on the next build.
 *
 * What there is to draw is read off the record for the same reason. A cartridge is drawn along
 * three axes and only two of them are a choice of drawing:
 *
 * - **subject**: the cartridge, or the chamber it is fired in. A record has a chamber drawing
 *   when the sheet dimensions a chamber, which is what `profilesFor` reports.
 * - **length**: a shot cartridge is published at several hull lengths (a 12 gauge at nine, from
 *   12/35 to 12/89) and one drawing can only be at one of them, so there is one per length.
 * - **style**: `visual` or `technical`. Not a choice of drawing - one drawing carries both faces
 *   and the page picks between them - so it is not enumerated here.
 *
 * A record that publishes too little to draw is reported by the renderer throwing, and the card
 * falls back to the outline it builds from the dimensions themselves.
 */

import { profilesFor } from '@lib/geometry';
import {
  bulletFromRecord,
  chamberRecordFacts,
  liveBulletDrawing,
  liveChamberDrawing,
  liveDrawing
} from '@lib/render2d';
import { adaptShotshell, type CartridgeRecord, type ShotshellRecord } from '@lib/shapes2d';
import type { Drawing } from '@lib/core';

/** What one drawing measures, in millimetres, both ways round. See `extent` in `lib/core`. */
export interface Sizes {
  /** The whole page: the faces that draw the dimensions over the object need room for them. */
  svg: [number, number];
  /** The object alone, which is what a card in the grid shows. */
  tight: [number, number];
}

/** What a record's drawings come to: the card's own, and the list where there is a choice. */
export interface Measured {
  /** The cartridge's own drawing, object alone, or `null` where it cannot be drawn. */
  svg: [number, number] | null;
  /** The same drawing's whole page, carried separately because the dimensioned faces show it. */
  sheet: [number, number] | null;
  /** Every drawing this cartridge has, or `null` where there is only the one to show. */
  drawings: Drawing[] | null;
}

/**
 * The scale the measuring is done at.
 *
 * The extents come back in millimetres and millimetres do not depend on how many pixels one of
 * them is drawn as, so this only has to be a scale the renderer accepts. The index would be the
 * same at any of them.
 */
const PIXELS_PER_MM = 1;

/** The options `src/lib/live.ts` renders with, so that what is measured is what will be drawn. */
function options(dimensions: boolean) {
  return {
    style: 'visual' as const,
    dimensions,
    pixelsPerMm: PIXELS_PER_MM,
    className: 'plate',
    frame: 'landscape' as const,
    idPrefix: 'm-'
  };
}

type Rendered = { widthMm: number; heightMm: number };

/**
 * A tenth of a micrometre, which is where an extent stops being worth writing down.
 *
 * The renderer answers in binary floating point and every digit of it lands in the index, which
 * every visitor downloads - a full-precision `73.77052593358452` for what is drawn at a tenth of
 * a millimetre on a screen. Rounded here, at a thousandth of the finest line the drawing has.
 */
const PLACES = 4;

function round(value: number): number {
  return Number(value.toFixed(PLACES));
}

/** Draw a thing twice, without its dimensions and with them, and keep only how big it came out. */
function sizes(draw: (dimensions: boolean) => Rendered): Sizes {
  const tight = draw(false);
  const page = draw(true);
  return {
    tight: [round(tight.widthMm), round(tight.heightMm)],
    svg: [round(page.widthMm), round(page.heightMm)]
  };
}

/** A name written the way the dataset spells its keys: lower case, one underscore per gap. */
function slug(text: string): string {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * A shot cartridge: one drawing per published hull length.
 *
 * The gauge names a family and the length names a member of it, so nine drawings of a 12 gauge
 * are nine cartridges and not nine pictures of one. Which of them the card shows is not decided
 * here either - `adaptShotshell` picks a default length when asked for none, and whichever length
 * that is, is the one the card is already showing.
 */
function shotshellDrawings(record: ShotshellRecord): Drawing[] {
  const lengths = record.cartridge?.lengths ?? [];
  const shown = adaptShotshell(record).hull.marking;
  const out: Drawing[] = [];
  for (const row of lengths) {
    if (typeof row.l !== 'number') continue;
    const marking = row.marking ?? null;
    const measured = sizes((dimensions) =>
      liveDrawing(adaptShotshell(record, marking), null, options(dimensions))
    );
    out.push({
      file: `${record.key}/${slug(marking ?? String(row.l))}.svg`,
      ...measured,
      subject: 'cartridge',
      l: row.l,
      marking,
      ...(marking === shown ? { main: true as const } : {})
    });
  }
  return out;
}

/** A metallic cartridge: itself, and the chamber it is fired in where the sheet dimensions one. */
function metallicDrawings(record: CartridgeRecord): Drawing[] {
  const p = profilesFor(record);
  const out: Drawing[] = [
    {
      file: `${record.key}.svg`,
      ...sizes((dimensions) =>
        liveDrawing(p.case, p.bullet, { ...options(dimensions), profile: p.outline })
      ),
      subject: 'cartridge',
      main: true
    }
  ];
  if (p.chamber) {
    const facts = chamberRecordFacts(record);
    out.push({
      file: `${record.key}/chamber.svg`,
      ...sizes((dimensions) =>
        liveChamberDrawing(p.chamber!, record.name, facts, options(dimensions))
      ),
      subject: 'chamber'
    });
  }
  return out;
}

/**
 * Every drawing a record has, measured.
 *
 * The list is carried in the index only where there is a choice to make - another subject, or a
 * length to pick between - so that everything downstream has one thing to reason about instead of
 * two. Where there is one drawing, `svg` is the whole story and `plates` in `lib/core` rebuilds
 * the single-drawing list from it.
 */
export function measure(record: CartridgeRecord | ShotshellRecord): Measured {
  let drawn: Drawing[];
  try {
    drawn =
      record.family === 'shotshell'
        ? shotshellDrawings(record as ShotshellRecord)
        : metallicDrawings(record as CartridgeRecord);
  } catch {
    // The sheet publishes too little to draw: the card falls back to the outline it builds itself.
    return { svg: null, sheet: null, drawings: null };
  }
  const card = drawn.find((plate) => plate.main) ?? null;
  const order = { cartridge: 0, chamber: 1 };
  drawn.sort((a, b) => order[a.subject] - order[b.subject] || (a.l ?? 0) - (b.l ?? 0));
  const many = drawn.filter((plate) => plate.subject === 'cartridge').length > 1;
  return {
    svg: card?.tight ?? null,
    sheet: card?.svg ?? null,
    drawings: drawn.length > 1 || many ? drawn : null
  };
}

/** A catalogue bullet's drawing, measured the way `routes/Bullets.svelte` renders it. */
export function measureBullet(record: unknown): Sizes | null {
  try {
    const data = record as Parameters<typeof bulletFromRecord>[0];
    const { bullet } = bulletFromRecord(data);
    return sizes((dimensions) =>
      liveBulletDrawing(data, bullet, {
        style: 'visual',
        dimensions,
        pixelsPerMm: PIXELS_PER_MM,
        className: 'plate'
      })
    );
  } catch {
    return null;
  }
}
