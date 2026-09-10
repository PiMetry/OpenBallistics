/**
 * Which drawing answers what the reader asked for, and at what size.
 *
 * A cartridge is drawn along three axes - subject, style and published length - and the page
 * lets the reader move along each. Choosing from what is actually drawn is arithmetic over the
 * dataset, not presentation, so it lives here rather than in the page that used to hold it.
 *
 * Lifted from `routes/Cartridge.svelte` unchanged, except for `fitScale`: it read the panel width
 * and viewport height straight off the component, and now takes them, because a library may not
 * reach into a page's state.
 *
 * What stayed behind is what needs the reader's language - `describe`, `missingNote` - and the
 * remembered zoom, which needs the browser's storage.
 */

import { main, SUBJECTS } from './drawings';
import type { Drawing, DrawingSubject, Entry, Record_ } from './types';

/** A published hull length, and the marking the sheet prints against it. */
export type Hull = { l: number; marking: string | null };

/** What names a length on the page: the marking the sheet prints, or the length itself. */
export function tag(row: { l?: number; marking?: string | null }): string | null {
  if (row.marking) return row.marking;
  return row.l === undefined ? null : `${row.l}`;
}

/**
 * The published hull lengths, where there is a choice to make.
 *
 * One length is not a choice; a cartridge published at one is drawn and tabulated as one, and
 * `null` is what tells the page not to offer a control.
 */
export function hullLengths(data: Record_): Hull[] | null {
  const lengths = data.cartridge?.lengths;
  if (!Array.isArray(lengths)) return null;
  const rows = lengths
    .map((row) => ({
      l: Number(row.l),
      marking: typeof row.marking === 'string' ? row.marking : null
    }))
    .filter((row) => Number.isFinite(row.l));
  return rows.length > 1 ? rows : null;
}

/**
 * The length the page opens at: the one the cartridge's own drawing is at, so that opening a card
 * does not change the picture the reader just clicked. With no drawing to go by, the longest
 * published length, which is the one the list already sorts and filters this cartridge by.
 */
export function defaultLength(rows: Hull[], entry: Entry | undefined): string {
  const own = main(entry);
  return (own && tag(own)) ?? tag(rows.reduce((a, b) => (b.l > a.l ? b : a)))!;
}

/**
 * The drawing to show for what the reader asked for - which is not always what they asked for,
 * because a kind may be drawn at some lengths and not at others.
 *
 * Preference runs subject first: a reader looking at chambers wants a chamber, and a cartridge is
 * not a near miss for one. Then the length; where the asked-for length is undrawn the nearest one
 * stands in.
 */
export function resolve(
  drawn: Drawing[],
  subject: DrawingSubject,
  length: string | null,
  want: number | null
): Drawing | null {
  if (!drawn.length) return null;
  const miss = (plate: Drawing) =>
    (plate.subject === subject ? 0 : 100) +
    (length !== null && tag(plate) !== null && tag(plate) !== length ? 10 : 0);
  const distance = (plate: Drawing) =>
    want !== null && plate.l !== undefined ? Math.abs(plate.l - want) : 0;
  return [...drawn].sort((a, b) => miss(a) - miss(b) || distance(a) - distance(b))[0] ?? null;
}

/**
 * The drawings shown side by side: one per subject the dataset actually draws.
 *
 * They are drawn at one scale and hung from one left edge, which is what makes the comparison
 * work, and they pan together for the same reason.
 */
export function panels(drawn: Drawing[], length: string | null, want: number | null): Drawing[] {
  const out: Drawing[] = [];
  for (const subject of SUBJECTS) {
    if (!drawn.some((plate) => plate.subject === subject)) continue;
    const plate = resolve(drawn, subject, length, want);
    if (plate) out.push(plate);
  }
  return out;
}

/**
 * The scale a drawing opens at.
 *
 * Life size is the point of the page and is what a drawing should open at whenever the column can
 * hold it, so fit never *enlarges*: it is `pxPerMm` with room to spare, and otherwise the largest
 * whole drawing that fits, bounded by the column's width and a little under two thirds of the
 * window's height. A pair shares one scale.
 *
 * `panelWidth` of 0 means the column has not been measured yet, and life size is the right answer
 * until it has been.
 */
export function fitScale(
  widest: number,
  tallest: number,
  panelWidth: number,
  viewportHeight: number,
  pxPerMm: number
): number {
  if (!panelWidth) return pxPerMm;
  return Math.min(pxPerMm, panelWidth / tallest, (viewportHeight * 0.62) / widest);
}
