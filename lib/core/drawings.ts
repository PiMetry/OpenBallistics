/**
 * Which of a cartridge's drawings to show.
 *
 * A cartridge is not one picture. It is drawn along three axes - of itself or of the chamber it
 * is fired in, rendered or dimensioned, and at each published hull length where it has several --
 * and both the grid and the cartridge page have to pick one from that list. The picking is here,
 * framework-free, so the two agree: a reader who sets the grid to dimensioned drawings and opens
 * a card should land on a dimensioned drawing.
 *
 * What each drawing is *called*, and which style the reader last chose, are not here: a label
 * needs the reader's language and the preference needs the browser's storage. Both live in the
 * app layer, in `site/src/lib/drawings.ts`.
 */

import type { Drawing, DrawingStyle, DrawingSubject, Entry } from './types';

export const SUBJECTS: DrawingSubject[] = ['cartridge', 'chamber'];
export const STYLES: DrawingStyle[] = ['visual', 'technical'];

/**
 * Every drawing this cartridge has.
 *
 * The index carries the list only where there is more than one; where there is not, the
 * cartridge's own `<key>.svg` is the list, so that everything downstream has one thing to reason
 * about instead of two.
 */
export function plates(entry: Entry | undefined): Drawing[] {
  if (entry?.drawings?.length) return entry.drawings;
  if (entry?.svg) {
    return [
      {
        file: `${entry.key}.svg`,
        svg: entry.sheet ?? entry.svg,
        tight: entry.svg,
        subject: 'cartridge',
        main: true
      }
    ];
  }
  return [];
}

/** The subjects actually drawn, in a fixed order: what a toggle may offer, and nothing more. */
export function offered(all: DrawingSubject[], drawn: Drawing[]): DrawingSubject[] {
  return all.filter((value) => drawn.some((plate) => plate.subject === value));
}

/**
 * Which face of a drawing to ask the file for.
 *
 * One file carries four (2026-09-05; see `Drawing`): the fragment picks the style and whether the
 * dimensions are drawn over it. The dimensioned outline is the file's default face and needs no
 * fragment, which keeps a plain link to the file meaning what it always did.
 */
export function face(style: DrawingStyle, dimensions: boolean, dark = false): string {
  if (style === 'visual') {
    // The dimension ink is a navy for paper. The outline faces are lightened on a dark page by a
    // CSS filter, but a filter would turn the brass blue, so the file carries a fifth face with
    // the ink recoloured for a dark ground.
    if (!dimensions) return '#visual';
    return dark ? '#visual-dims-dark' : '#visual-dims';
  }
  return dimensions ? '' : '#plain';
}

/** The extent a face is shown at: the whole page with dimensions, the object alone without. */
export function extent(plate: Drawing, dimensions: boolean): [number, number] {
  return dimensions ? plate.svg : plate.tight;
}

/**
 * The drawing the list shows for this cartridge: `<key>.svg`, or whichever drawing stands at the
 * same length. The build flags it rather than the page working it out - `<key>.svg` is not always
 * the drawing that ends up at its own length, because a drawing filed in the directory at the same
 * length takes its place.
 */
export function main(entry: Entry | undefined): Drawing | null {
  return plates(entry).find((plate) => plate.main) ?? null;
}

/**
 * The one drawing a card shows: the cartridge's own, at its own length.
 *
 * The card's job is a picture of the cartridge, so the subject is never in question here - a
 * chamber on a card would be a picture of a barrel under the name of a round. The style is not a
 * question of which drawing either, since one file carries both; the grid picks the face.
 */
export function card(entry: Entry): Drawing | null {
  return main(entry);
}
